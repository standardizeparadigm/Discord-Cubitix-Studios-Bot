// =============================================================
//  Lệnh: dashboard - TRUNG TÂM ĐIỀU KHIỂN CỦA CHỦ BOT
//
//  Một chị "tổng đài" duy nhất để nhìn và điều khiển mọi thứ:
//    • Tổng quan       — sức khoẻ bot + 3 hệ thống bảo vệ
//    • Công tắt        — bật/tắt từng hệ thống trên toàn bộ máy chủ
//    • Phát hiện       — ai đang bị nghi dùng macro / acc clone
//    • Xử lý          — ai đang bị cảnh cáo / cấm tạm / cấm vĩnh viễn
//    • Máy móc        — RAM, CPU, ping, thời gian chạy
//    • Dữ liệu        — lưu, dọn rác, dựng lại cụm, xuất báo cáo
//    • Nhật ký        — toàn bộ việc đã xảy ra
//
//  Mọi customId đều bắt đầu bằng 'db:' để không đụng bảng khác.
// =============================================================
const os = require('os');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  AttachmentBuilder,
  version: djsVersion,
} = require('discord.js');
const Embed = require('../../core/EmbedFactory');
const { colors } = require('../../core/palette');
const gs = require('../../core/globalSwitch');
const guard = require('../../core/abuseGuard');
const sanctions = require('../../core/sanctions');
const sstore = require('../../core/sanctionStore');
const engine = require('../../core/sanctionEngine');
const maintenance = require('../../core/maintenanceStore');

const PANEL_TIME = 5 * 60 * 1000;

// =============================================================
//  Tiện ích nhỏ
// =============================================================
function num(v, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
}

function stampRel(ms) {
  const n = num(ms, 0);
  if (n <= 0) return 'chưa có';
  return '<t:' + Math.floor(n / 1000) + ':R>';
}

function fmtBytes(bytes) {
  const mb = num(bytes, 0) / 1024 / 1024;
  if (mb >= 1024) return (mb / 1024).toFixed(2) + ' GB';
  return mb.toFixed(1) + ' MB';
}

function fmtUptime(sec) {
  let s = Math.floor(num(sec, 0));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  s = s % 60;
  const parts = [];
  if (d) parts.push(`${d} ngày`);
  if (h) parts.push(`${h} giờ`);
  if (m) parts.push(`${m} phút`);
  parts.push(`${s} giây`);
  return parts.join(' ');
}

function bar(value, max = 100, size = 12) {
  const ratio = Math.min(1, Math.max(0, num(value) / Math.max(1, max)));
  const filled = Math.round(ratio * size);
  return '`' + '\u2588'.repeat(filled) + '\u2591'.repeat(Math.max(0, size - filled)) + '`';
}

function plain(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'D')
    .toLowerCase()
    .trim();
}

const TIER_TEXT = {
  ok: '🟢 Bình thường',
  watch: '🟡 Đang theo dõi',
  quarantine: '🟠 Bị hạn chế',
  freeze: '🔴 Bị phong toả',
};

// =============================================================
//  MÀN HÌNH: TỔNG QUAN
// =============================================================
function renderOverview(client) {
  const ab = guard.status();
  const sa = sanctions.status();
  const mt = maintenance.getState();
  const mem = process.memoryUsage();

  // Đếm bao nhiêu hệ thống bảo vệ đang bật — hiển thị kiểu "3/3".
  const shields = [ab.switches.automation.on, ab.switches.alt.on, sa.on];
  const shieldsOn = shields.filter(Boolean).length;
  const allUp = shieldsOn === shields.length;

  const e = Embed.custom(
    mt.enabled ? colors.warning : allUp ? colors.success : colors.error,
    '🎛️ Trung tâm điều khiển',
    (mt.enabled
      ? '🔧 **Bot đang ở chế độ bảo trì.** Chỉ bạn và người được cho phép mới dùng được lệnh.\n\n'
      : allUp
        ? '✅ **Cả ba lớp bảo vệ đều đang chạy.** Không có gì phải lo.\n\n'
        : `⚠️ **Chỉ còn ${shieldsOn}/3 lớp bảo vệ đang chạy.** Bấm *Bật hết bảo vệ* ở dưới để khôi phục.\n\n`) +
      `Xin chào chủ bot! Đây là toàn bộ tình hình **${client.user ? client.user.tag : 'bot'}** ngay lúc này.`,
  );

  e.addFields(
    {
      name: '🛡️ Ba lớp bảo vệ',
      value:
        `🤖 Chống bot tự động: ${ab.switches.automation.on ? '🟢 Bật' : '🔴 Tắt'}\n` +
        `👥 Chống acc clone: ${ab.switches.alt.on ? '🟢 Bật' : '🔴 Tắt'}\n` +
        `⚖️ Hệ thống xử lý: ${sa.on ? '🟢 Bật' : '🔴 Tắt'}`,
      inline: true,
    },
    {
      name: '🔍 Đang bị nghi',
      value:
        `🔴 Bị phong toả/hạn chế: **${ab.counts.flagged}**\n` +
        `🟡 Đang theo dõi: **${ab.counts.watched}**\n` +
        `⏸️ Đang bị tạm chặn lệnh: **${ab.counts.penalized}**`,
      inline: true,
    },
    {
      name: '⚖️ Đang có án',
      value:
        `🔴 Cấm vĩnh viễn: **${sa.stats.activeBans}**\n` +
        `🟠 Cấm tạm: **${sa.stats.activeMutes}**\n` +
        `🟡 Còn cảnh cáo: **${sa.stats.activeWarnUsers}**`,
      inline: true,
    },
  );

  // Việc cần bạn để ý — để ngay trên cho dễ thấy.
  const todo = [];
  if (sa.stats.pendingAppeals > 0) todo.push(`📬 **${sa.stats.pendingAppeals}** đơn kháng nghị đang chờ bạn xem`);
  if (!ab.switches.automation.on) todo.push('⚠️ Hệ thống chống bot tự động đang **TẮT**');
  if (!ab.switches.alt.on) todo.push('⚠️ Hệ thống chống acc clone đang **TẮT**');
  if (!sa.on) todo.push('⚠️ Hệ thống xử lý đang **TẮT** — không ai bị xử tự động');
  if (sa.config.observeOnly) todo.push('👁️ Đang **chỉ quan sát** — máy ghi nhận nhưng không thi hành án');
  if (mt.enabled) todo.push('🔧 Đang **bảo trì** — người thường không dùng được lệnh');
  if (num(mt.commandList && mt.commandList.length, 0) > 0) todo.push(`🚫 **${mt.commandList.length}** lệnh đang bị khoá riêng`);
  if (ab.counts.flagged > 0) todo.push(`🔍 **${ab.counts.flagged}** tài khoản đang bị hạn chế kinh tế vì nghi clone`);

  e.addFields({
    name: todo.length ? '📌 Việc cần bạn để ý' : '👍 Không có việc gì cần làm',
    value: todo.length ? todo.map((x) => '• ' + x).join('\n').slice(0, 1024) : 'Mọi thứ đang chạy êm. Bạn cứ yên tâm.',
    inline: false,
  });

  e.addFields(
    {
      name: '📊 Số liệu bảo vệ',
      value:
        `Lệnh đã kiểm: **${ab.stats.commandsChecked}** • bị chặn: **${ab.stats.commandsBlocked}**\n` +
        `Phát hiện bot: **${ab.stats.botsDetected}** • acc clone: **${ab.stats.clonesDetected}**\n` +
        `Cuộc chuyển xu bị chặn: **${ab.stats.transfersBlocked}** • cụm: **${ab.counts.clusters}**`,
      inline: true,
    },
    {
      name: '🤖 Máy móc',
      value:
        `Ping: **${client.ws && client.ws.ping >= 0 ? Math.round(client.ws.ping) + 'ms' : 'đang tính'}**\n` +
        `Chạy liên tục: **${fmtUptime(process.uptime())}**\n` +
        `RAM: **${fmtBytes(mem.rss)}**`,
      inline: true,
    },
  );

  e.setFooter({
    text: `${ab.counts.profiles} hồ sơ chống gian lận • ${sstore.userCount()} hồ sơ xử lý • bộ cấu hình: ${sa.presetLabel}`,
  });
  return e;
}

// =============================================================
//  MÀN HÌNH: CÔNG TẮT TOÀN CỤC
// =============================================================
function renderSwitches() {
  const list = gs.list();
  const e = Embed.custom(
    colors.aqua,
    '🔌 Công tắt toàn cục',
    'Mỗi công tắc ảnh hưởng **toàn bộ máy chủ** mà bot đang ở, không riêng máy chủ này. Chọn ở ô bên dưới để bật/tắt.',
  );

  if (!list.length) {
    e.addFields({ name: 'Trống', value: 'Chưa có công tắc nào được đăng ký.', inline: false });
    return e;
  }

  for (const s of list.slice(0, 10)) {
    e.addFields({
      name: `${s.on ? '🟢' : '🔴'} ${s.label}`,
      value:
        `${s.description || 'không có mô tả'}\n` +
        `Trạng thái: **${s.on ? 'BẬT' : 'TẮT'}**` +
        (s.explicit ? ` (bạn tự đặt)` : ` (mặc định: ${s.default ? 'bật' : 'tắt'})`) +
        `\nĐổi lần cuối: ${stampRel(s.changedAt)}${s.changedBy ? ` bởi *${s.changedBy}*` : ''} • tổng **${s.toggles}** lần`,
      inline: false,
    });
  }

  const clr = gs.lastClear();
  if (clr && clr.at) {
    e.setFooter({ text: `Nhật ký công tắc đã xoá ${clr.count} dòng trước đó` });
  }
  return e;
}

// =============================================================
//  MÀN HÌNH: PHÁT HIỆN
// =============================================================
function renderDetect() {
  const ab = guard.status();
  const flagged = guard.listFlagged(10);
  const clusters = guard.listClusters(5);

  const e = Embed.custom(
    flagged.length ? colors.warning : colors.success,
    '🔍 Hai hệ thống phát hiện',
    flagged.length
      ? 'Những tài khoản đáng chú ý nhất hiện tại (điểm nghi cao nhất trước). Điểm cao **không** tự động nghĩa là có tội — hệ thống xử lý sẽ cân đo thêm độ chắc trước khi ra án.'
      : 'Không có tài khoản nào đáng nghi. 👍',
  );

  e.addFields(
    {
      name: '🤖 Chống bot tự động',
      value:
        `Trạng thái: ${ab.switches.automation.on ? '🟢 Bật' : '🔴 Tắt'}\n` +
        `Đang đo nhịp: **${ab.counts.tracked}** người\n` +
        `Thử thách đã phát: **${ab.stats.captchaIssued}** • qua: **${ab.stats.captchaPassed}** • trượt: **${ab.stats.captchaFailed}**`,
      inline: true,
    },
    {
      name: '👥 Chống acc clone',
      value:
        `Trạng thái: ${ab.switches.alt.on ? '🟢 Bật' : '🔴 Tắt'}\n` +
        `Liên kết: **${ab.counts.links}** • cụm: **${ab.counts.clusters}**\n` +
        `Đường chuyển xu đang theo: **${ab.counts.transfers}**`,
      inline: true,
    },
  );

  if (flagged.length) {
    const lines = flagged.map((f, i) => {
      const nowMs = Date.now();
      const pen = f.penaltyUntil > nowMs ? ` ⏸️ bị chặn ${stampRel(f.penaltyUntil)}` : '';
      return (
        `**${i + 1}.** ${f.name || 'không rõ'} (\`${f.id}\`)${f.trusted ? ' ✅' : ''}\n` +
        `    clone **${f.risk}** ${TIER_TEXT[f.tier] || f.tier} • macro **${f.autoScore}** • ${f.strikes} lần vi phạm${pen}`
      );
    });
    e.addFields({ name: '⚠️ Đáng chú ý nhất', value: lines.join('\n').slice(0, 1024), inline: false });
  }

  if (clusters.length) {
    const lines = clusters.map(
      (c, i) =>
        `**${i + 1}.** ${Array.isArray(c.members) ? c.members.length : 0} tài khoản • điểm **${Math.round(num(c.score, 0))}**` +
        (c.reason ? ` • ${String(c.reason).slice(0, 60)}` : ''),
    );
    e.addFields({ name: '🕸️ Cụm acc đáng nghi', value: lines.join('\n').slice(0, 1024), inline: false });
  }

  e.setFooter({ text: 'Mở bảng chi tiết bằng lệnh antiabuse • ra án bằng lệnh xuly' });
  return e;
}

// =============================================================
//  MÀN HÌNH: XỬ LÝ
// =============================================================
function renderSanction() {
  const sa = sanctions.status();
  const now = Date.now();
  const restricted = sstore.listRestricted(now, 8);

  const e = Embed.custom(
    sa.on ? colors.primary : colors.dark,
    '⚖️ Hệ thống xử lý',
    sa.on
      ? `Máy đang cân đo bằng chứng từ hai hệ thống phát hiện rồi quyết định mức: **nhắc nhở → cảnh cáo → cấm tạm → cấm vĩnh viễn**.\nBộ cấu hình: **${sa.presetLabel}**`
      : '⚠️ Đang **tắt**. Án cũ vẫn còn hiệu lực nhưng máy không ra án mới.',
  );

  e.addFields(
    {
      name: '🎯 Ngưỡng',
      value:
        `Nhắc **${sa.config.noticeAt}** • Cảnh cáo **${sa.config.warnAt}**\n` +
        `Cấm tạm **${sa.config.muteAt}** • Cấm hẳn **${sa.config.banAt}**`,
      inline: true,
    },
    {
      name: '🪤 Bậc cấm tạm',
      value: sa.ladder.muteLadderText.join('\n→ '),
      inline: true,
    },
    {
      name: '🔒 Độ chắc tối thiểu',
      value:
        `Cảnh cáo **${Math.round(sa.config.minConfidenceWarn * 100)}%**\n` +
        `Cấm tạm **${Math.round(sa.config.minConfidenceMute * 100)}%**\n` +
        `Cấm hẳn **${Math.round(sa.config.minConfidenceBan * 100)}%**`,
      inline: true,
    },
    {
      name: '📈 Đã xử',
      value:
        `Cảnh cáo **${sa.stats.warnsIssued}** • Cấm tạm **${sa.stats.mutesIssued}** • Cấm hẳn **${sa.stats.bansIssued}**\n` +
        `Máy tự xử **${sa.stats.autoActions}** • Bạn xử **${sa.stats.manualActions}** • Tha **${sa.stats.pardons}**\n` +
        `Lần chấm điểm **${sa.stats.evaluations}** • Lệnh bị chặn **${sa.stats.blockedCommands}**` +
        (sa.stats.observeOnlySkips ? `\nBỏ qua vì chỉ quan sát: **${sa.stats.observeOnlySkips}**` : ''),
      inline: false,
    },
    {
      name: '📬 Kháng nghị',
      value:
        `Đang chờ: **${sa.stats.pendingAppeals}** • Đã nhận: **${sa.stats.appealsFiled}**\n` +
        `Duyệt: **${sa.stats.appealsAccepted}** • Từ chối: **${sa.stats.appealsRejected}** • Miễn trừ: **${sa.stats.immune}**`,
      inline: false,
    },
  );

  if (restricted.length) {
    const lines = restricted.map((x) => {
      const r = x.record;
      const t = x.level === 'ban' ? 'vĩnh viễn' : `còn ${sanctions.fmtDuration(x.until - now)}`;
      return `${engine.LEVEL_EMOJI[x.level] || '⚪'} ${r.name || r.id} (\`${r.id}\`) — ${t}${
        r.appeal && r.appeal.status === 'pending' ? ' 📬' : ''
      }`;
    });
    e.addFields({ name: '🚫 Đang bị cấm', value: lines.join('\n').slice(0, 1024), inline: false });
  }

  e.setFooter({ text: 'Mở bảng đầy đủ (ra án / gỡ án / duyệt đơn) bằng lệnh xuly' });
  return e;
}

// =============================================================
//  MÀN HÌNH: MÁY MÓC
// =============================================================
function renderHealth(client) {
  const mem = process.memoryUsage();
  const cpu = os.cpus() || [];
  const totalMembers = client.guilds ? client.guilds.cache.reduce((a, g) => a + (g.memberCount || 0), 0) : 0;
  const load = os.loadavg ? os.loadavg() : [0, 0, 0];
  const usedMem = os.totalmem() - os.freemem();
  const memPct = Math.round((usedMem / Math.max(1, os.totalmem())) * 100);
  const heapPct = Math.round((mem.heapUsed / Math.max(1, mem.heapTotal)) * 100);

  const e = Embed.custom(colors.info, '🖥️ Sức khoẻ máy móc', 'Số liệu thật của máy đang chạy bot ngay lúc này.');

  e.addFields(
    { name: '🤖 Bot', value: client.user ? client.user.tag : 'chưa rõ', inline: true },
    {
      name: '📡 Ping',
      value: client.ws && client.ws.ping >= 0 ? `${Math.round(client.ws.ping)}ms` : 'đang tính',
      inline: true,
    },
    { name: '⏱️ Chạy liên tục', value: fmtUptime(process.uptime()), inline: true },
    { name: '🌐 Máy chủ', value: String(client.guilds ? client.guilds.cache.size : 0), inline: true },
    { name: '👥 Thành viên', value: totalMembers.toLocaleString('vi-VN'), inline: true },
    { name: '📚 Lệnh', value: String(client.commands ? client.commands.size : 0), inline: true },
    {
      name: '🧠 RAM của bot',
      value: `${fmtBytes(mem.rss)}\nHeap ${bar(heapPct)} ${heapPct}%`,
      inline: false,
    },
    {
      name: '💾 RAM của máy',
      value: `${fmtBytes(usedMem)} / ${fmtBytes(os.totalmem())}\n${bar(memPct)} ${memPct}%`,
      inline: false,
    },
    {
      name: '⚙️ CPU',
      value:
        `${cpu.length ? String(cpu[0].model).trim() : 'không rõ'} (${cpu.length} nhân)\n` +
        `Tải 1/5/15 phút: ${load.map((x) => num(x, 0).toFixed(2)).join(' • ')}`,
      inline: false,
    },
    { name: '🟩 Node.js', value: process.version, inline: true },
    { name: '📦 discord.js', value: 'v' + djsVersion, inline: true },
    { name: '🖥️ Nền tảng', value: `${os.platform()} ${os.arch()}`, inline: true },
  );
  return e;
}

// =============================================================
//  MÀN HÌNH: DỮ LIỆU
// =============================================================
function renderData() {
  const ab = guard.status();
  const e = Embed.custom(
    colors.purple,
    '💾 Dữ liệu & bảo dưỡng',
    'Mọi thứ được lưu trong thư mục `data/` và tự ghi xuống ổ đĩa sau vài giây. Các nút dưới đây dành cho việc bảo dưỡng thủ công — bình thường bạn **không cần** dùng.',
  );

  e.addFields(
    {
      name: '📁 Kho chống gian lận',
      value:
        `Hồ sơ: **${ab.counts.profiles}**\nLiên kết: **${ab.counts.links}**\n` +
        `Cụm: **${ab.counts.clusters}**\nĐường chuyển xu: **${ab.counts.transfers}**`,
      inline: true,
    },
    {
      name: '📁 Kho xử lý',
      value:
        `Hồ sơ: **${sstore.userCount()}**\nVụ việc: **${sstore.stats().cases}**\n` +
        `Đang cấm: **${sstore.stats().activeBans + sstore.stats().activeMutes}**\n` +
        `Đơn chờ: **${sstore.stats().pendingAppeals}**`,
      inline: true,
    },
    {
      name: '🧹 Các nút làm gì?',
      value:
        '• **Lưu ngay** — ghi hết dữ liệu trong bộ nhớ xuống ổ đĩa (nên bấm trước khi tắt bot bằng tay)\n' +
        '• **Dọn rác** — xoá hồ sơ quá cũ không còn dùng, giúp file nhẹ và bot nhanh hơn\n' +
        '• **Dựng lại cụm** — tính lại toàn bộ các cụm acc clone từ đầu\n' +
        '• **Xuất báo cáo** — tải về một file JSON chứa toàn bộ tình hình xử lý để lưu trữ',
      inline: false,
    },
  );
  return e;
}

// =============================================================
//  MÀN HÌNH: NHẬT KÝ
// =============================================================
function renderLog() {
  const swLog = gs.logEntries(8);
  const scLog = sstore.logEntries(10);
  const icon = { info: 'ℹ️', warn: '⚠️', error: '🔴', ok: '✅', reset: '♻️' };

  const e = Embed.custom(colors.dark, '📜 Nhật ký chung', 'Mới nhất ở trên.');

  if (swLog.length) {
    e.addFields({
      name: '🔌 Công tắt toàn cục',
      value: swLog
        .map((x) => `• ${stampRel(x.at)} — ${String(x.text || '').slice(0, 130)}`)
        .join('\n')
        .slice(0, 1024),
      inline: false,
    });
  }
  if (scLog.length) {
    e.addFields({
      name: '⚖️ Hệ thống xử lý',
      value: scLog
        .map((x) => `${icon[x.kind] || '•'} ${stampRel(x.at)} — ${String(x.text || '').slice(0, 120)}`)
        .join('\n')
        .slice(0, 1024),
      inline: false,
    });
  }
  if (!swLog.length && !scLog.length) {
    e.addFields({ name: 'Trống', value: 'Chưa có gì được ghi lại.', inline: false });
  }
  return e;
}

// =============================================================
//  HÀNG NÚT
// =============================================================
function panelRows(view, disabled) {
  const d = Boolean(disabled);
  const rows = [];

  const nav = (id, label, emo) =>
    new ButtonBuilder()
      .setCustomId(id)
      .setLabel(label)
      .setEmoji(emo)
      .setStyle(view === id.slice(3) ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(d);

  rows.push(
    new ActionRowBuilder().addComponents(
      nav('db:overview', 'Tổng quan', '🎛️'),
      nav('db:switches', 'Công tắt', '🔌'),
      nav('db:detect', 'Phát hiện', '🔍'),
      nav('db:sanction', 'Xử lý', '⚖️'),
      nav('db:health', 'Máy móc', '🖥️'),
    ),
  );

  if (view === 'switches') {
    const list = gs.list();
    if (list.length) {
      rows.push(
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('db:switch')
            .setPlaceholder('Bật / tắt một công tắc…')
            .setDisabled(d)
            .addOptions(
              list.slice(0, 25).map((s) => ({
                label: String(s.label).slice(0, 100),
                value: s.key,
                description: (s.on ? 'Đang BẬT — chọn để tắt' : 'Đang TẮT — chọn để bật').slice(0, 100),
                emoji: s.on ? '🟢' : '🔴',
              })),
            ),
        ),
      );
    }
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('db:allon').setLabel('Bật hết bảo vệ').setEmoji('🛡️').setStyle(ButtonStyle.Success).setDisabled(d),
        new ButtonBuilder().setCustomId('db:alloff').setLabel('Tắt hết bảo vệ').setEmoji('⚠️').setStyle(ButtonStyle.Danger).setDisabled(d),
        new ButtonBuilder().setCustomId('db:swreset').setLabel('Về mặc định').setEmoji('♻️').setStyle(ButtonStyle.Secondary).setDisabled(d),
      ),
    );
  }

  if (view === 'sanction') {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('db:preset')
          .setPlaceholder('Đổi độ nghiêm khắc của hệ thống xử lý…')
          .setDisabled(d)
          .addOptions(
            Object.keys(sstore.PRESETS)
              .slice(0, 25)
              .map((k) => ({
                label: sstore.PRESET_LABELS[k] || k,
                value: k,
                description: String(sstore.PRESET_NOTES[k] || '').slice(0, 100),
              })),
          ),
      ),
    );
  }

  if (view === 'data') {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('db:flush').setLabel('Lưu ngay').setEmoji('💾').setStyle(ButtonStyle.Success).setDisabled(d),
        new ButtonBuilder().setCustomId('db:prune').setLabel('Dọn rác').setEmoji('🧹').setStyle(ButtonStyle.Primary).setDisabled(d),
        new ButtonBuilder().setCustomId('db:rebuild').setLabel('Dựng lại cụm').setEmoji('🕸️').setStyle(ButtonStyle.Primary).setDisabled(d),
        new ButtonBuilder().setCustomId('db:export').setLabel('Xuất báo cáo').setEmoji('📤').setStyle(ButtonStyle.Secondary).setDisabled(d),
      ),
    );
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      nav('db:data', 'Dữ liệu', '💾'),
      nav('db:log', 'Nhật ký', '📜'),
      new ButtonBuilder().setCustomId('db:refresh').setLabel('Làm mới').setEmoji('🔄').setStyle(ButtonStyle.Secondary).setDisabled(d),
      new ButtonBuilder().setCustomId('db:close').setLabel('Đóng').setEmoji('✖️').setStyle(ButtonStyle.Danger).setDisabled(d),
    ),
  );

  return rows;
}

function renderView(client, view) {
  switch (view) {
    case 'switches':
      return renderSwitches();
    case 'detect':
      return renderDetect();
    case 'sanction':
      return renderSanction();
    case 'health':
      return renderHealth(client);
    case 'data':
      return renderData();
    case 'log':
      return renderLog();
    default:
      return renderOverview(client);
  }
}

// =============================================================
//  LỆNH
// =============================================================
module.exports = {
  name: 'dashboard',
  aliases: ['bangdieukhien', 'dash', 'trungtam', 'ownerpanel', 'dieukhien'],
  category: 'owner',
  description: 'Trung tâm điều khiển: xem và điều khiển mọi hệ thống của bot từ một chỗ',
  usage: 'dashboard [mục]',
  cooldown: 3,
  ownerOnly: true,
  slash: true,
  options: [
    {
      name: 'mục',
      type: 'string',
      description: 'Mở sẵn một mục',
      required: false,
      choices: [
        { name: 'Tổng quan', value: 'overview' },
        { name: 'Công tắt toàn cục', value: 'switches' },
        { name: 'Hai hệ thống phát hiện', value: 'detect' },
        { name: 'Hệ thống xử lý', value: 'sanction' },
        { name: 'Sức khoẻ máy móc', value: 'health' },
        { name: 'Dữ liệu & bảo dưỡng', value: 'data' },
        { name: 'Nhật ký', value: 'log' },
      ],
    },
  ],

  async run(ctx) {
    const client = ctx.client;
    const ownerTag = ctx.author.tag || ctx.author.username || 'chủ bot';

    const VIEWS = ['overview', 'switches', 'detect', 'sanction', 'health', 'data', 'log'];
    const asked = plain(ctx.getString('mục') || '');
    let view = VIEWS.includes(asked) ? asked : 'overview';

    const msg = await ctx
      .reply({ embeds: [renderView(client, view)], components: panelRows(view, false), fetchReply: true })
      .catch(() => null);
    if (!msg || typeof msg.createMessageComponentCollector !== 'function') return;

    let ended = false;
    const collector = msg.createMessageComponentCollector({ time: PANEL_TIME });

    const lock = () => {
      if (ended) return;
      ended = true;
      msg.edit({ components: panelRows(view, true) }).catch(() => {});
    };

    const refresh = async (i, note) => {
      const emb = renderView(client, view);
      if (note) emb.addFields({ name: '✅ Vừa xong', value: String(note).slice(0, 1000), inline: false });
      await i.update({ embeds: [emb], components: panelRows(view, false) }).catch(() => {});
    };

    collector.on('collect', async (i) => {
      try {
        if (!i.customId || i.customId.indexOf('db:') !== 0) return;
        if (i.user.id !== client.config.ownerId) {
          return i.reply({ content: '⛔ Bảng này chỉ chủ bot dùng được.', ephemeral: true }).catch(() => {});
        }
        const id = i.customId.slice(3);

        // ----- Điều hướng -----
        if (VIEWS.includes(id)) {
          view = id;
          return refresh(i);
        }
        if (id === 'refresh') return refresh(i, 'Số liệu đã được tải lại.');
        if (id === 'close') {
          collector.stop('closed');
          return i
            .update({
              embeds: [Embed.info('Đã đóng trung tâm điều khiển', 'Mở lại bất cứ lúc nào bằng lệnh `dashboard`.')],
              components: [],
            })
            .catch(() => {});
        }

        // ----- Bật/tắt một công tắc -----
        if (id === 'switch') {
          const key = (i.values && i.values[0]) || '';
          if (!gs.isRegistered(key)) {
            return i.reply({ content: '❌ Không có công tắc này.', ephemeral: true }).catch(() => {});
          }
          // toggle() trả về { ok, changed, state } — trạng thái mới nằm trong .state
          const res = gs.toggle(key, ownerTag, 'Đổi từ trung tâm điều khiển');
          if (!res.ok) return i.reply({ content: '❌ ' + res.error, ephemeral: true }).catch(() => {});
          const m = gs.meta(key);
          return refresh(i, `**${m.label}** → ${res.state && res.state.on ? '🟢 BẬT' : '🔴 TẮT'}`);
        }

        if (id === 'allon' || id === 'alloff') {
          const on = id === 'allon';
          const keys = gs.list().map((s) => s.key);
          gs.setMany(keys, on, ownerTag, on ? 'Bật hết từ trung tâm điều khiển' : 'Tắt hết từ trung tâm điều khiển');
          return refresh(
            i,
            on
              ? `🛡️ Đã bật toàn bộ **${keys.length}** hệ thống bảo vệ.`
              : `⚠️ Đã tắt toàn bộ **${keys.length}** hệ thống bảo vệ. Bot đang **không được bảo vệ** — nhớ bật lại!`,
          );
        }

        if (id === 'swreset') {
          const keys = gs.list().map((s) => s.key);
          for (const k of keys) gs.reset(k, ownerTag);
          return refresh(i, `♻️ Đã trả **${keys.length}** công tắc về trạng thái mặc định.`);
        }

        // ----- Đổi độ nghiêm khắc của hệ thống xử lý -----
        if (id === 'preset') {
          const key = (i.values && i.values[0]) || '';
          const res = sstore.applyPreset(key);
          if (!res.ok) return i.reply({ content: '❌ ' + res.error, ephemeral: true }).catch(() => {});
          sstore.log('info', ownerTag, `Đổi bộ cấu hình xử lý sang "${key}" từ trung tâm điều khiển.`);
          return refresh(
            i,
            `Đã đổi sang bộ **${sstore.PRESET_LABELS[key] || key}** — ${sstore.PRESET_NOTES[key] || ''}`,
          );
        }

        // ----- Bảo dưỡng dữ liệu -----
        if (id === 'flush') {
          guard.store.flush();
          sstore.flush();
          gs.flush();
          maintenance.flush();
          return refresh(i, '💾 Đã ghi toàn bộ dữ liệu xuống ổ đĩa. Giờ tắt bot cũng không mất gì.');
        }

        if (id === 'prune') {
          // prune(now, force) — tham số đầu là MỐC THỜI GIAN, không phải cờ force.
          // Truyền sai chỗ sẽ làm hàm tưởng "bây giờ" là năm 1970 và xoá oan dữ liệu.
          const a = guard.store.prune(Date.now(), true);
          const b = sstore.prune();
          return refresh(
            i,
            `🧹 Đã dọn **${num(a, 0)}** mục ở kho chống gian lận và **${num(b, 0)}** hồ sơ xử lý quá cũ.`,
          );
        }

        if (id === 'rebuild') {
          const n = guard.rebuildClusters(true);
          guard.store.rebuildIndex();
          return refresh(i, `🕸️ Đã tính lại toàn bộ cụm acc clone: **${num(n, 0)}** cụm đang hoạt động, và dựng lại chỉ mục tra cứu nhanh.`);
        }

        if (id === 'export') {
          const snap = sstore.exportSnapshot(Date.now());
          const payload = {
            xuatLuc: new Date().toISOString(),
            bot: client.user ? client.user.tag : '',
            chongGianLan: guard.status(),
            heThongXuLy: snap,
            congTacToanCuc: gs.list(),
          };
          const buf = Buffer.from(JSON.stringify(payload, null, 2), 'utf8');
          const file = new AttachmentBuilder(buf, {
            name: `baocao-cubitix-${new Date().toISOString().slice(0, 10)}.json`,
          });
          await i
            .reply({
              content:
                '📤 Đây là báo cáo đầy đủ dạng JSON. Bạn có thể lưu lại để đối chiếu về sau.',
              files: [file],
              ephemeral: true,
            })
            .catch(() => {});
          return;
        }

        return i.deferUpdate().catch(() => {});
      } catch (err) {
        client.logger?.error?.('Lỗi nút trung tâm điều khiển: ' + (err && err.stack ? err.stack : err));
        if (!i.replied && !i.deferred) {
          i.reply({ content: '❌ Có lỗi khi xử lý nút này. Bạn thử lại nhé.', ephemeral: true }).catch(() => {});
        }
      }
    });

    collector.on('end', () => lock());
  },
};
