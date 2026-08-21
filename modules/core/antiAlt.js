// =============================================================
//  antiAlt - HỆ THỐNG CHỐNG ACC CLONE (nhiều tài khoản phụ) FARM TIỀN
//
//  File này là LÕI TÍNH TOÁN THUẦN (không dùng discord.js) để dễ kiểm thử.
//
//  Chiêu thức phổ biến của người cày tiền bằng acc clone:
//    - Tạo hàng loạt acc Discord mới (cùng lúc, tên giống nhau, không ảnh)
//    - Mời tất cả vào server bằng cùng một link mời
//    - Mỗi acc điểm danh / đi làm / câu cá rồi "give" hết xu về acc chính
//    - Các acc này chỉ đánh lệnh, không bao giờ chat với ai
//
//  Vì vậy ta chấm điểm rủi ro theo NHIỀU dấu hiệu độc lập, rồi NỐI các
//  tài khoản có liên hệ thành "cụm" (cluster) bằng thuật toán Union-Find.
//  Chặn theo CỤM mới hiệu quả: chặn lẻ từng acc thì họ tạo acc khác.
//
//  Dấu hiệu và trọng số:
//    newAccount       20  tài khoản Discord mới tinh
//    funnel           22  chỉ chuyển xu đi một chiều về cùng một người
//    behaviour        14  dấu vân hành vi (giờ hoạt động, bộ lệnh) trùng khớp
//    joinBurst        14  vào server cùng lúc với nhiều acc khác
//    sharedInviter    12  cùng một người/link mời vào
//    nameTwin         12  tên gần như giống acc khác (user1, user2, user3...)
//    birthCluster     10  ngày tạo acc sát nhau (cùng đợt tạo)
//    noSocial          8  đánh lệnh nhiều nhưng chưa bao giờ chat
//    defaultAvatar     8  chưa từng đổi ảnh đại diện
// =============================================================
'use strict';

// Mốc thời gian gốc của Discord (2015-01-01). ID Discord chứa sẵn ngày tạo.
const DISCORD_EPOCH = 1420070400000;
const DAY_MS = 24 * 60 * 60 * 1000;

const DEFAULTS = {
  // --- Tuổi tài khoản ---
  ageFullRiskDays: 3, // dưới 3 ngày -> rủi ro tối đa
  ageSafeDays: 45, // từ 45 ngày trở lên -> coi như an toàn

  // --- Vào server cùng đợt ---
  joinBurstWindowMs: 15 * 60 * 1000, // 15 phút
  joinBurstWarn: 3, // 3 acc cùng đợt -> bắt đầu nghi
  joinBurstFull: 8, // 8 acc cùng đợt -> chắc chắn có vấn đề

  // --- Cùng người mời ---
  sharedInviterWarn: 3,
  sharedInviterFull: 10,

  // --- Ngày tạo acc sát nhau ---
  birthWindowMs: 60 * 60 * 1000, // 1 giờ
  birthWarn: 2,
  birthFull: 6,

  // --- Tên giống nhau ---
  nameSimilarWarn: 0.72,
  nameSimilarFull: 0.9,

  // --- Dấu vân hành vi ---
  behaviourWarn: 0.86,
  behaviourFull: 0.97,
  behaviourMinSamples: 25, // mỗi bên cần ít nhất 25 lệnh mới so sánh

  // --- Không giao tiếp ---
  noSocialMinCommands: 25, // đánh 25 lệnh trở lên mà...
  noSocialMaxMessages: 2, // ...chỉ chat dưới 3 câu -> nghi

  // --- Chuyển xu một chiều (funnel) ---
  funnelMinTransfers: 3, // ít nhất 3 lần chuyển
  funnelMinAmount: 1500, // và tổng từ 1.500 xu
  funnelFullTransfers: 8,
  hubMinSenders: 3, // một người nhận xu một chiều từ 3+ acc -> đầu mối

  weights: {
    newAccount: 20,
    funnel: 22,
    behaviour: 14,
    joinBurst: 14,
    sharedInviter: 12,
    nameTwin: 12,
    birthCluster: 10,
    noSocial: 8,
    defaultAvatar: 8,
  },
  // Ngưỡng xử lý
  thresholds: { watch: 34, quarantine: 55, freeze: 76 },
  // Mức độ giảm thu nhập theo từng bậc xử lý
  earnMultiplier: { ok: 1, watch: 0.75, quarantine: 0.35, freeze: 0 },
  // Trần xu một CỤM bị gắt cờ được kiếm mỗi ngày (tính chung cả cụm)
  clusterDailyEarnCap: 25000,
  // Cụm từ bao nhiêu thành viên trở lên mới áp trần chung
  clusterCapMinMembers: 2,
};

const FLAG_LABELS = {
  newAccount: 'tài khoản Discord còn rất mới',
  funnel: 'chỉ chuyển xu một chiều cho cùng một người',
  behaviour: 'dấu vân hành vi trùng khớp với tài khoản khác',
  joinBurst: 'vào máy chủ cùng lúc với nhiều tài khoản khác',
  sharedInviter: 'cùng một người / link mời với nhiều tài khoản khác',
  nameTwin: 'tên gần như trùng với tài khoản khác',
  birthCluster: 'ngày tạo tài khoản sát với tài khoản khác',
  noSocial: 'đánh rất nhiều lệnh nhưng không hề trò chuyện',
  defaultAvatar: 'chưa từng đổi ảnh đại diện',
};

const TIER_LABELS = {
  ok: 'Bình thường',
  watch: 'Theo dõi',
  quarantine: 'Hạn chế',
  freeze: 'Phong toả kinh tế',
};

// =============================================================
//  Tiện ích về ID Discord
// =============================================================

// Lấy mốc thời gian tạo tài khoản từ ID Discord (snowflake).
// Dùng BigInt để không bị tràn số như phép dịch bit trên Number.
function snowflakeToMs(id) {
  const raw = String(id == null ? '' : id).trim();
  if (!/^\d{15,25}$/.test(raw)) return 0;
  try {
    const ms = Number(BigInt(raw) >> 22n) + DISCORD_EPOCH;
    return Number.isFinite(ms) && ms > 0 ? ms : 0;
  } catch {
    return 0;
  }
}

// Tuổi tài khoản theo ngày. Trả null nếu không đọc được ID.
function accountAgeDays(id, now = Date.now()) {
  const born = snowflakeToMs(id);
  if (!born) return null;
  return Math.max(0, (now - born) / DAY_MS);
}

// =============================================================
//  So sánh tên
// =============================================================

// Bỏ dấu tiếng Việt, bỏ ký tự đặc biệt, viết thường.
function normalizeName(name) {
  return String(name == null ? '' : name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

// Bỏ phần số ở cuối tên: 'nam123' -> 'nam'. Dùng để bắt kiểu user1/user2/user3.
function nameStem(name) {
  const n = normalizeName(name);
  const stripped = n.replace(/\d+$/, '');
  return stripped.length >= 3 ? stripped : n;
}

// Khoảng cách Levenshtein (số phép sửa tối thiểu để biến a thành b).
function levenshtein(a, b) {
  const s = String(a == null ? '' : a);
  const t = String(b == null ? '' : b);
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  // Chỉ giữ 2 hàng để tiết kiệm bộ nhớ.
  let prev = new Array(t.length + 1);
  let cur = new Array(t.length + 1);
  for (let j = 0; j <= t.length; j++) prev[j] = j;
  for (let i = 1; i <= s.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    const tmp = prev;
    prev = cur;
    cur = tmp;
  }
  return prev[t.length];
}

// Độ giống nhau của hai tên, 0..1.
// Trùng phần gốc (bỏ số đuôi) được tính là rất giống — đúng kiểu acc clone.
function nameSimilarity(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const sa = nameStem(a);
  const sb = nameStem(b);
  if (sa && sa === sb && sa.length >= 3) return 0.95;

  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 0;
  const ratio = 1 - levenshtein(na, nb) / maxLen;
  return Math.max(0, Math.min(1, ratio));
}

// =============================================================
//  Dấu vân hành vi
// =============================================================

// Độ tương đồng cosine giữa hai vector (0..1). Dùng cho biểu đồ giờ hoạt động.
function cosineSimilarity(a, b) {
  const va = Array.isArray(a) ? a : [];
  const vb = Array.isArray(b) ? b : [];
  const len = Math.max(va.length, vb.length);
  if (!len) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < len; i++) {
    const x = Number(va[i]) || 0;
    const y = Number(vb[i]) || 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na <= 0 || nb <= 0) return 0;
  return Math.max(0, Math.min(1, dot / (Math.sqrt(na) * Math.sqrt(nb))));
}

// Độ trùng của hai tập lệnh (Jaccard: giao / hợp).
function jaccard(a, b) {
  const sa = new Set(Array.isArray(a) ? a : []);
  const sb = new Set(Array.isArray(b) ? b : []);
  if (!sa.size && !sb.size) return 0;
  let inter = 0;
  for (const v of sa) if (sb.has(v)) inter++;
  const union = sa.size + sb.size - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * So dấu vân hành vi của hai tài khoản.
 * @param {object} a { hours:number[24], commands:string[]|object, total:number }
 * @param {object} b như trên
 * @returns {number} 0..1
 */
function behaviourSimilarity(a, b) {
  if (!a || !b) return 0;
  const hourSim = cosineSimilarity(a.hours, b.hours);
  const cmdA = Array.isArray(a.commands) ? a.commands : Object.keys(a.commands || {});
  const cmdB = Array.isArray(b.commands) ? b.commands : Object.keys(b.commands || {});
  const cmdSim = jaccard(cmdA, cmdB);
  // Giờ hoạt động quan trọng hơn danh sách lệnh (ai cũng dùng daily/work).
  return Math.max(0, Math.min(1, hourSim * 0.65 + cmdSim * 0.35));
}

// =============================================================
//  Phân tích dòng tiền
// =============================================================

/**
 * Tìm các tài khoản "phễu" (chỉ chuyển xu đi, không nhận lại) và đầu mối thu xu.
 *
 * @param {Array} edges danh sách { from, to, count, total }
 * @param {object} opts cấu hình (funnelMinTransfers, funnelMinAmount, hubMinSenders)
 * @returns {{funnels:Map, hubs:Map, pairs:Array}}
 *   funnels: userId -> { to, count, total, sentTotal, receivedTotal }
 *   hubs   : userId -> { senders:string[], total }
 */
function analyzeTransfers(edges, opts = {}) {
  const cfg = Object.assign({}, DEFAULTS, opts);
  const list = Array.isArray(edges) ? edges : [];

  const sent = new Map(); // from -> { total, count, targets:Map }
  const received = new Map(); // to -> { total, count, sources:Map }

  for (const e of list) {
    if (!e) continue;
    const from = String(e.from == null ? '' : e.from);
    const to = String(e.to == null ? '' : e.to);
    if (!from || !to || from === to) continue;
    const count = Math.max(0, Math.floor(Number(e.count) || 0));
    const total = Math.max(0, Math.floor(Number(e.total) || 0));
    if (count <= 0) continue;

    if (!sent.has(from)) sent.set(from, { total: 0, count: 0, targets: new Map() });
    const s = sent.get(from);
    s.total += total;
    s.count += count;
    s.targets.set(to, { count, total });

    if (!received.has(to)) received.set(to, { total: 0, count: 0, sources: new Map() });
    const r = received.get(to);
    r.total += total;
    r.count += count;
    r.sources.set(from, { count, total });
  }

  const funnels = new Map();
  const pairs = [];

  for (const [from, s] of sent) {
    // Chỉ xét khi người này chuyển xu cho ĐÚNG MỘT người.
    if (s.targets.size !== 1) continue;
    const to = s.targets.keys().next().value;
    const edge = s.targets.get(to);
    if (edge.count < cfg.funnelMinTransfers) continue;
    if (edge.total < cfg.funnelMinAmount) continue;

    const gotBack = received.get(from);
    const receivedTotal = gotBack ? gotBack.total : 0;
    // Đúng kiểu "phễu": gần như không nhận lại gì (dưới 20% số đã chuyển).
    if (receivedTotal > edge.total * 0.2) continue;

    funnels.set(from, {
      to,
      count: edge.count,
      total: edge.total,
      sentTotal: s.total,
      receivedTotal,
    });
    pairs.push({ from, to, count: edge.count, total: edge.total });
  }

  const hubs = new Map();
  for (const [to, r] of received) {
    const senders = [];
    let total = 0;
    for (const [from, edge] of r.sources) {
      const f = funnels.get(from);
      if (f && f.to === to) {
        senders.push(from);
        total += edge.total;
      }
    }
    if (senders.length >= cfg.hubMinSenders) hubs.set(to, { senders, total });
  }

  return { funnels, hubs, pairs };
}

// =============================================================
//  Union-Find: gom các tài khoản có liên hệ thành cụm
// =============================================================
class UnionFind {
  constructor() {
    this.parent = new Map();
    this.rank = new Map();
  }

  add(x) {
    const k = String(x);
    if (!this.parent.has(k)) {
      this.parent.set(k, k);
      this.rank.set(k, 0);
    }
    return k;
  }

  find(x) {
    let k = this.add(x);
    // Nén đường đi để lần sau tra cứu nhanh hơn.
    const path = [];
    while (this.parent.get(k) !== k) {
      path.push(k);
      k = this.parent.get(k);
    }
    for (const p of path) this.parent.set(p, k);
    return k;
  }

  union(a, b) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return ra;
    const da = this.rank.get(ra) || 0;
    const db = this.rank.get(rb) || 0;
    if (da < db) {
      this.parent.set(ra, rb);
      return rb;
    }
    if (da > db) {
      this.parent.set(rb, ra);
      return ra;
    }
    this.parent.set(rb, ra);
    this.rank.set(ra, da + 1);
    return ra;
  }

  connected(a, b) {
    return this.find(a) === this.find(b);
  }

  // Trả về Map<rootId, string[]> - chỉ gồm các cụm có từ 2 thành viên.
  groups(minSize = 2) {
    const map = new Map();
    for (const k of this.parent.keys()) {
      const root = this.find(k);
      if (!map.has(root)) map.set(root, []);
      map.get(root).push(k);
    }
    const out = new Map();
    for (const [root, members] of map) {
      if (members.length >= minSize) out.set(root, members.sort());
    }
    return out;
  }
}

/**
 * Dựng các cụm từ danh sách liên kết.
 * @param {Array} links [{ a, b, weight?, reason? }]
 * @param {number} minWeight chỉ nối khi đủ mạnh
 */
function buildClusters(links, minWeight = 0) {
  const uf = new UnionFind();
  const reasons = new Map();
  for (const l of Array.isArray(links) ? links : []) {
    if (!l) continue;
    const a = String(l.a == null ? '' : l.a);
    const b = String(l.b == null ? '' : l.b);
    if (!a || !b || a === b) continue;
    const w = Number(l.weight);
    if (Number.isFinite(w) && w < minWeight) continue;
    uf.union(a, b);
    const key = a < b ? a + '|' + b : b + '|' + a;
    if (!reasons.has(key)) reasons.set(key, new Set());
    if (l.reason) reasons.get(key).add(String(l.reason));
  }
  return { uf, groups: uf.groups(2), reasons };
}

// =============================================================
//  Chấm điểm rủi ro
// =============================================================

function ramp(value, low, high) {
  const v = Number(value);
  if (!Number.isFinite(v)) return 0;
  if (low === high) return v >= high ? 1 : 0;
  return Math.max(0, Math.min(1, (v - low) / (high - low)));
}

// Rủi ro theo tuổi tài khoản: càng mới càng cao (1 -> 0).
function ageRisk(ageDays, cfg = DEFAULTS) {
  if (ageDays == null) return 0.25; // không đọc được -> nghi nhẹ
  const full = Number(cfg.ageFullRiskDays) || DEFAULTS.ageFullRiskDays;
  const safe = Number(cfg.ageSafeDays) || DEFAULTS.ageSafeDays;
  if (ageDays <= full) return 1;
  if (ageDays >= safe) return 0;
  return 1 - (ageDays - full) / (safe - full);
}

/**
 * Chấm điểm rủi ro cho một tài khoản.
 *
 * @param {object} f các sự kiện đã quan sát được:
 *   ageDays          : tuổi tài khoản (ngày) hoặc null
 *   defaultAvatar    : boolean
 *   joinBurst        : số acc vào cùng đợt
 *   sharedInviter    : số acc cùng người mời
 *   nameSimilarity   : 0..1
 *   behaviourSimilarity : 0..1
 *   birthCluster     : số acc tạo sát giờ
 *   funnelTransfers  : số lần chuyển xu một chiều
 *   commandCount / messageCount
 * @param {object} options cấu hình ghi đè
 * @returns {{risk:number, tier:string, flags:string[], labels:string[], parts:object}}
 */
function riskScore(f = {}, options = {}) {
  const cfg = Object.assign({}, DEFAULTS, options || {});
  const weights = Object.assign({}, DEFAULTS.weights, cfg.weights || {});
  const thresholds = Object.assign({}, DEFAULTS.thresholds, cfg.thresholds || {});

  const parts = {};
  parts.newAccount = ageRisk(f.ageDays == null ? null : Number(f.ageDays), cfg);
  parts.defaultAvatar = f.defaultAvatar ? 1 : 0;
  parts.joinBurst = ramp(f.joinBurst, cfg.joinBurstWarn, cfg.joinBurstFull);
  parts.sharedInviter = ramp(f.sharedInviter, cfg.sharedInviterWarn, cfg.sharedInviterFull);
  parts.nameTwin = ramp(f.nameSimilarity, cfg.nameSimilarWarn, cfg.nameSimilarFull);
  parts.behaviour = ramp(f.behaviourSimilarity, cfg.behaviourWarn, cfg.behaviourFull);
  parts.birthCluster = ramp(f.birthCluster, cfg.birthWarn, cfg.birthFull);
  parts.funnel = ramp(f.funnelTransfers, cfg.funnelMinTransfers, cfg.funnelFullTransfers);

  const cmdCount = Math.max(0, Number(f.commandCount) || 0);
  const msgCount = Math.max(0, Number(f.messageCount) || 0);
  parts.noSocial = cmdCount >= cfg.noSocialMinCommands && msgCount <= cfg.noSocialMaxMessages ? 1 : 0;

  let total = 0;
  let maxTotal = 0;
  const flags = [];
  for (const key of Object.keys(weights)) {
    const w = Number(weights[key]) || 0;
    const p = Math.max(0, Math.min(1, Number(parts[key]) || 0));
    total += w * p;
    maxTotal += w;
    if (p >= 0.5) flags.push(key);
  }

  const risk = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : 0;
  flags.sort((a, b) => (Number(weights[b]) || 0) * (parts[b] || 0) - (Number(weights[a]) || 0) * (parts[a] || 0));

  let tier = 'ok';
  if (risk >= thresholds.freeze) tier = 'freeze';
  else if (risk >= thresholds.quarantine) tier = 'quarantine';
  else if (risk >= thresholds.watch) tier = 'watch';

  return {
    risk,
    tier,
    tierLabel: TIER_LABELS[tier] || tier,
    flags,
    labels: flags.map((k) => FLAG_LABELS[k] || k),
    parts,
  };
}

// Hệ số thu nhập theo bậc xử lý (1 = bình thường, 0 = không kiếm được xu).
function earnMultiplier(tier, options = {}) {
  const map = Object.assign({}, DEFAULTS.earnMultiplier, (options && options.earnMultiplier) || {});
  const v = Number(map[tier]);
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
}

module.exports = {
  DISCORD_EPOCH,
  DAY_MS,
  DEFAULTS,
  FLAG_LABELS,
  TIER_LABELS,
  snowflakeToMs,
  accountAgeDays,
  normalizeName,
  nameStem,
  levenshtein,
  nameSimilarity,
  cosineSimilarity,
  jaccard,
  behaviourSimilarity,
  analyzeTransfers,
  UnionFind,
  buildClusters,
  ageRisk,
  riskScore,
  earnMultiplier,
  ramp,
};
