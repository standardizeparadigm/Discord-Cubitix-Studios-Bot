// =============================================================
//  sanctions - TẦNG VẬN HÀNH CỦA HỆ THỐNG XỬ LÝ
//
//  Ba tầng rõ ràng để dễ bảo trì & không bao giờ sập:
//    sanctionEngine.js  -> LÕI TÍNH: chấm điểm, ra phán quyết (thuần toán)
//    sanctionStore.js   -> KHO LƯU: hồ sơ, án, kháng nghị (thuần dữ liệu)
//    sanctions.js       -> VẬN HÀNH: chặn lệnh, gửi thông báo, báo chủ bot
//
//  Mọi hàm ở đây đều "fail-open": nếu có lỗi thì CHO QUA thay vì chặn oan.
//  Triết lý: thà bỏ sót một kẻ gian hơn là chặn một người chơi thật.
// =============================================================
'use strict';

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const engine = require('./sanctionEngine');
const sstore = require('./sanctionStore');
const gs = require('./globalSwitch');
const { colors, emoji } = require('./palette');

const SWITCH_KEY = 'sanctions';

gs.register(SWITCH_KEY, {
  label: 'Hệ thống xử lý (cảnh cáo / cấm tạm / cấm vĩnh viễn)',
  description:
    'Tự động đánh giá mức độ nghiêm trọng rồi ra án cho người dùng acc clone / bot tự động.',
  default: true,
});

// ---- Chống spam: giới hạn tần suất đánh giá & thông báo ----
const CONSIDER_MS = 90 * 1000; // mỗi người tối đa 1 lần phán quyết / 90 giây
const BLOCK_NOTICE_MS = 60 * 1000; // thông báo "bạn đang bị cấm" tối đa 1 lần / phút
const DM_MS = 30 * 1000; // chống spam tin nhắn riêng
const OWNER_ALERT_MS = 20 * 1000;
const THROTTLE_MAX = 4000; // chống rò rỉ bộ nhớ

const considerAt = new Map();
const blockNoticeAt = new Map();
const dmAt = new Map();
let lastOwnerAlert = 0;
let ticker = null;

// Throttle có tự dọn — KHÔNG để Map phình vô hạn theo thời gian chạy.
function throttle(map, key, ms) {
  const now = Date.now();
  const last = map.get(key) || 0;
  if (now - last < ms) return false;
  map.set(key, now);
  if (map.size > THROTTLE_MAX) {
    for (const [k, v] of map) {
      if (now - v > ms * 4) map.delete(k);
      if (map.size <= THROTTLE_MAX / 2) break;
    }
  }
  return true;
}

function num(v, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
}

function isOn() {
  try {
    return gs.isOn(SWITCH_KEY) && sstore.getConfig().enabled;
  } catch {
    return false;
  }
}

function setSwitch(on, by = '', note = '') {
  try {
    return gs.set(SWITCH_KEY, Boolean(on), by, note);
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : 'Không đổi được công tắc.' };
  }
}

function isOwner(client, userId) {
  try {
    const owner = client && client.config && client.config.ownerId;
    return Boolean(owner && String(owner) === String(userId));
  } catch {
    return false;
  }
}

function fmt(ms) {
  return engine.fmtDuration(ms);
}

function stampRelative(ts) {
  const t = Math.floor(num(ts, 0) / 1000);
  return t > 0 ? `<t:${t}:R>` : 'không rõ';
}

function stampFull(ts) {
  const t = Math.floor(num(ts, 0) / 1000);
  return t > 0 ? `<t:${t}:f>` : 'không rõ';
}

// =============================================================
//  Embed thông báo cho người bị xử lý
// =============================================================
function levelColor(level) {
  if (level === 'ban') return colors.error;
  if (level === 'mute') return colors.orange;
  if (level === 'warn') return colors.warning;
  return colors.info;
}

function buildUserNotice(client, level, info) {
  const cfg = sstore.getConfig();
  const prefix = (client && client.config && client.config.prefix) || 'c';
  const e = new EmbedBuilder()
    .setColor(levelColor(level))
    .setFooter({ text: (client && client.config && client.config.footerText) || 'Cubitix Studios' })
    .setTimestamp();

  if (level === 'warn') {
    e.setTitle('⚠️ Bạn vừa bị cảnh cáo')
      .setDescription(
        'Hệ thống phát hiện dấu hiệu bạn đang **dùng acc phụ hoặc phần mềm tự động** để chơi bot.\n' +
          'Lần này **chưa bị khoá** — bạn vẫn chơi bình thường được. Nhưng hồ sơ đã được ghi lại.',
      );
  } else if (level === 'mute') {
    e.setTitle('⏸️ Bạn bị tạm dừng dùng bot')
      .setDescription(
        `Bạn **không thể dùng các lệnh của bot** trong **${fmt(info.durationMs)}**.\n` +
          `Hết hạn vào ${stampFull(info.until)} (${stampRelative(info.until)}).`,
      );
  } else if (level === 'ban') {
    e.setTitle('⛔ Bạn bị cấm dùng bot vĩnh viễn').setDescription(
      'Hồ sơ của bạn cho thấy việc gian lận **lặp lại nhiều lần** hoặc **bằng chứng rất rõ**.\n' +
        'Bạn sẽ không dùng được bất kỳ lệnh nào của bot nữa.',
    );
  } else {
    e.setTitle('ℹ️ Nhắc nhở từ hệ thống chống gian lận').setDescription(
      'Hoạt động của bạn đang có vài dấu hiệu bất thường. Chưa có hình thức xử lý nào được áp dụng.',
    );
  }

  if (info.reason) e.addFields({ name: 'Lý do', value: String(info.reason).slice(0, 1000) });

  if (Array.isArray(info.labels) && info.labels.length) {
    e.addFields({
      name: 'Dấu hiệu ghi nhận',
      value: info.labels.slice(0, 5).map((x) => '• ' + x).join('\n'),
    });
  }

  if (info.severity != null) {
    e.addFields({
      name: 'Mức độ & độ chắc chắn',
      value: `Nghiêm trọng: **${info.severity}/100**\nĐộ chắc chắn của bằng chứng: **${
        info.confidencePercent != null ? info.confidencePercent : Math.round(num(info.confidence, 0) * 100)
      }%**`,
      inline: true,
    });
  }

  if (info.caseId) e.addFields({ name: 'Mã vụ việc', value: '`' + info.caseId + '`', inline: true });

  if (level === 'warn' && info.nextLevelLabel) {
    e.addFields({
      name: 'Nếu tiếp tục',
      value: `Lần sau sẽ là **${info.nextLevelLabel}**${
        info.nextMuteMs ? ` (khoảng ${fmt(info.nextMuteMs)})` : ''
      }.`,
    });
  }
  if (level === 'mute' && info.mutesLeftBeforeBan != null) {
    e.addFields({
      name: 'Cảnh báo',
      value:
        info.mutesLeftBeforeBan <= 0
          ? 'Lần vi phạm tiếp theo có thể dẫn tới **cấm vĩnh viễn**.'
          : `Còn **${info.mutesLeftBeforeBan}** lần bị cấm tạm nữa là tới mức **cấm vĩnh viễn**.`,
    });
  }

  const help = [];
  if (level !== 'ban') {
    help.push(`• Dùng \`${prefix}verify\` để xem hồ sơ và tự gỡ nghi ngờ.`);
  }
  if (cfg.appealEnabled) {
    help.push(`• Nếu bạn cho rằng mình bị oan, dùng \`${prefix}khangnghi <lý do>\` để gửi đơn cho chủ bot.`);
  }
  help.push('• Chơi bình thường, đừng dùng acc phụ và đừng dùng phần mềm tự động là hồ sơ sẽ tự sạch dần.');
  e.addFields({ name: 'Bạn có thể làm gì', value: help.join('\n') });

  return e;
}

// =============================================================
//  Gửi tin nhắn riêng cho người bị xử lý
// =============================================================
async function dmUser(client, userId, payload) {
  try {
    if (!client || !userId) return false;
    if (!sstore.getConfig().dmNotify) return false;
    if (!throttle(dmAt, String(userId), DM_MS)) return false;
    const user = await client.users.fetch(String(userId)).catch(() => null);
    if (!user) return false;
    await user.send(payload).catch(() => null);
    return true;
  } catch {
    return false;
  }
}

// =============================================================
//  Báo cho chủ bot
// =============================================================
async function alertOwner(client, embed, components) {
  try {
    if (!client || !sstore.getConfig().ownerAlert) return false;
    const ownerId = client.config && client.config.ownerId;
    if (!ownerId) return false;
    const now = Date.now();
    if (now - lastOwnerAlert < OWNER_ALERT_MS) return false;
    lastOwnerAlert = now;
    const owner = await client.users.fetch(String(ownerId)).catch(() => null);
    if (!owner) return false;
    const payload = { embeds: [embed] };
    if (components && components.length) payload.components = components;
    await owner.send(payload).catch(() => null);
    return true;
  } catch {
    return false;
  }
}

function ownerAlertRows(userId) {
  if (!userId) return [];
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`sc:quick:pardon:${userId}`)
        .setLabel('Tha bổng ngay')
        .setEmoji('🕊️')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`sc:quick:immune:${userId}`)
        .setLabel('Miễn trừ vĩnh viễn')
        .setEmoji('🛡️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`sc:quick:ban:${userId}`)
        .setLabel('Cấm vĩnh viễn')
        .setEmoji('⛔')
        .setStyle(ButtonStyle.Danger),
    ),
  ];
}

function buildOwnerAlert(client, verdict, rec, applied) {
  const name = rec && rec.name ? rec.name : verdict.userId;
  const e = new EmbedBuilder()
    .setColor(levelColor(verdict.level))
    .setTitle(`${verdict.levelEmoji || '⚖️'} Hệ thống xử lý: ${verdict.levelLabel}`)
    .setDescription(
      `**Người bị xử lý:** <@${verdict.userId}> \`${verdict.userId}\`` +
        (name && name !== verdict.userId ? `\n**Tên:** ${String(name).slice(0, 60)}` : '') +
        (applied ? '' : '\n⚠️ **Chỉ ghi nhận, chưa thực thi** (đang ở chế độ quan sát).'),
    )
    .setFooter({ text: (client && client.config && client.config.footerText) || 'Cubitix Studios' })
    .setTimestamp();

  e.addFields(
    {
      name: 'Mức nghiêm trọng',
      value: `${verdict.tierEmoji} **${verdict.severity}/100** — ${verdict.tierLabel}`,
      inline: true,
    },
    { name: 'Độ tin cậy', value: `**${verdict.confidencePercent}%**`, inline: true },
    {
      name: 'Thời hạn',
      value: verdict.level === 'ban' ? 'Vĩnh viễn' : verdict.durationMs ? fmt(verdict.durationMs) : 'không',
      inline: true,
    },
  );

  if (verdict.labels && verdict.labels.length) {
    e.addFields({ name: 'Nhóm bằng chứng', value: verdict.labels.map((x) => '• ' + x).join('\n').slice(0, 1000) });
  }
  if (verdict.decisive && verdict.decisive.length) {
    e.addFields({
      name: 'Bằng chứng quyết định',
      value: verdict.decisive.map((x) => '✅ ' + x).join('\n').slice(0, 1000),
    });
  }
  if (verdict.blockers && verdict.blockers.length) {
    e.addFields({
      name: 'Chốt an toàn đã kích hoạt',
      value: verdict.blockers.map((x) => '🛡️ ' + x).join('\n').slice(0, 1000),
    });
  }
  if (rec) {
    e.addFields({
      name: 'Hồ sơ từ trước',
      value:
        `Cảnh cáo: **${rec.counters.warn}** • Cấm tạm: **${rec.counters.mute}** • Cấm vĩnh viễn: **${rec.counters.ban}**` +
        (rec.counters.pardon ? ` • Được tha: **${rec.counters.pardon}**` : ''),
    });
  }
  if (verdict.caseId) e.addFields({ name: 'Mã vụ việc', value: '`' + verdict.caseId + '`' });
  return e;
}

// =============================================================
//  CỔNG CHẶN LỆNH (gọi trên MỌI lệnh, phải cực nhanh)
// =============================================================
/**
 * Kiểm tra người này có được dùng lệnh hay không.
 * @returns {{allowed:boolean, level?:string, payload?:object, silent?:boolean}}
 */
function gate(client, command, ctx) {
  try {
    // Đường siêu nhanh: không có ai bị án thì thoát ngay, không tính toán gì.
    if (!sstore.hasAnyRestriction()) return { allowed: true };
    if (!ctx || !ctx.author || !ctx.author.id) return { allowed: true };

    const userId = String(ctx.author.id);
    if (isOwner(client, userId)) return { allowed: true };

    const now = Date.now();
    const r = sstore.restriction(userId, now);
    if (!r.restricted) return { allowed: true };

    const cfg = sstore.getConfig();

    // Chế độ quan sát hoặc công tắc tắt -> không thực thi, chỉ ghi nhận.
    if (!isOn() || cfg.observeOnly) {
      sstore.bump('observeOnlySkips');
      return { allowed: true };
    }

    // Lệnh cứu trợ (verify, kháng nghị, help...) luôn được dùng.
    const name = command && command.name ? String(command.name).toLowerCase() : '';
    if (name && sstore.isAllowedCommand(name)) return { allowed: true };
    if (command && command.ownerOnly) return { allowed: true };

    sstore.noteBlocked(userId);

    // Chỉ nhắc một lần / phút để không spam kênh chat.
    if (!throttle(blockNoticeAt, userId, BLOCK_NOTICE_MS)) return { allowed: false, level: r.level, silent: true };

    const prefix = (client && client.config && client.config.prefix) || 'c';
    const e = new EmbedBuilder()
      .setColor(levelColor(r.level))
      .setFooter({ text: (client && client.config && client.config.footerText) || 'Cubitix Studios' })
      .setTimestamp();

    if (r.level === 'ban') {
      e.setTitle('⛔ Bạn đã bị cấm dùng bot vĩnh viễn').setDescription(
        (r.reason ? `**Lý do:** ${String(r.reason).slice(0, 400)}\n` : '') +
          (r.at ? `**Thời điểm:** ${stampFull(r.at)}\n` : '') +
          (cfg.appealEnabled
            ? `\nNếu bạn cho rằng mình bị oan, dùng \`${prefix}khangnghi <lý do>\` để gửi đơn cho chủ bot.`
            : '\nHệ thống kháng nghị đang tắt.'),
      );
    } else {
      e.setTitle('⏸️ Bạn đang bị tạm dừng dùng bot').setDescription(
        `Còn lại **${fmt(r.remaining)}** (hết hạn ${stampRelative(r.until)}).\n` +
          (r.reason ? `**Lý do:** ${String(r.reason).slice(0, 400)}\n` : '') +
          (cfg.appealEnabled ? `\nBị oan? Dùng \`${prefix}khangnghi <lý do>\`.` : ''),
      );
    }
    if (r.caseId) e.addFields({ name: 'Mã vụ việc', value: '`' + r.caseId + '`', inline: true });

    return { allowed: false, level: r.level, payload: { embeds: [e] } };
  } catch {
    // Lỗi thì CHO QUA — không bao giờ chặn oan vì bug.
    return { allowed: true };
  }
}

// =============================================================
//  ĐÁNH GIÁ & RA ÁN TỰ ĐỘNG
// =============================================================
/**
 * Hệ thống phát hiện gọi hàm này kèm bằng chứng. Hàm sẽ:
 *   1) gọi engine.judge() để ra phán quyết
 *   2) lưu vụ việc
 *   3) áp án (nếu đủ điều kiện)
 *   4) thông báo người chơi + báo chủ bot
 *
 * @param {object} client
 * @param {object} opts { userId, userName, evidence, reason, source, force }
 * @returns {object|null} phán quyết, hoặc null nếu bỏ qua
 */
async function consider(client, opts = {}) {
  try {
    const userId = String((opts && opts.userId) || '').trim();
    if (!/^\d{5,25}$/.test(userId)) return null;

    const cfg = sstore.getConfig();
    if (!cfg.enabled || !cfg.autoEnabled) return null;
    if (!gs.isOn(SWITCH_KEY)) return null;
    if (isOwner(client, userId)) return null;
    if (sstore.isImmune(userId)) return null;

    const now = Date.now();
    if (!opts.force && !throttle(considerAt, userId, CONSIDER_MS)) return null;

    const rec = sstore.user(userId, now);
    if (opts.userName) sstore.setName(userId, opts.userName);

    // Ghép bằng chứng phát hiện + lịch sử xử lý.
    const evidence = Object.assign({}, opts.evidence || {}, {
      history: sstore.historyEvidence(userId, now),
      immune: rec.immune,
    });

    const verdict = engine.judge(evidence, sstore.engineOptions(), now);
    verdict.userId = userId;
    sstore.noteEvaluation(userId, verdict);

    // Không có án -> chỉ ghi nhận rồi thoát.
    if (verdict.level === 'none' || verdict.level === 'notice') {
      if (verdict.level === 'notice') {
        sstore.recordCase({
          userId,
          userName: rec.name || opts.userName || '',
          level: 'notice',
          severity: verdict.severity,
          confidence: verdict.confidence,
          source: String(opts.source || 'auto'),
          by: 'system',
          reason: verdict.summary,
          labels: verdict.labels,
          decisive: verdict.decisive,
          blockers: verdict.blockers,
          parts: verdict.parts,
          applied: false,
          outcome: 'chỉ nhắc nhở',
        });
      }
      return verdict;
    }

    // Chủ bot tắt tự động ban -> hạ xuống mute.
    if (verdict.level === 'ban' && !cfg.autoBanEnabled) {
      verdict.level = 'mute';
      verdict.levelLabel = engine.LEVEL_LABELS.mute;
      verdict.levelEmoji = engine.LEVEL_EMOJI.mute;
      verdict.durationMs = engine.nextMuteDuration(rec.counters.mute, sstore.engineOptions());
      verdict.blockers.push('Chủ bot đang tắt tính năng tự động cấm vĩnh viễn — chuyển sang cấm tạm.');
    }

    const reason =
      String(opts.reason || '').trim() ||
      (verdict.decisive.length ? verdict.decisive.slice(0, 2).join('; ') : verdict.labels.slice(0, 2).join('; ')) ||
      'Hệ thống phát hiện gian lận tự động';

    const observe = cfg.observeOnly === true;
    const source = String(opts.source || 'auto');

    const kase = sstore.recordCase({
      userId,
      userName: rec.name || opts.userName || '',
      level: verdict.level,
      severity: verdict.severity,
      confidence: verdict.confidence,
      durationMs: verdict.durationMs,
      source,
      by: 'system',
      reason,
      labels: verdict.labels,
      decisive: verdict.decisive,
      blockers: verdict.blockers,
      parts: verdict.parts,
      applied: !observe,
      outcome: observe ? 'chỉ ghi nhận (chế độ quan sát)' : 'thực thi',
    });
    verdict.caseId = kase.id;

    if (observe) {
      sstore.bump('observeOnlySkips');
      sstore.log('info', 'system', `[Quan sát] ${verdict.levelLabel} cho ${userId} — ${verdict.severity}/100.`);
      await alertOwner(client, buildOwnerAlert(client, verdict, rec, false), ownerAlertRows(userId));
      return verdict;
    }

    // ---- Thực thi ----
    let applied = null;
    if (verdict.level === 'warn') {
      applied = sstore.addWarn(userId, {
        by: 'system',
        reason,
        severity: verdict.severity,
        confidence: verdict.confidence,
        source,
        caseId: kase.id,
        now,
        name: opts.userName,
      });
    } else if (verdict.level === 'mute') {
      applied = sstore.addMute(userId, {
        by: 'system',
        reason,
        severity: verdict.severity,
        confidence: verdict.confidence,
        durationMs: verdict.durationMs,
        source,
        caseId: kase.id,
        now,
        name: opts.userName,
      });
      if (applied && applied.ok) verdict.durationMs = applied.durationMs;
    } else if (verdict.level === 'ban') {
      applied = sstore.addBan(userId, {
        by: 'system',
        reason,
        severity: verdict.severity,
        confidence: verdict.confidence,
        source,
        caseId: kase.id,
        now,
        name: opts.userName,
      });
    }

    if (!applied || !applied.ok) {
      verdict.applied = false;
      verdict.applyError = applied && applied.error ? applied.error : 'không áp dụng được';
      return verdict;
    }
    verdict.applied = true;

    sstore.log(
      verdict.level === 'ban' ? 'error' : verdict.level === 'mute' ? 'warn' : 'info',
      'system',
      `${verdict.levelLabel} — ${userId} — ${verdict.severity}/100 (tin ${verdict.confidencePercent}%) — ${reason}`,
    );

    // ---- Thông báo người bị xử lý ----
    const fresh = sstore.peek(userId);
    const notice = buildUserNotice(client, verdict.level, {
      reason,
      labels: verdict.labels,
      severity: verdict.severity,
      confidencePercent: verdict.confidencePercent,
      durationMs: verdict.durationMs,
      until: applied.until,
      caseId: kase.id,
      nextLevelLabel: verdict.nextLevelLabel,
      nextMuteMs: engine.nextMuteDuration(fresh ? fresh.counters.mute : 0, sstore.engineOptions()),
      mutesLeftBeforeBan: Math.max(0, cfg.mutesBeforeBan - (fresh ? fresh.counters.mute : 0)),
    });
    await dmUser(client, userId, { embeds: [notice] });

    // ---- Báo chủ bot ----
    await alertOwner(client, buildOwnerAlert(client, verdict, fresh, true), ownerAlertRows(userId));

    try {
      if (client && client.logger && typeof client.logger.warn === 'function') {
        client.logger.warn(
          `[XỬ LÝ] ${verdict.levelLabel} cho ${userId} — nghiêm trọng ${verdict.severity}/100, tin cậy ${verdict.confidencePercent}%.`,
        );
      }
    } catch {
      /* bỏ qua */
    }

    return verdict;
  } catch (err) {
    try {
      if (client && client.logger && typeof client.logger.error === 'function') {
        client.logger.error('Lỗi hệ thống xử lý: ' + (err && err.message ? err.message : err));
      }
    } catch {
      /* bỏ qua */
    }
    return null;
  }
}

// =============================================================
//  HÀNH ĐỘNG THỦ CÔNG CỦA CHỦ BOT (có gửi thông báo)
// =============================================================
async function manualWarn(client, userId, opts = {}) {
  const res = sstore.addWarn(userId, {
    by: String(opts.by || 'owner'),
    reason: opts.reason,
    severity: opts.severity || 0,
    source: 'manual',
    name: opts.name,
  });
  if (!res.ok) return res;
  const kase = sstore.recordCase({
    userId,
    userName: opts.name || '',
    level: 'warn',
    severity: opts.severity || 0,
    source: 'manual',
    by: String(opts.by || 'owner'),
    reason: opts.reason || '',
    applied: true,
    outcome: 'chủ bot ra án',
  });
  sstore.log('info', String(opts.by || 'owner'), `Cảnh cáo thủ công ${userId}: ${opts.reason || 'không lý do'}`);
  await dmUser(client, userId, {
    embeds: [
      buildUserNotice(client, 'warn', {
        reason: opts.reason || 'Chủ bot cảnh cáo trực tiếp',
        caseId: kase.id,
        nextLevelLabel: engine.LEVEL_LABELS.mute,
        nextMuteMs: engine.nextMuteDuration(res.record.counters.mute, sstore.engineOptions()),
      }),
    ],
  });
  return Object.assign({}, res, { caseId: kase.id });
}

async function manualMute(client, userId, opts = {}) {
  const res = sstore.addMute(userId, {
    by: String(opts.by || 'owner'),
    reason: opts.reason,
    durationMs: opts.durationMs,
    severity: opts.severity || 0,
    source: 'manual',
    name: opts.name,
  });
  if (!res.ok) return res;
  const kase = sstore.recordCase({
    userId,
    userName: opts.name || '',
    level: 'mute',
    severity: opts.severity || 0,
    durationMs: res.durationMs,
    source: 'manual',
    by: String(opts.by || 'owner'),
    reason: opts.reason || '',
    applied: true,
    outcome: 'chủ bot ra án',
  });
  sstore.log('warn', String(opts.by || 'owner'), `Cấm tạm thủ công ${userId} (${fmt(res.durationMs)})`);
  await dmUser(client, userId, {
    embeds: [
      buildUserNotice(client, 'mute', {
        reason: opts.reason || 'Chủ bot ra quyết định trực tiếp',
        durationMs: res.durationMs,
        until: res.until,
        caseId: kase.id,
        mutesLeftBeforeBan: Math.max(0, sstore.getConfig().mutesBeforeBan - res.record.counters.mute),
      }),
    ],
  });
  return Object.assign({}, res, { caseId: kase.id });
}

async function manualBan(client, userId, opts = {}) {
  const res = sstore.addBan(userId, {
    by: String(opts.by || 'owner'),
    reason: opts.reason,
    severity: opts.severity || 0,
    source: 'manual',
    name: opts.name,
  });
  if (!res.ok) return res;
  const kase = sstore.recordCase({
    userId,
    userName: opts.name || '',
    level: 'ban',
    severity: opts.severity || 0,
    source: 'manual',
    by: String(opts.by || 'owner'),
    reason: opts.reason || '',
    applied: true,
    outcome: 'chủ bot ra án',
  });
  sstore.log('error', String(opts.by || 'owner'), `Cấm vĩnh viễn thủ công ${userId}`);
  await dmUser(client, userId, {
    embeds: [
      buildUserNotice(client, 'ban', {
        reason: opts.reason || 'Chủ bot ra quyết định trực tiếp',
        caseId: kase.id,
      }),
    ],
  });
  return Object.assign({}, res, { caseId: kase.id });
}

async function notifyLifted(client, userId, kind, note) {
  const e = new EmbedBuilder()
    .setColor(colors.success)
    .setTitle(`${emoji.success} Án của bạn đã được gỡ`)
    .setDescription(
      kind === 'ban'
        ? 'Lệnh **cấm dùng bot vĩnh viễn** đã được gỡ. Bạn chơi lại bình thường được rồi.'
        : kind === 'mute'
          ? 'Lệnh **tạm dừng dùng bot** đã được gỡ sớm. Bạn chơi lại bình thường được rồi.'
          : kind === 'pardon'
            ? 'Toàn bộ án và cảnh cáo của bạn đã được xoá. Xin lỗi nếu trước đó bạn bị oan!'
            : 'Cảnh cáo của bạn đã được xoá.',
    )
    .setFooter({ text: (client && client.config && client.config.footerText) || 'Cubitix Studios' })
    .setTimestamp();
  if (note) e.addFields({ name: 'Ghi chú từ chủ bot', value: String(note).slice(0, 800) });
  return dmUser(client, userId, { embeds: [e] });
}

async function notifyAppealResult(client, userId, accepted, note) {
  const e = new EmbedBuilder()
    .setColor(accepted ? colors.success : colors.error)
    .setTitle(accepted ? `${emoji.success} Kháng nghị được chấp nhận` : `${emoji.error} Kháng nghị bị từ chối`)
    .setDescription(
      accepted
        ? 'Chủ bot đã xem đơn của bạn và đồng ý gỡ án.'
        : 'Chủ bot đã xem đơn của bạn nhưng giữ nguyên quyết định.',
    )
    .setFooter({ text: (client && client.config && client.config.footerText) || 'Cubitix Studios' })
    .setTimestamp();
  if (note) e.addFields({ name: 'Ghi chú từ chủ bot', value: String(note).slice(0, 800) });
  return dmUser(client, userId, { embeds: [e] });
}

// =============================================================
//  Bị hết hạn cấm tạm -> nhắn cho người chơi biết
// =============================================================
async function runExpiryTick(client) {
  try {
    const done = sstore.collectExpiredMutes(Date.now());
    if (!done.length) return 0;
    const e = new EmbedBuilder()
      .setColor(colors.success)
      .setTitle(`${emoji.success} Bạn đã chơi bot được trở lại`)
      .setDescription(
        'Thời gian tạm dừng đã hết. Chúc bạn chơi vui!\n' +
          'Lưu ý: nếu tiếp tục dùng acc phụ hoặc phần mềm tự động, án lần sau sẽ **dài hơn**.',
      )
      .setFooter({ text: (client && client.config && client.config.footerText) || 'Cubitix Studios' })
      .setTimestamp();
    for (const id of done.slice(0, 25)) {
      // eslint-disable-next-line no-await-in-loop
      await dmUser(client, id, { embeds: [e] });
    }
    return done.length;
  } catch {
    return 0;
  }
}

// Vòng bảo trì định kỳ (gọi 1 lần từ ready.js)
function startTicker(client, intervalMs = 60 * 1000) {
  stopTicker();
  const every = Math.max(15000, num(intervalMs, 60000));
  let pruneCounter = 0;
  ticker = setInterval(() => {
    Promise.resolve(runExpiryTick(client)).catch(() => {});
    pruneCounter++;
    // Dọn hồ sơ cũ mỗi ~60 vòng (1 giờ nếu mỗi vòng 1 phút).
    if (pruneCounter % 60 === 0) {
      try {
        sstore.prune(Date.now());
      } catch {
        /* bỏ qua */
      }
    }
  }, every);
  if (ticker && typeof ticker.unref === 'function') ticker.unref();
  return ticker;
}

function stopTicker() {
  if (ticker) {
    clearInterval(ticker);
    ticker = null;
  }
}

// =============================================================
//  TÓM TẮT CHO BẢNG ĐIỀU KHIỂN
// =============================================================
function status() {
  const cfg = sstore.getConfig();
  const st = sstore.stats();
  return {
    on: isOn(),
    switchOn: gs.isOn(SWITCH_KEY),
    config: cfg,
    stats: st,
    ladder: engine.describeLadder(sstore.engineOptions()),
    presetLabel: sstore.PRESET_LABELS[cfg.preset] || 'Tự chỉnh',
  };
}

// Dự đoán: nếu ra án bây giờ thì sẽ thế nào (không thực thi).
function simulate(userId, evidence, now = Date.now()) {
  const ev = Object.assign({}, evidence || {}, {
    history: sstore.historyEvidence(userId, now),
    immune: sstore.isImmune(userId),
  });
  const verdict = engine.judge(ev, sstore.engineOptions(), now);
  verdict.userId = String(userId || '');
  return verdict;
}

module.exports = {
  SWITCH_KEY,
  isOn,
  setSwitch,
  gate,
  consider,
  simulate,
  status,

  manualWarn,
  manualMute,
  manualBan,
  notifyLifted,
  notifyAppealResult,

  dmUser,
  alertOwner,
  buildUserNotice,
  buildOwnerAlert,
  ownerAlertRows,
  levelColor,

  runExpiryTick,
  startTicker,
  stopTicker,

  store: sstore,
  engine,
  fmtDuration: fmt,
};
