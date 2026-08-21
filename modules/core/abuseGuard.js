// =============================================================
//  abuseGuard - LỚP KẾT NỐI HAI HỆ THỐNG CHỐNG GIAN LẬN VÀO BOT
//
//  Đây là nơi duy nhất mà phần còn lại của bot cần gọi tới:
//    guard()         -> gọi trong runner trước khi chạy lệnh
//    after()         -> gọi trong runner sau khi lệnh chạy xong
//    noteMessage()   -> gọi trong messageCreate
//    noteJoin()      -> gọi trong guildMemberAdd
//    checkTransfer() -> gọi trong lệnh give trước khi chuyển xu
//    noteTransfer()  -> gọi trong lệnh give sau khi chuyển xu thành công
//
//  Nguyên tắc an toàn: MọI lỗi ở đây đều "mở của" (cho lệnh chạy).
//  Thà bỏ sót một kẻ gian lận chỉ còn hơn làm cả bot ngừng hoạt động.
//
//  Công tắc bật/tắt là TOÀN CỤC (globalSwitch): chủ bot tắt ở đâu thì
//  mọi máy chủ tắt theo, bật lại cũng vậy. Mặc định: BẬT.
// =============================================================
'use strict';

const Embed = require('./EmbedFactory');
const { colors } = require('./palette');
const gs = require('./globalSwitch');
const store = require('./abuseStore');
const auto = require('./antiAutomation');
const alt = require('./antiAlt');
const captcha = require('./captcha');
const db = require('./Database');

// ---------- Khoá công tắc ----------
const SWITCH_AUTOMATION = 'antiAutomation';
const SWITCH_ALT = 'antiAlt';

gs.register(SWITCH_AUTOMATION, {
  label: 'Chống bot tự động đánh lệnh',
  description: 'Phát hiện macro / autoclicker qua nhịp gõ lệnh, bắt xác minh người thật rồi tăng dần hình thức xử lý.',
  default: true,
});
gs.register(SWITCH_ALT, {
  label: 'Chống acc clone farm xu',
  description: 'Phát hiện cụm tài khoản phụ cùng chủ, chặn chuyển xu một chiều và giới hạn thu nhập theo cụm.',
  default: true,
});

// ---------- Bộ máy phát hiện macro ----------
function engineOptions() {
  const cfg = store.getConfig();
  return {
    minSamples: cfg.autoMinSamples,
    thresholds: { watch: cfg.autoWatch, challenge: cfg.autoChallenge, block: cfg.autoBlock },
  };
}

let engine = new auto.AutomationEngine(engineOptions());

function refreshEngine() {
  try {
    engine.configure(engineOptions());
  } catch {
    engine = new auto.AutomationEngine(engineOptions());
  }
}

// Bật lại hệ thống thì xóa dữ liệu quan sát cũ để không phạt oan
// dựa trên nhịp gõ từ trước lúc bị tắt.
gs.onChange((e) => {
  if (e && e.key === SWITCH_AUTOMATION && e.on) engine = new auto.AutomationEngine(engineOptions());
});

// ---------- Bộ nhớ tạm ----------
const activeCaptcha = new Set(); // ai đang giải câu đố (tránh hiện 2 câu cùng lúc)
const noticeAt = new Map(); // giới hạn tần suất nhắc nhở
const analyzedAt = new Map(); // lần cuối chấm điểm rủi ro
const msgCountedAt = new Map(); // giới hạn đếm tin nhắn
const alertAt = new Map(); // giới hạn báo cho chủ bot

const NOTICE_MS = 25000;
const ANALYZE_MS = 10 * 60 * 1000; // chấm lại rủi ro mỗi 10 phút
const MSG_COUNT_MS = 8000;
const ALERT_MS = 10 * 60 * 1000;
const GRACE_MS = 25 * 60 * 1000; // vừa xác minh xong thì được yên 25 phút
const MAX_CANDIDATES = 60; // số tài khoản tối đa để so sánh (giữ bot luôn nhanh)

let lastClusterBuild = 0;

function throttle(map, key, ms) {
  const now = Date.now();
  if (map.size > 2000) {
    for (const [k, at] of map) if (now - at > ms * 4) map.delete(k);
  }
  const last = map.get(key) || 0;
  if (now - last < ms) return false;
  map.set(key, now);
  return true;
}

// ---------- Tiện ích ----------
function clamp(v, lo, hi) {
  const n = Number(v);
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

// Khoá ngày theo múi giờ Việt Nam (UTC+7) - tính tự lực để không phụ thuộc máy chủ.
function dayKey(at = Date.now()) {
  const t = Number(at);
  const ms = (Number.isFinite(t) ? t : Date.now()) + 7 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

function fmtDuration(ms) {
  const total = Math.max(0, Math.round(Number(ms) || 0) / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const parts = [];
  if (d) parts.push(d + ' ngày');
  if (h) parts.push(h + ' giờ');
  if (m) parts.push(m + ' phút');
  if (!d && !h && s) parts.push(s + ' giây');
  return parts.length ? parts.join(' ') : 'vài giây';
}

function isOwner(client, userId) {
  const owner = client && client.config ? client.config.ownerId : '';
  return Boolean(owner) && String(userId) === String(owner);
}

function isAutomationOn() {
  return gs.isOn(SWITCH_AUTOMATION);
}

function isAltOn() {
  return gs.isOn(SWITCH_ALT);
}

function isEnforced(cfg, command) {
  if (!command) return false;
  const cat = String(command.category || '').toLowerCase();
  const list = Array.isArray(cfg.enforceCategories) ? cfg.enforceCategories : [];
  return list.includes(cat);
}

function walletBalance(userId) {
  try {
    const w = db.getWallet(String(userId));
    const n = Number(w && w.balance);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

async function alertOwner(client, title, description) {
  try {
    const cfg = store.getConfig();
    if (!cfg.notifyOwner) return;
    const ownerId = client && client.config ? client.config.ownerId : '';
    if (!ownerId) return;
    const owner = await client.users.fetch(String(ownerId)).catch(() => null);
    if (!owner) return;
    await owner.send({ embeds: [Embed.custom(colors.warning, title, description)] }).catch(() => {});
  } catch {
    /* không báo được thì thôi */
  }
}

// ---------- Suy giảm cảnh cáo & hồi điểm tin cậy ----------
function decay(rec, cfg, now) {
  if (rec.autoStrikes > 0 && rec.autoLastStrikeAt > 0) {
    const gone = Math.floor((now - rec.autoLastStrikeAt) / Math.max(60000, cfg.strikeDecayMs));
    if (gone > 0) {
      rec.autoStrikes = Math.max(0, rec.autoStrikes - gone);
      rec.autoLastStrikeAt = now;
    }
  }
  const idleHours = Math.max(0, (now - (rec.last || now)) / 3600000);
  if (idleHours > 0.25) {
    rec.trust = clamp(rec.trust + idleHours * Math.max(0, cfg.trustRecoverPerHour), 0, 100);
  }
  // Hết hạn phạt thì dọn sạch trạng thái.
  if (rec.penaltyUntil && rec.penaltyUntil <= now) {
    rec.penaltyUntil = 0;
    rec.penaltyReason = '';
  }
}

function applyPenalty(rec, cfg, reason, now) {
  rec.autoStrikes = Math.min(99, (rec.autoStrikes || 0) + 1);
  rec.autoLastStrikeAt = now;
  rec.trust = clamp(rec.trust - 22, 0, 100);

  const steps = Array.isArray(cfg.penaltySteps) && cfg.penaltySteps.length ? cfg.penaltySteps : [30 * 60 * 1000];
  // Cảnh cáo đầu tiên chỉ nhắc nhở, từ lần thứ hai mới khoá tạm.
  if (rec.autoStrikes < 2) return { level: 0, until: 0 };

  const idx = clamp(rec.autoStrikes - 2, 0, steps.length - 1);
  const ms = steps[idx];
  rec.penaltyUntil = now + ms;
  rec.penaltyLevel = idx + 1;
  rec.penaltyReason = String(reason || '').slice(0, 160);
  store.bump('penalties');
  return { level: idx + 1, until: rec.penaltyUntil, ms };
}

// =============================================================
//  HỆ THỐNG 2: chấm điểm rủi ro acc clone
// =============================================================

// Tập tài khoản đáng đem ra so sánh (có giới hạn để không làm chậm bot).
function candidateIds(userId, rec, users) {
  const out = new Set();

  // 1) Những người vào cùng máy chủ gần thời điểm với họ.
  for (const gid of rec.guilds || []) {
    for (const j of store.joinsOf(gid)) {
      if (j.u !== userId) out.add(j.u);
      if (out.size >= MAX_CANDIDATES * 2) break;
    }
    if (out.size >= MAX_CANDIDATES * 2) break;
  }

  // 2) Những người đã có liên kết sẵn.
  for (const l of store.links()) {
    if (l.a === userId) out.add(l.b);
    else if (l.b === userId) out.add(l.a);
  }

  // 3) Người trong cùng cụm.
  if (rec.cluster) {
    const c = store.getCluster(rec.cluster);
    if (c) for (const m of c.members) if (m !== userId) out.add(m);
  }

  out.delete(userId);
  // Chỉ giữ những ai thật sự có hồ sơ.
  const list = [];
  for (const id of out) {
    if (users[id]) list.push(id);
    if (list.length >= MAX_CANDIDATES) break;
  }
  return list;
}

// Đếm số tài khoản dùng cùng người mời trong 14 ngày gần đây.
function sharedInviterCount(rec, userId, now) {
  if (!rec.inviter) return 0;
  const window = 14 * 24 * 60 * 60 * 1000;
  const seen = new Set();
  for (const gid of rec.guilds || []) {
    for (const j of store.joinsOf(gid)) {
      if (j.inv && j.inv === rec.inviter && j.u !== userId && now - j.at <= window) seen.add(j.u);
    }
  }
  return seen.size;
}

// Đếm số tài khoản vào máy chủ cùng đợt với người này.
function joinBurstCount(rec, userId, cfg) {
  if (!rec.joinedAt) return 0;
  let best = 0;
  for (const gid of rec.guilds || []) {
    const near = store.recentJoins(gid, cfg.joinBurstWindowMs || alt.DEFAULTS.joinBurstWindowMs, rec.joinedAt);
    const others = new Set();
    for (const j of near) if (j.u !== userId) others.add(j.u);
    if (others.size > best) best = others.size;
  }
  return best;
}

// Phân tích chuyển xu một chiều của riêng một người.
function funnelInfo(userId, cfg) {
  const { sent, received } = store.edgesOf(userId);
  if (sent.length !== 1) return { count: 0, to: '', total: 0 };
  const edge = sent[0];
  const gotBack = received.reduce((a, e) => a + (Number(e.total) || 0), 0);
  if (gotBack > edge.total * 0.2) return { count: 0, to: '', total: 0 };
  const min = Number(cfg.funnelMinTransfers) || alt.DEFAULTS.funnelMinTransfers;
  const minAmount = Number(cfg.funnelMinAmount) || alt.DEFAULTS.funnelMinAmount;
  if (edge.count < min || edge.total < minAmount) return { count: 0, to: '', total: 0 };
  return { count: edge.count, to: edge.to, total: edge.total };
}

/**
 * Chấm điểm rủi ro cho một tài khoản và tạo liên kết nếu phát hiện điểm trùng.
 * @returns {{risk:number, tier:string, flags:string[], labels:string[]}}
 */
function analyzeUser(client, userId, now = Date.now(), extra = {}) {
  const id = String(userId);
  const rec = store.user(id, now);
  const cfg = store.getConfig();
  const users = store.allUsers();

  const altOpts = {
    thresholds: { watch: cfg.altWatch, quarantine: cfg.altQuarantine, freeze: cfg.altFreeze },
  };

  if (!rec.bornAt) rec.bornAt = alt.snowflakeToMs(id);
  const ageDays = rec.bornAt ? Math.max(0, (now - rec.bornAt) / alt.DAY_MS) : null;

  // ---- So với các tài khoản đáng nghi khác ----
  let nameSim = 0;
  let behSim = 0;
  let birthNear = 0;
  const newLinks = [];
  const selfProfile = { hours: rec.hours, commands: Object.keys(rec.cmds || {}) };
  const selfSamples = rec.cmdCount || 0;

  for (const otherId of candidateIds(id, rec, users)) {
    const other = users[otherId];
    if (!other) continue;

    // Tên giống nhau
    if (rec.name && other.name) {
      const sim = alt.nameSimilarity(rec.name, other.name);
      if (sim > nameSim) nameSim = sim;
      if (sim >= (cfg.nameSimilarFull || alt.DEFAULTS.nameSimilarFull)) {
        newLinks.push({ other: otherId, reason: 'ten-giong-nhau', weight: 70 });
      }
    }

    // Dấu vân hành vi
    const minS = alt.DEFAULTS.behaviourMinSamples;
    if (selfSamples >= minS && (other.cmdCount || 0) >= minS) {
      const sim = alt.behaviourSimilarity(selfProfile, { hours: other.hours, commands: Object.keys(other.cmds || {}) });
      if (sim > behSim) behSim = sim;
      if (sim >= alt.DEFAULTS.behaviourFull) {
        newLinks.push({ other: otherId, reason: 'hanh-vi-trung-khop', weight: 75 });
      }
    }

    // Ngày tạo tài khoản sát nhau
    const otherBorn = other.bornAt || alt.snowflakeToMs(otherId);
    if (rec.bornAt && otherBorn && Math.abs(rec.bornAt - otherBorn) <= alt.DEFAULTS.birthWindowMs) {
      birthNear++;
      // Cả hai đều là tài khoản mới + tạo sát giờ + cùng máy chủ -> rất đáng nghi.
      const otherAge = otherBorn ? (now - otherBorn) / alt.DAY_MS : 999;
      if (ageDays != null && ageDays <= 14 && otherAge <= 14) {
        newLinks.push({ other: otherId, reason: 'tao-acc-cung-dot', weight: 55 });
      }
    }
  }

  const sharedInv = sharedInviterCount(rec, id, now);
  const burst = joinBurstCount(rec, id, cfg);
  const funnel = funnelInfo(id, cfg);

  if (funnel.count > 0 && funnel.to) {
    newLinks.push({ other: funnel.to, reason: 'chuyen-xu-mot-chieu', weight: 85 });
  }

  const noAvatar = extra.defaultAvatar === undefined ? Boolean(rec.noAvatar) : Boolean(extra.defaultAvatar);
  rec.noAvatar = noAvatar;

  const verdict = alt.riskScore(
    {
      ageDays,
      defaultAvatar: noAvatar,
      joinBurst: burst,
      sharedInviter: sharedInv,
      nameSimilarity: nameSim,
      behaviourSimilarity: behSim,
      birthCluster: birthNear,
      funnelTransfers: funnel.count,
      commandCount: rec.cmdCount,
      messageCount: rec.msgCount,
    },
    altOpts,
  );

  // Người đã từng xác minh người thật được giảm nhẹ (hạ một phần rủi ro).
  let risk = verdict.risk;
  if (rec.captchaPassed > 0 && rec.captchaFailed === 0) risk = Math.round(risk * 0.85);
  if (rec.msgCount > 60) risk = Math.round(risk * 0.9);
  risk = clamp(risk, 0, 100);

  let tier = 'ok';
  if (risk >= cfg.altFreeze) tier = 'freeze';
  else if (risk >= cfg.altQuarantine) tier = 'quarantine';
  else if (risk >= cfg.altWatch) tier = 'watch';

  const before = rec.riskTier;
  rec.risk = risk;
  rec.riskTier = tier;
  rec.riskFlags = verdict.flags.slice(0, 12);
  store.touch();

  // ---- Lưu liên kết & dựng cụm ----
  let added = false;
  for (const l of newLinks) {
    if (store.addLink(id, l.other, l.reason, l.weight)) added = true;
  }
  if (added) rebuildClusters(true);

  // ---- Báo cho chủ bot khi có tài khoản bị nâng mức ----
  if (tier !== before && (tier === 'quarantine' || tier === 'freeze')) {
    store.bump('altsFlagged');
    store.log('alt', id, `Mức ${tier} (rủi ro ${risk}): ${verdict.labels.slice(0, 3).join('; ')}`);
    if (client && throttle(alertAt, 'alt:' + id, ALERT_MS)) {
      const clusterInfo = rec.cluster ? `\nCụm liên quan: \`${rec.cluster}\`` : '';
      alertOwner(
        client,
        '👥 Phát hiện tài khoản clone đáng nghi',
        `<@${id}> (\`${id}\`)\n**Điểm rủi ro:** ${risk}/100 — mức **${alt.TIER_LABELS[tier] || tier}**\n**Dấu hiệu:** ${
          verdict.labels.slice(0, 5).map((x) => '\n• ' + x).join('') || 'không rõ'
        }${clusterInfo}`,
      );
    }
  }

  analyzedAt.set(id, now);
  return { risk, tier, flags: rec.riskFlags, labels: verdict.labels, parts: verdict.parts };
}

// Chấm lại rủi ro nhưng không quá dày để bot luôn nhẹ.
function maybeAnalyze(client, userId, now, extra) {
  const id = String(userId);
  const last = analyzedAt.get(id) || 0;
  const rec = store.peek(id);
  const stale = now - last > ANALYZE_MS;
  if (!stale && rec) return { risk: rec.risk, tier: rec.riskTier, flags: rec.riskFlags, labels: [] };
  return analyzeUser(client, id, now, extra || {});
}

// Dựng lại các cụm từ toàn bộ liên kết.
function rebuildClusters(force = false) {
  const now = Date.now();
  if (!force && now - lastClusterBuild < 30000) return 0;
  lastClusterBuild = now;
  try {
    const { groups } = alt.buildClusters(store.links(), 50);
    const users = store.allUsers();
    const keep = new Set();

    for (const [root, members] of groups) {
      const valid = members.filter((m) => users[m]);
      if (valid.length < 2) continue;
      const clusterId = 'g' + String(root).slice(-12);
      keep.add(clusterId);
      let score = 0;
      const reasons = new Set();
      for (const m of valid) {
        if (users[m].risk > score) score = users[m].risk;
        users[m].cluster = clusterId;
      }
      for (const l of store.links()) {
        if (valid.includes(l.a) && valid.includes(l.b)) reasons.add(l.reason);
      }
      store.setCluster(clusterId, { members: valid, score, reasons: Array.from(reasons) });
    }

    // Ai không còn thuộc cụm nào thì xoá nhãn cụm.
    const all = store.clusters();
    for (const cid of Object.keys(all)) {
      if (!keep.has(cid) && !all[cid].frozen) store.deleteCluster(cid);
    }
    for (const uid of Object.keys(users)) {
      const cid = users[uid].cluster;
      if (cid && (!all[cid] || !all[cid].members.includes(uid))) {
        if (!keep.has(cid)) users[uid].cluster = '';
      }
    }
    store.touch();
    return keep.size;
  } catch {
    return 0;
  }
}

// ---------- Trần thu nhập theo cụm ----------
function clusterCapInfo(rec, cfg, now = Date.now()) {
  if (!rec || !rec.cluster) return null;
  const c = store.getCluster(rec.cluster);
  if (!c) return null;
  if (c.members.length < (alt.DEFAULTS.clusterCapMinMembers || 2)) return null;
  // Chỉ áp trần cho cụm thực sự đáng nghi.
  if (c.score < cfg.altWatch) return null;
  const key = dayKey(now);
  if (c.earnDay !== key) {
    c.earnDay = key;
    c.earnAmount = 0;
    store.touch();
  }
  const cap = Math.max(0, Number(cfg.clusterDailyEarnCap) || 0);
  if (!cap) return null;
  return { cluster: c, cap, used: c.earnAmount, remaining: Math.max(0, cap - c.earnAmount) };
}

function remainingClusterEarn(userId) {
  const rec = store.peek(userId);
  if (!rec) return null;
  const info = clusterCapInfo(rec, store.getConfig());
  return info ? info.remaining : null;
}

// Cộng số xu vừa kiếm được vào sổ của cụm.
function noteEarn(userId, amount) {
  const gain = Math.max(0, Math.floor(Number(amount) || 0));
  if (!gain) return 0;
  const now = Date.now();
  const rec = store.user(userId, now);
  const key = dayKey(now);
  if (rec.earnDay !== key) {
    rec.earnDay = key;
    rec.earnAmount = 0;
  }
  rec.earnAmount += gain;

  const cfg = store.getConfig();
  const info = clusterCapInfo(rec, cfg, now);
  if (info) {
    info.cluster.earnAmount += gain;
    if (info.cluster.earnAmount > info.cap) store.bump('earningsTrimmed');
  }
  store.touch();
  return gain;
}

// Hệ số thu nhập (để các lệnh muốn dùng có thể giảm tiền thưởng).
function earningMultiplier(userId) {
  if (!isAltOn()) return 1;
  const rec = store.peek(userId);
  if (!rec || rec.trusted) return 1;
  const info = clusterCapInfo(rec, store.getConfig());
  if (info && info.remaining <= 0) return 0;
  return alt.earnMultiplier(rec.riskTier || 'ok');
}

// =============================================================
//  HÀM CHÍNH: gọi trong runner trước khi chạy lệnh
// =============================================================
/**
 * @returns {Promise<{allowed:boolean, track?:object}>}
 */
async function guard(client, command, ctx) {
  try {
    const autoOn = isAutomationOn();
    const altOn = isAltOn();
    if (!autoOn && !altOn) return { allowed: true };
    if (!ctx || !ctx.author || ctx.author.bot) return { allowed: true };
    if (command && (command.ownerOnly || command.bypassAbuseGuard)) return { allowed: true };

    const userId = String(ctx.author.id);
    if (isOwner(client, userId)) return { allowed: true };

    const now = Date.now();
    const cfg = store.getConfig();
    const rec = store.user(userId, now);
    if (rec.trusted) return { allowed: true };

    decay(rec, cfg, now);

    // ---- Cập nhật hồ sơ ----
    const cmdName = String((command && command.name) || '?').toLowerCase();
    rec.last = now;
    rec.cmdCount = Math.min(1e9, (rec.cmdCount || 0) + 1);
    if (ctx.author.username) rec.name = String(ctx.author.username).slice(0, 40);
    if (!rec.bornAt) rec.bornAt = alt.snowflakeToMs(userId);
    rec.noAvatar = !ctx.author.avatar;
    const hour = auto.hourOf(now, 420);
    rec.hours[hour] = (rec.hours[hour] || 0) + 1;
    if (Object.keys(rec.cmds).length < 40 || rec.cmds[cmdName]) {
      rec.cmds[cmdName] = (rec.cmds[cmdName] || 0) + 1;
    }
    if (ctx.guild && ctx.guild.id && !rec.guilds.includes(String(ctx.guild.id))) {
      rec.guilds.push(String(ctx.guild.id));
      if (rec.guilds.length > 12) rec.guilds.shift();
    }
    store.bump('commandsChecked');

    const enforced = isEnforced(cfg, command);

    // ---- 1) Đang bị khoá tạm? ----
    if (rec.penaltyUntil > now && enforced) {
      store.bump('commandsBlocked');
      if (throttle(noticeAt, 'pen:' + userId, NOTICE_MS)) {
        const emb = Embed.custom(
          colors.error,
          '🔒 Tạm khoá các lệnh kiếm xu',
          'Hệ thống chống bot tự động đã tạm khoá các lệnh liên quan đến tiền của bạn.',
        ).addFields(
          { name: '📝 Lý do', value: rec.penaltyReason || 'Có dấu hiệu dùng máy tự động đánh lệnh', inline: false },
          {
            name: '⏳ Còn lại',
            value: `${fmtDuration(rec.penaltyUntil - now)} (<t:${Math.floor(rec.penaltyUntil / 1000)}:R>)`,
            inline: true,
          },
          { name: '🔓 Gỡ sớm', value: 'Dùng lệnh `verify` để xác minh bạn là người thật.', inline: true },
        );
        ctx.reply({ embeds: [emb] }).catch(() => {});
      }
      return { allowed: false };
    }

    // ---- 2) Hệ thống chống acc clone ----
    if (altOn) {
      maybeAnalyze(client, userId, now, { defaultAvatar: rec.noAvatar });

      if (rec.riskTier === 'freeze' && enforced) {
        store.bump('commandsBlocked');
        if (throttle(noticeAt, 'alt:' + userId, NOTICE_MS)) {
          const labels = (rec.riskFlags || []).map((f) => alt.FLAG_LABELS[f] || f).slice(0, 4);
          const emb = Embed.custom(
            colors.error,
            '🚫 Tài khoản bị phong toả kinh tế',
            'Hệ thống chống acc clone đánh giá tài khoản này **rất có khả năng là tài khoản phụ** được tạo để cày xu.',
          ).addFields(
            { name: '📊 Điểm rủi ro', value: `${rec.risk}/100`, inline: true },
            { name: '🔎 Dấu hiệu', value: labels.length ? labels.map((x) => '• ' + x).join('\n') : 'Không rõ', inline: false },
            {
              name: '🛠️ Làm gì tiếp?',
              value: 'Dùng lệnh `verify` để xác minh, hoặc liên hệ chủ bot nếu bạn bị nhầm.',
              inline: false,
            },
          );
          ctx.reply({ embeds: [emb] }).catch(() => {});
        }
        return { allowed: false };
      }

      // Hết trần xu trong ngày của cả cụm -> ngừng kiếm thêm.
      const capInfo = clusterCapInfo(rec, cfg, now);
      if (capInfo && capInfo.remaining <= 0 && enforced) {
        store.bump('commandsBlocked');
        if (throttle(noticeAt, 'cap:' + userId, NOTICE_MS)) {
          const emb = Embed.custom(
            colors.warning,
            '🧾 Đã đạt trần xu trong ngày',
            'Nhóm tài khoản của bạn đã kiếm đủ số xu tối đa cho hôm nay.',
          ).addFields(
            { name: '🎯 Trần mỗi ngày', value: `${capInfo.cap.toLocaleString('vi-VN')} xu`, inline: true },
            { name: '📅 Đặt lại', value: 'Vào 00:00 giờ Việt Nam', inline: true },
          );
          ctx.reply({ embeds: [emb] }).catch(() => {});
        }
        return { allowed: false };
      }
    }

    // ---- 3) Hệ thống chống bot tự động ----
    if (autoOn) {
      const verdict = engine.observe({
        userId,
        command: cmdName,
        at: now,
        cooldownMs: Math.max(0, Number(command && command.cooldown) || 0) * 1000,
      });
      rec.autoScore = verdict.score;
      rec.autoFlags = verdict.reasons.slice(0, 10);
      store.touch();

      const inGrace = rec.verifiedAt > 0 && now - rec.verifiedAt < GRACE_MS;
      const needAction = verdict.verdict === 'challenge' || verdict.verdict === 'block';

      if (verdict.verdict === 'watch') {
        rec.trust = clamp(rec.trust - 1, 0, 100);
      } else if (needAction && (enforced || verdict.verdict === 'block') && !inGrace) {
        const reasonText = verdict.labels.slice(0, 3).join('; ') || 'nhịp gõ lệnh bất thường';

        // Đã có câu đố đang chờ -> chể chặn, không hiện thêm câu nữa.
        if (activeCaptcha.has(userId)) return { allowed: false };

        if (cfg.captchaEnabled) {
          activeCaptcha.add(userId);
          rec.captchaIssued = (rec.captchaIssued || 0) + 1;
          rec.captchaLastAt = now;
          store.bump('captchaIssued');
          store.touch();

          let res = { ok: false, reason: 'error', ms: 0 };
          try {
            res = await captcha.challenge(ctx, {
              timeoutMs: cfg.captchaTimeoutMs,
              minAnswerMs: cfg.captchaMinAnswerMs,
              reasonText,
              deleteAfterMs: 20000,
            });
          } finally {
            activeCaptcha.delete(userId);
          }

          if (res.ok) {
            rec.captchaPassed = (rec.captchaPassed || 0) + 1;
            rec.captchaPassAt = now;
            rec.verifiedAt = now;
            rec.trust = clamp(rec.trust + 18, 0, 100);
            rec.autoStrikes = Math.max(0, (rec.autoStrikes || 0) - 1);
            store.bump('captchaPassed');
            store.log('captcha', userId, `Vượt xác minh sau ${(res.ms / 1000).toFixed(2)}s (điểm nghi ${verdict.score})`);
            // Xóa dữ liệu quan sát cũ để cần bằng chứng MỚI nếu muốn phạt tiếp.
            engine.reset(userId);
            store.touch();
            return { allowed: true, track: buildTrack(rec, cfg, userId, altOn, enforced) };
          }

          // Trượt xác minh
          rec.captchaFailed = (rec.captchaFailed || 0) + 1;
          store.bump('captchaFailed');
          if (res.reason !== 'error') {
            const why =
              res.reason === 'too_fast'
                ? 'trả lời nhanh hơn sức con người'
                : res.reason === 'timeout'
                  ? 'không trả lời câu đố'
                  : 'trả lời sai câu đố';
            const pen = applyPenalty(rec, cfg, `Trượt xác minh người thật (${why})`, now);
            store.log('automation', userId, `Trượt xác minh (${why}), cảnh cáo ${rec.autoStrikes}, điểm nghi ${verdict.score}`);
            if (pen.level >= 3 && client && throttle(alertAt, 'auto:' + userId, ALERT_MS)) {
              alertOwner(
                client,
                '🤖 Phát hiện người chơi dùng máy tự động',
                `<@${userId}> (\`${userId}\`)\n**Điểm nghi:** ${verdict.score}/100\n**Dấu hiệu:**${
                  verdict.labels.slice(0, 5).map((x) => '\n• ' + x).join('') || ' không rõ'
                }\n**Cảnh cáo:** ${rec.autoStrikes} — đang khoá ${fmtDuration(pen.ms || 0)}`,
              );
            }
          }
          store.bump('commandsBlocked');
          store.touch();
          return { allowed: false };
        }

        // Không bật câu đố -> phạt trực tiếp theo bậc.
        const pen = applyPenalty(rec, cfg, `Dấu hiệu dùng máy tự động: ${reasonText}`, now);
        store.log('automation', userId, `Điểm nghi ${verdict.score}: ${reasonText}`);
        store.bump('commandsBlocked');
        if (throttle(noticeAt, 'auto:' + userId, NOTICE_MS)) {
          const emb = Embed.custom(
            colors.error,
            '🤖 Phát hiện dùng máy tự động',
            'Cách bạn gõ lệnh giống máy tự động nên lệnh này bị tạm chặn.',
          ).addFields(
            { name: '🔎 Dấu hiệu', value: reasonText, inline: false },
            { name: '📊 Điểm nghi', value: `${verdict.score}/100`, inline: true },
            { name: '⏳ Tạm khoá', value: pen.level ? fmtDuration(pen.ms) : 'Chưa khoá (cảnh cáo)', inline: true },
          );
          ctx.reply({ embeds: [emb] }).catch(() => {});
        }
        store.touch();
        return { allowed: false };
      }
    }

    return { allowed: true, track: buildTrack(rec, cfg, userId, altOn, enforced) };
  } catch (err) {
    // LỖI HỆ THỐNG KHÔNG ĐƯỢC CHẶN NGƯỜI CHƠI.
    if (client && client.logger && client.logger.error) {
      client.logger.error('Lỗi hệ thống chống gian lận: ' + (err && err.stack ? err.stack : err));
    }
    return { allowed: true };
  }
}

// Chỉ theo dõi số xu khi thật sự cần (cụm đáng nghi + lệnh kiếm tiền).
function buildTrack(rec, cfg, userId, altOn, enforced) {
  if (!altOn || !enforced) return null;
  if (!clusterCapInfo(rec, cfg)) return null;
  return { userId, before: walletBalance(userId) };
}

// =============================================================
//  Gọi sau khi lệnh chạy xong: ghi số xu vừa kiếm được vào sổ của cụm
// =============================================================
function after(client, command, ctx, track) {
  try {
    if (!track || !track.userId) return;
    const delta = walletBalance(track.userId) - Number(track.before || 0);
    if (delta > 0) noteEarn(track.userId, delta);
  } catch {
    /* bỏ qua */
  }
}

// =============================================================
//  Ghi nhận tin nhắn thường (dấu hiệu người thật có giao tiếp)
// =============================================================
function noteMessage(client, message) {
  try {
    if (!isAltOn() && !isAutomationOn()) return;
    if (!message || !message.author || message.author.bot) return;
    const userId = String(message.author.id);
    if (isOwner(client, userId)) return;
    if (!throttle(msgCountedAt, userId, MSG_COUNT_MS)) return;
    const rec = store.peek(userId);
    // Chỉ đếm cho người đã từng dùng lệnh -> không tạo hồ sơ cho cả máy chủ.
    if (!rec) return;
    rec.msgCount = Math.min(1e9, (rec.msgCount || 0) + 1);
    rec.last = Date.now();
    store.touch();
  } catch {
    /* bỏ qua */
  }
}

// =============================================================
//  Ghi nhận thành viên mới vào máy chủ
// =============================================================
function noteJoin(client, member, inviterId = '') {
  try {
    if (!isAltOn()) return null;
    if (!member || !member.guild || !member.user || member.user.bot) return null;
    const userId = String(member.id);
    if (isOwner(client, userId)) return null;

    const now = Date.now();
    const rec = store.user(userId, now);
    rec.joinedAt = now;
    rec.bornAt = rec.bornAt || alt.snowflakeToMs(userId);
    rec.noAvatar = !member.user.avatar;
    if (member.user.username) rec.name = String(member.user.username).slice(0, 40);
    if (inviterId) rec.inviter = String(inviterId);
    const gid = String(member.guild.id);
    if (!rec.guilds.includes(gid)) {
      rec.guilds.push(gid);
      if (rec.guilds.length > 12) rec.guilds.shift();
    }
    store.noteJoin(gid, userId, now, rec.inviter);

    const result = analyzeUser(client, userId, now, { defaultAvatar: rec.noAvatar });
    store.prune(now);
    return result;
  } catch (err) {
    if (client && client.logger && client.logger.error) {
      client.logger.error('Lỗi ghi nhận thành viên mới (chống clone): ' + (err && err.message ? err.message : err));
    }
    return null;
  }
}

// =============================================================
//  Kiểm tra trước khi cho chuyển xu (dùng trong lệnh give)
// =============================================================
/**
 * @returns {{ok:boolean, title?:string, reason?:string}}
 */
function checkTransfer(client, fromId, toId, amount) {
  try {
    const autoOn = isAutomationOn();
    const altOn = isAltOn();
    if (!autoOn && !altOn) return { ok: true };

    const from = String(fromId);
    const to = String(toId);
    if (!from || !to || from === to) return { ok: true };
    if (isOwner(client, from)) return { ok: true };

    const now = Date.now();
    const cfg = store.getConfig();
    const rec = store.user(from, now);
    if (rec.trusted) return { ok: true };

    // Đang bị khoá vì dùng máy tự động.
    if (autoOn && rec.penaltyUntil > now) {
      store.noteTransfer(from, to, amount, true);
      return {
        ok: false,
        title: '🔒 Đang bị tạm khoá',
        reason: `Tài khoản của bạn đang bị tạm khoá các lệnh tiền thêm **${fmtDuration(
          rec.penaltyUntil - now,
        )}** vì có dấu hiệu dùng máy tự động.\nDùng lệnh \`verify\` để xác minh và gỡ sớm.`,
      };
    }

    if (!altOn) return { ok: true };

    // Tài khoản quá mới không được chuyển xu (chặn đúng khâu tạo acc rồi dệ xu).
    const minDays = Math.max(0, Number(cfg.minAccountAgeDaysForTransfer) || 0);
    if (minDays > 0) {
      const born = rec.bornAt || alt.snowflakeToMs(from);
      if (born) {
        const ageDays = (now - born) / alt.DAY_MS;
        if (ageDays < minDays) {
          store.noteTransfer(from, to, amount, true);
          return {
            ok: false,
            title: '🆕 Tài khoản còn quá mới',
            reason: `Tài khoản Discord của bạn mới **${ageDays.toFixed(
              1,
            )} ngày**. Cần ít nhất **${minDays} ngày** mới được chuyển xu cho người khác.\nĐây là bước chống dùng acc clone cày xu.`,
          };
        }
      }
    }

    // Bị phong toả hoặc đang bị hạn chế.
    if (rec.riskTier === 'freeze' || rec.riskTier === 'quarantine') {
      store.noteTransfer(from, to, amount, true);
      const labels = (rec.riskFlags || []).map((f) => alt.FLAG_LABELS[f] || f).slice(0, 3);
      return {
        ok: false,
        title: '🚫 Không được chuyển xu',
        reason: `Tài khoản của bạn đang ở mức **${
          alt.TIER_LABELS[rec.riskTier] || rec.riskTier
        }** (điểm rủi ro ${rec.risk}/100) nên tính năng chuyển xu bị tạm tắt.${
          labels.length ? '\n**Dấu hiệu:** ' + labels.join('; ') : ''
        }\nDùng lệnh \`verify\` để xác minh.`,
      };
    }

    // Chuyển xu giữa hai tài khoản trong cùng một cụm -> chắc chắn là dệ xu.
    if (cfg.blockIntraClusterTransfer) {
      const other = store.peek(to);
      const sameCluster = rec.cluster && other && other.cluster && rec.cluster === other.cluster;
      const linked = store.links().some((l) => (l.a === from && l.b === to) || (l.a === to && l.b === from));
      if (sameCluster || linked) {
        store.noteTransfer(from, to, amount, true);
        store.log('transfer', from, `Chặn chuyển ${amount} xu sang ${to} (cùng cụm/đã liên kết)`);
        return {
          ok: false,
          title: '🔗 Hai tài khoản bị xác định là cùng một người',
          reason:
            'Hệ thống chống acc clone thấy hai tài khoản này có nhiều điểm trùng khớp (tên, giờ hoạt động, lịch sử chuyển xu...) nên **không cho chuyển xu qua lại**.\nNếu đây là nhầm lẫn, hãy liên hệ chủ bot để được đưa vào danh sách tin cậy.',
        };
      }
    }

    return { ok: true };
  } catch (err) {
    return { ok: true };
  }
}

// Ghi nhận một lần chuyển xu thành công.
function noteTransfer(client, fromId, toId, amount) {
  try {
    if (!isAltOn()) return;
    const from = String(fromId);
    const to = String(toId);
    if (!from || !to || from === to) return;
    store.noteTransfer(from, to, amount, false);

    // Kiểm tra ngay xem đây có phải dòng tiền một chiều kiểu "dệ xu" hay không.
    const cfg = store.getConfig();
    const info = funnelInfo(from, cfg);
    if (info.count > 0 && info.to) {
      if (store.addLink(from, info.to, 'chuyen-xu-mot-chieu', 85)) {
        store.log('transfer', from, `Chuyển xu một chiều ${info.count} lần / ${info.total} xu sang ${info.to}`);
        rebuildClusters(true);
      }
    }
    analyzedAt.delete(from);
    analyzedAt.delete(to);
  } catch {
    /* bỏ qua */
  }
}

// =============================================================
//  Tự xác minh (lệnh verify)
// =============================================================
async function selfVerify(client, ctx) {
  const userId = String(ctx.author.id);
  const now = Date.now();
  const cfg = store.getConfig();
  const rec = store.user(userId, now);

  if (activeCaptcha.has(userId)) {
    return { ok: false, reason: 'busy' };
  }
  activeCaptcha.add(userId);
  rec.captchaIssued = (rec.captchaIssued || 0) + 1;
  rec.captchaLastAt = now;
  store.bump('captchaIssued');

  let res = { ok: false, reason: 'error', ms: 0 };
  try {
    res = await captcha.challenge(ctx, {
      timeoutMs: cfg.captchaTimeoutMs,
      minAnswerMs: cfg.captchaMinAnswerMs,
      reasonText: 'bạn tự yêu cầu xác minh',
      deleteAfterMs: 20000,
    });
  } finally {
    activeCaptcha.delete(userId);
  }

  if (res.ok) {
    rec.captchaPassed = (rec.captchaPassed || 0) + 1;
    rec.captchaPassAt = now;
    rec.verifiedAt = now;
    rec.trust = clamp(rec.trust + 25, 0, 100);
    rec.autoStrikes = Math.max(0, (rec.autoStrikes || 0) - 1);
    rec.penaltyUntil = 0;
    rec.penaltyReason = '';
    rec.penaltyLevel = 0;
    engine.reset(userId);
    store.bump('captchaPassed');
    store.log('captcha', userId, `Tự xác minh thành công sau ${(res.ms / 1000).toFixed(2)}s`);
    store.touch();
    return { ok: true, ms: res.ms, record: rec };
  }

  rec.captchaFailed = (rec.captchaFailed || 0) + 1;
  store.bump('captchaFailed');
  store.touch();
  return { ok: false, reason: res.reason, ms: res.ms, record: rec };
}

// =============================================================
//  Tiện ích cho bảng điều khiển của chủ bot
// =============================================================
function status() {
  const cfg = store.getConfig();
  const sw = {
    automation: gs.getState(SWITCH_AUTOMATION),
    alt: gs.getState(SWITCH_ALT),
  };
  const users = store.allUsers();
  let penalized = 0;
  let flagged = 0;
  let trusted = 0;
  let watched = 0;
  const now = Date.now();
  for (const id of Object.keys(users)) {
    const u = users[id];
    if (u.penaltyUntil > now) penalized++;
    if (u.riskTier === 'quarantine' || u.riskTier === 'freeze') flagged++;
    else if (u.riskTier === 'watch') watched++;
    if (u.trusted) trusted++;
  }
  return {
    switches: sw,
    config: cfg,
    stats: store.stats(),
    counts: {
      profiles: Object.keys(users).length,
      clusters: Object.keys(store.clusters()).length,
      links: store.links().length,
      transfers: store.transferEdges().length,
      penalized,
      flagged,
      watched,
      trusted,
      tracked: engine.size(),
    },
  };
}

function report(userId) {
  const id = String(userId);
  const rec = store.peek(id);
  if (!rec) return null;
  const now = Date.now();
  const live = engine.evaluate(id, now);
  const cluster = rec.cluster ? store.getCluster(rec.cluster) : null;
  const edges = store.edgesOf(id);
  const born = rec.bornAt || alt.snowflakeToMs(id);
  return {
    userId: id,
    name: rec.name,
    trust: rec.trust,
    trusted: rec.trusted,
    ageDays: born ? (now - born) / alt.DAY_MS : null,
    bornAt: born,
    joinedAt: rec.joinedAt,
    cmdCount: rec.cmdCount,
    msgCount: rec.msgCount,
    autoScore: Math.max(rec.autoScore || 0, live.score || 0),
    autoFlags: (live.reasons && live.reasons.length ? live.reasons : rec.autoFlags) || [],
    autoLabels: (live.reasons && live.reasons.length ? live.reasons : rec.autoFlags || []).map(
      (r) => auto.SIGNAL_LABELS[r] || r,
    ),
    autoSamples: live.samples || 0,
    autoDetail: live.detail || {},
    strikes: rec.autoStrikes,
    penaltyUntil: rec.penaltyUntil,
    penaltyReason: rec.penaltyReason,
    risk: rec.risk,
    riskTier: rec.riskTier,
    riskLabels: (rec.riskFlags || []).map((f) => alt.FLAG_LABELS[f] || f),
    captcha: {
      issued: rec.captchaIssued,
      passed: rec.captchaPassed,
      failed: rec.captchaFailed,
      lastAt: rec.captchaLastAt,
    },
    cluster: cluster ? { id: rec.cluster, ...cluster } : null,
    sent: edges.sent,
    received: edges.received,
    earnAmount: rec.earnDay === dayKey(now) ? rec.earnAmount : 0,
    remainingClusterEarn: remainingClusterEarn(id),
  };
}

function setTrusted(userId, on) {
  const rec = store.user(userId);
  rec.trusted = Boolean(on);
  if (rec.trusted) {
    rec.penaltyUntil = 0;
    rec.penaltyLevel = 0;
    rec.penaltyReason = '';
    rec.autoStrikes = 0;
    rec.risk = 0;
    rec.riskTier = 'ok';
    rec.riskFlags = [];
    rec.trust = 100;
    engine.reset(String(userId));
  }
  analyzedAt.delete(String(userId));
  store.log('trust', userId, rec.trusted ? 'Đưa vào danh sách tin cậy' : 'Bỏ khỏi danh sách tin cậy');
  store.flush();
  return rec.trusted;
}

function clearPenalty(userId) {
  const rec = store.user(userId);
  rec.penaltyUntil = 0;
  rec.penaltyLevel = 0;
  rec.penaltyReason = '';
  rec.autoStrikes = 0;
  rec.trust = clamp(rec.trust + 20, 0, 100);
  engine.reset(String(userId));
  store.log('reset', userId, 'Chủ bot gỡ toàn bộ hình thức xử lý');
  store.flush();
  return true;
}

function resetAll() {
  const users = store.allUsers();
  let n = 0;
  for (const id of Object.keys(users)) {
    const u = users[id];
    if (u.penaltyUntil || u.autoStrikes) n++;
    u.penaltyUntil = 0;
    u.penaltyLevel = 0;
    u.penaltyReason = '';
    u.autoStrikes = 0;
    u.trust = 100;
  }
  engine = new auto.AutomationEngine(engineOptions());
  analyzedAt.clear();
  store.log('reset', '', `Gỡ hình thức xử lý cho ${n} tài khoản`);
  store.flush();
  return n;
}

function linkUsers(a, b) {
  const ok = store.addLink(a, b, 'chu-bot-noi-tay', 100, true);
  rebuildClusters(true);
  store.log('link', a, `Nối tay với ${b}`);
  store.flush();
  return ok;
}

function unlinkUser(userId) {
  const n = store.removeLinks(userId);
  const rec = store.peek(userId);
  if (rec) rec.cluster = '';
  rebuildClusters(true);
  analyzedAt.delete(String(userId));
  store.log('link', userId, `Xoá ${n} liên kết`);
  store.flush();
  return n;
}

function listFlagged(limit = 10) {
  const users = store.allUsers();
  const now = Date.now();
  const list = Object.keys(users)
    .map((id) => ({ id, u: users[id] }))
    .filter((x) => x.u.risk >= store.getConfig().altWatch || x.u.penaltyUntil > now || x.u.autoStrikes > 0)
    .sort((a, b) => b.u.risk + b.u.autoScore - (a.u.risk + a.u.autoScore))
    .slice(0, Math.max(1, Math.min(50, Number(limit) || 10)));
  return list.map((x) => ({
    id: x.id,
    name: x.u.name,
    risk: x.u.risk,
    tier: x.u.riskTier,
    autoScore: x.u.autoScore,
    strikes: x.u.autoStrikes,
    penaltyUntil: x.u.penaltyUntil,
    cluster: x.u.cluster,
    trusted: x.u.trusted,
  }));
}

function listClusters(limit = 10) {
  const all = store.clusters();
  return Object.keys(all)
    .map((id) => ({ id, ...all[id] }))
    .sort((a, b) => b.score - a.score || b.members.length - a.members.length)
    .slice(0, Math.max(1, Math.min(25, Number(limit) || 10)));
}

function setSwitch(key, on, by) {
  const res = gs.set(key, on, by);
  if (res.ok) store.log('switch', by, `${key} -> ${on ? 'BẬT' : 'TẮT'} (toàn bộ máy chủ)`);
  return res;
}

module.exports = {
  SWITCH_AUTOMATION,
  SWITCH_ALT,
  isAutomationOn,
  isAltOn,
  setSwitch,
  guard,
  after,
  noteMessage,
  noteJoin,
  checkTransfer,
  noteTransfer,
  noteEarn,
  earningMultiplier,
  remainingClusterEarn,
  selfVerify,
  analyzeUser,
  rebuildClusters,
  status,
  report,
  setTrusted,
  clearPenalty,
  resetAll,
  linkUsers,
  unlinkUser,
  listFlagged,
  listClusters,
  refreshEngine,
  fmtDuration,
  dayKey,
  store,
  switches: gs,
};
