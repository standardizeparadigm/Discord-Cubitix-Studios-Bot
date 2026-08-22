// =============================================================
//  Lõi: TRUNG TÂM ĐIỀU KHIỂN CỦA CHỦ BOT (các trang + việc bảo dưỡng)
//
//  Trước đây đây là lệnh `dashboard` riêng. Từ v3.1.4 nó đã được gộp
//  vào lệnh `antiabuse`, nên phần vẽ trang & xử lý nút được tách ra
//  file lõi này để lệnh gộp gọi lại, không mất tính năng nào.
//
//  Một chị "tổng đài" duy nhất để nhìn và điều khiển mọi thứ:
//    • Tổng quan       — sức khoẻ bot + 3 hệ thống bảo vệ
//    • Công tắc        — bật/tắt từng hệ thống trên toàn bộ máy chủ
//    (Phần "phát hiện" đã có sẵn trong bảng chống gian lận nên bỏ, khỏi trùng)
//    • Xử lý          — ai đang bị cảnh cáo / cấm tạm / cấm vĩnh viễn
//    • Máy móc        — RAM, CPU, ping, thời gian chạy
//    • Dữ liệu        — lưu, dọn rác, dựng lại cụm, xuất báo cáo
//    • Nhật ký        — toàn bộ việc đã xảy ra
//
//  Mọi customId đều bắt đầu bằng 'aa:' để bảng gộp bắt được hết.
// =============================================================
const os = require('os');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  AttachmentBuilder,
  MessageFlags,
  version: djsVersion,
} = require('discord.js');
const Embed = require('./EmbedFactory');
const { colors } = require('./palette');
const gs = require('./globalSwitch');
const guard = require('./abuseGuard');
const sanctions = require('./sanctions');
const sstore = require('./sanctionStore');
const engine = require('./sanctionEngine');
const maintenance = require('./maintenanceStore');

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
//  MÀN HÌNH: CÔNG TẮC TOÀN CỤC
// =============================================================
function renderSwitches() {
  const list = gs.list();
  const e = Embed.custom(
    colors.aqua,
    '🔌 Công tắc toàn cục',
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
      name: '🔌 Công tắc toàn cục',
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

// Các trang của TRUNG TÂM ĐIỀU KHIỂN (trước đây là lệnh `dashboard`).
// Tất cả customId dùng tiền tố 'aa:' để bảng gộp của lệnh `antiabuse`
// bắt được hết trong một collector duy nhất.
const VIEWS = ['overview', 'switches', 'sanction', 'health', 'data'];

// Nhãn để dựng menu chọn trang ở bảng gộp.
const VIEW_LABELS = {
  overview: { label: 'Tổng quan hệ thống', emoji: '🎛️', desc: 'Sức khoẻ bot + mọi hệ thống bảo vệ' },
  switches: { label: 'Công tắc toàn cục', emoji: '🔌', desc: 'Bật/tắt từng hệ thống trên mọi máy chủ' },
  sanction: { label: 'Hệ thống xử lý', emoji: '⚖️', desc: 'Cảnh cáo, cấm tạm, cấm vĩnh viễn' },
  health: { label: 'Sức khoẻ máy móc', emoji: '🖥️', desc: 'RAM, CPU, ping, thời gian chạy' },
  data: { label: 'Dữ liệu & bảo dưỡng', emoji: '💾', desc: 'Lưu, dọn rác, dựng lại cụm, xuất báo cáo' },
};

// Vẽ embed của một trang trung tâm điều khiển.
function renderView(client, view) {
  switch (view) {
    case 'switches':
      return renderSwitches();
    case 'sanction':
      return renderSanction();
    case 'health':
      return renderHealth(client);
    case 'data':
      return renderData();
    default:
      return renderOverview(client);
  }
}

// Các hàng nút RIÊNG của từng trang (bảng gộp tự lo phần điều hướng chung).
// Trả về tối đa 2 hàng để tổng số hàng luôn ≤ 5 (giới hạn của Discord).
function rowsFor(view, disabled) {
  const d = Boolean(disabled);
  const rows = [];

  if (view === 'switches') {
    const list = gs.list();
    if (list.length) {
      rows.push(
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('aa:switch')
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
        new ButtonBuilder().setCustomId('aa:allon').setLabel('Bật hết bảo vệ').setEmoji('🛡️').setStyle(ButtonStyle.Success).setDisabled(d),
        new ButtonBuilder().setCustomId('aa:alloff').setLabel('Tắt hết bảo vệ').setEmoji('⚠️').setStyle(ButtonStyle.Danger).setDisabled(d),
        new ButtonBuilder().setCustomId('aa:swreset').setLabel('Về mặc định').setEmoji('♻️').setStyle(ButtonStyle.Secondary).setDisabled(d),
      ),
    );
    return rows;
  }

  if (view === 'sanction') {
    const keys = Object.keys(sstore.PRESETS || {});
    if (keys.length) {
      rows.push(
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('aa:spreset')
            .setPlaceholder('Đổi độ nghiêm khắc của hệ thống xử lý…')
            .setDisabled(d)
            .addOptions(
              keys.slice(0, 25).map((k) => {
                const opt = {
                  label: String((sstore.PRESET_LABELS && sstore.PRESET_LABELS[k]) || k).slice(0, 100),
                  value: k,
                };
                const note = String((sstore.PRESET_NOTES && sstore.PRESET_NOTES[k]) || '').slice(0, 100);
                if (note) opt.description = note;
                return opt;
              }),
            ),
        ),
      );
    }
    return rows;
  }

  if (view === 'data') {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('aa:flush').setLabel('Lưu ngay').setEmoji('💾').setStyle(ButtonStyle.Success).setDisabled(d),
        new ButtonBuilder().setCustomId('aa:prune').setLabel('Dọn rác').setEmoji('🧹').setStyle(ButtonStyle.Primary).setDisabled(d),
        new ButtonBuilder().setCustomId('aa:rebuild').setLabel('Dựng lại cụm').setEmoji('🕸️').setStyle(ButtonStyle.Primary).setDisabled(d),
        new ButtonBuilder().setCustomId('aa:export').setLabel('Xuất báo cáo').setEmoji('📤').setStyle(ButtonStyle.Secondary).setDisabled(d),
      ),
    );
    return rows;
  }

  return rows;
}

// Danh sách id thuộc phần trung tâm điều khiển (đã bỏ tiền tố 'aa:').
const ACTION_IDS = new Set([
  'switch',
  'allon',
  'alloff',
  'swreset',
  'spreset',
  'flush',
  'prune',
  'rebuild',
  'export',
]);

function ownsAction(id) {
  return ACTION_IDS.has(String(id));
}

// -------------------------------------------------------------
//  Xử lý một nút/menu của trung tâm điều khiển.
//  Trả về { handled, note, silent }:
//    - handled : có phải việc của file này hay không
//    - note    : dòng "Vừa xong" để bảng gộp vẽ lại kèm thông báo
//    - silent  : đã tự trả lời tương tác -> bảng gộp KHÔNG được update nữa
// -------------------------------------------------------------
async function handleAction(i, id, opts = {}) {
  const client = opts.client;
  const ownerTag = opts.ownerTag || '';
  if (!ownsAction(id)) return { handled: false };

  const warn = async (text) => {
    await i.reply({ content: text, flags: MessageFlags.Ephemeral }).catch(() => {});
    return { handled: true, silent: true };
  };

  // ----- Bật/tắt một công tắc -----
  if (id === 'switch') {
    const key = (i.values && i.values[0]) || '';
    if (!gs.isRegistered(key)) return warn('❌ Không có công tắc này.');
    // toggle() trả về { ok, changed, state } — trạng thái mới nằm trong .state
    const res = gs.toggle(key, ownerTag, 'Đổi từ trung tâm điều khiển');
    if (!res.ok) return warn('❌ ' + res.error);
    const m = gs.meta(key);
    return { handled: true, note: `**${m.label}** → ${res.state && res.state.on ? '🟢 BẬT' : '🔴 TẮT'}` };
  }

  if (id === 'allon' || id === 'alloff') {
    const on = id === 'allon';
    const keys = gs.list().map((s) => s.key);
    gs.setMany(keys, on, ownerTag, on ? 'Bật hết từ trung tâm điều khiển' : 'Tắt hết từ trung tâm điều khiển');
    return {
      handled: true,
      note: on
        ? `🛡️ Đã bật toàn bộ **${keys.length}** hệ thống bảo vệ.`
        : `⚠️ Đã tắt toàn bộ **${keys.length}** hệ thống bảo vệ. Bot đang **không được bảo vệ** — nhớ bật lại!`,
    };
  }

  if (id === 'swreset') {
    const keys = gs.list().map((s) => s.key);
    for (const k of keys) gs.reset(k, ownerTag);
    return { handled: true, note: `♻️ Đã trả **${keys.length}** công tắc về trạng thái mặc định.` };
  }

  // ----- Đổi độ nghiêm khắc của hệ thống xử lý -----
  if (id === 'spreset') {
    const key = (i.values && i.values[0]) || '';
    const res = sstore.applyPreset(key);
    if (!res.ok) return warn('❌ ' + res.error);
    sstore.log('info', ownerTag, `Đổi bộ cấu hình xử lý sang "${key}" từ bảng chống gian lận.`);
    return {
      handled: true,
      note: `Đã đổi sang bộ **${(sstore.PRESET_LABELS && sstore.PRESET_LABELS[key]) || key}** — ${(sstore.PRESET_NOTES && sstore.PRESET_NOTES[key]) || ''}`,
    };
  }

  // ----- Bảo dưỡng dữ liệu -----
  if (id === 'flush') {
    guard.store.flush();
    sstore.flush();
    gs.flush();
    maintenance.flush();
    return { handled: true, note: '💾 Đã ghi toàn bộ dữ liệu xuống ổ đĩa. Giờ tắt bot cũng không mất gì.' };
  }

  if (id === 'prune') {
    // prune(now, force) — tham số đầu là MỐC THỎI GIAN, không phải cờ force.
    // Truyền sai chỗ sẽ làm hàm tưởng "bây giờ" là năm 1970 và xoá oan dữ liệu.
    const a = guard.store.prune(Date.now(), true);
    const b = sstore.prune();
    return {
      handled: true,
      note: `🧹 Đã dọn **${num(a, 0)}** mục ở kho chống gian lận và **${num(b, 0)}** hồ sơ xử lý quá cũ.`,
    };
  }

  if (id === 'rebuild') {
    const n = guard.rebuildClusters(true);
    guard.store.rebuildIndex();
    return {
      handled: true,
      note: `🕸️ Đã tính lại toàn bộ cụm acc clone: **${num(n, 0)}** cụm đang hoạt động, và dựng lại chỉ mục tra cứu nhanh.`,
    };
  }

  if (id === 'export') {
    const snap = sstore.exportSnapshot(Date.now());
    const payload = {
      xuatLuc: new Date().toISOString(),
      bot: client && client.user ? client.user.tag : '',
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
        content: '📤 Đây là báo cáo đầy đủ dạng JSON. Bạn có thể lưu lại để đối chiếu về sau.',
        files: [file],
        flags: MessageFlags.Ephemeral,
      })
      .catch(() => {});
    return { handled: true, silent: true };
  }

  return { handled: false };
}

module.exports = {
  PANEL_TIME,
  VIEWS,
  VIEW_LABELS,
  ACTION_IDS,
  ownsAction,
  renderView,
  renderOverview,
  renderSwitches,
  renderSanction,
  renderHealth,
  renderData,
  renderLog,
  rowsFor,
  handleAction,
  num,
  plain,
  stampRel,
  fmtBytes,
  fmtUptime,
  bar,
  TIER_TEXT,
};
