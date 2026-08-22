// =============================================================
//  Lệnh: antiabuse - BẢNG ĐIỀU KHIỂN HAI HỆ THỐNG CHỐNG GIAN LẬN
//  (CHỈ CHỦ BOT)
//
//  • Hệ thống 1: chống người chơi dùng bot/macro tự động đánh lệnh
//  • Hệ thống 2: chống người chơi tạo nhiều acc clone để cày xu
//
//  CÔNG TẮC LÀ TOÀN CỤC: tắt ở đây là tắt ở **mọi máy chủ** có bot,
//  bật lại cũng vậy. Máy chủ riêng lẻ KHÔNG thể tự ghi đè.
//  Mặc định cả hai hệ thống đều BẬT.
//
//  Làm được ngay trên bảng:
//    - Bật/tắt từng hệ thống
//    - Đổi mức độ (Nhẹ nhàng / Cân bằng / Nghiêm ngặt)
//    - Xem danh sách tài khoản đáng nghi & các cụm acc clone
//    - Chọn một người để xem báo cáo chi tiết, cho vào danh sách tin cậy,
//      gỡ khoá, xoá liên kết hoặc chấm điểm lại
//    - Xem nhật ký và thống kê
//
//  TỪ v3.1.4: lệnh `dashboard` (TRUNG TÂM ĐIỀU KHIỂN) đã được GỘP vào
//  đây. Bảng này giờ có thêm các trang: Tổng quan hệ thống, Công tắc toàn
//  cục, Hệ thống xử lý, Sức khoẻ máy móc, Dữ liệu & bảo dưỡng — chọn ở
//  menu "Chọn trang" ngay hàng đầu. Phần vẽ trang nằm trong
//  modules/core/dashboardViews.js để file lệnh không phình to.
// =============================================================
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  UserSelectMenuBuilder,
  StringSelectMenuBuilder,
  MessageFlags,
} = require('discord.js');
const Embed = require('../../core/EmbedFactory');
const { colors, emoji } = require('../../core/palette');
const guard = require('../../core/abuseGuard');
const store = require('../../core/abuseStore');
const gs = require('../../core/globalSwitch');
// Các trang của trung tâm điều khiển cũ (lệnh `dashboard`) đã gộp vào lệnh này.
const dash = require('../../core/dashboardViews');

const PANEL_TIME = 300000; // bảng điều khiển sống 5 phút

// Bỏ dấu tiếng Việt để nhận diện hành động dù gõ có dấu hay không.
function plain(text) {
  return String(text == null ? '' : text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'd')
    .trim()
    .toLowerCase();
}

const ACTIONS = {
  status: ['', 'status', 'trang thai', 'trangthai', 'tt', 'panel', 'bang', 'info'],
  on: ['on', 'bat', 'enable', 'batall', 'bat tat ca', 'battatca'],
  off: ['off', 'tat', 'disable', 'tatall', 'tat tat ca', 'tattatca'],
  boton: ['boton', 'bat bot', 'batbot', 'auto on', 'autoon', 'bat chong bot', 'batchongbot'],
  botoff: ['botoff', 'tat bot', 'tatbot', 'auto off', 'autooff', 'tat chong bot', 'tatchongbot'],
  alton: ['alton', 'bat clone', 'batclone', 'bat alt', 'batalt', 'bat chong clone', 'batchongclone'],
  altoff: ['altoff', 'tat clone', 'tatclone', 'tat alt', 'tatalt', 'tat chong clone', 'tatchongclone'],
  preset: ['preset', 'muc', 'muc do', 'mucdo', 'level', 'che do', 'chedo'],
  check: ['check', 'kiem tra', 'kiemtra', 'xem', 'report', 'bao cao', 'baocao'],
  trust: ['trust', 'tin cay', 'tincay', 'whitelist', 'wl'],
  untrust: ['untrust', 'bo tin cay', 'botincay', 'unwl'],
  clear: ['clear', 'go phat', 'gophat', 'unban', 'reset', 'go'],
  clearall: ['clearall', 'go het', 'gohet', 'resetall', 'go tat ca', 'gotatca'],
  flagged: ['flagged', 'nghi van', 'nghivan', 'list', 'ds', 'danh sach', 'danhsach'],
  clusters: ['clusters', 'cum', 'cluster', 'nhom', 'group'],
  log: ['log', 'nhat ky', 'nhatky', 'lich su', 'lichsu', 'history'],
  // ---- Các trang gộp từ lệnh `dashboard` cũ ----
  overview: ['overview', 'tong quan', 'tongquan', 'dashboard', 'dash', 'trung tam', 'trungtam', 'bang dieu khien', 'bangdieukhien'],
  switches: ['switches', 'switch', 'cong tac', 'congtac', 'cong tat', 'congtat', 'cttc'],
  sanction: ['sanction', 'sanctions', 'xu ly', 'xuly', 'hinh phat', 'hinhphat', 'an phat', 'anphat'],
  health: ['health', 'may moc', 'maymoc', 'suc khoe', 'suckhoe', 'ping', 'ram'],
  data: ['data', 'du lieu', 'dulieu', 'bao duong', 'baoduong', 'luu', 'save'],
};

// Mọi trang bảng có thể mở (dùng cho menu chọn trang & kiểm tra hợp lệ).
const ALL_VIEWS = ['main', 'flagged', 'clusters', 'log'].concat(dash.VIEWS);

const VIEW_MENU = [
  { value: 'main', label: 'Bảng chống gian lận', emoji: '🛡️', desc: 'Hai hệ thống chống gian lận + xử lý từng người' },
  { value: 'flagged', label: 'Tài khoản đáng nghi', emoji: '🚩', desc: 'Ai đang bị nghi dùng bot/macro hoặc acc clone' },
  { value: 'clusters', label: 'Cụm acc clone', emoji: '🔗', desc: 'Các nhóm tài khoản bị nghi của cùng một người' },
  { value: 'log', label: 'Nhật ký', emoji: '📜', desc: 'Việc đã xảy ra của mọi hệ thống bảo vệ' },
].concat(
  dash.VIEWS.map((v) => ({
    value: v,
    label: (dash.VIEW_LABELS[v] || {}).label || v,
    emoji: (dash.VIEW_LABELS[v] || {}).emoji || '▪️',
    desc: (dash.VIEW_LABELS[v] || {}).desc || '',
  })),
);

function viewOptions(current) {
  return VIEW_MENU.map((v) => {
    const opt = { label: String(v.label).slice(0, 100), value: v.value, default: current === v.value };
    if (v.emoji) opt.emoji = v.emoji;
    if (v.desc) opt.description = String(v.desc).slice(0, 100);
    return opt;
  });
}

function resolveAction(raw) {
  const t = plain(raw);
  for (const key of Object.keys(ACTIONS)) {
    if (key === t) return key;
    if (ACTIONS[key].indexOf(t) !== -1) return key;
  }
  return null;
}

function stamp(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return 'chưa có';
  return '<t:' + Math.floor(n / 1000) + ':R>';
}

function num(n) {
  return Number(n || 0).toLocaleString('vi-VN');
}

function bar(value, max = 100, size = 10) {
  const ratio = Math.min(1, Math.max(0, (Number(value) || 0) / Math.max(1, max)));
  const filled = Math.round(ratio * size);
  return '`' + '\u2588'.repeat(filled) + '\u2591'.repeat(Math.max(0, size - filled)) + '`';
}

const TIER_TEXT = {
  ok: '🟢 Bình thường',
  watch: '🟡 Theo dõi',
  quarantine: '🟠 Hạn chế',
  freeze: '🔴 Phong toả',
};

const KIND_TEXT = {
  automation: '🤖 Chống bot',
  alt: '👥 Chống clone',
  captcha: '🧩 Xác minh',
  transfer: '💸 Chuyển xu',
  trust: '⭐ Tin cậy',
  reset: '🧹 Gỡ xử lý',
  link: '🔗 Liên kết',
  switch: '🎛️ Công tắc',
  info: 'ℹ️ Thông tin',
};

// =============================================================
//  Vẽ bảng
// =============================================================
function renderMain(client, viewerTag, notice, selectedUser) {
  const s = guard.status();
  const auto = s.switches.automation;
  const alt = s.switches.alt;
  const bothOn = auto.on && alt.on;
  const bothOff = !auto.on && !alt.on;

  const color = bothOn ? colors.success : bothOff ? colors.error : colors.warning;
  const title = bothOn
    ? '🛡️ CHỐNG GIAN LẬN — CẢ HAI ĐANG BẬT'
    : bothOff
      ? '⚠️ CHỐNG GIAN LẬN — ĐÃ TẮT HOÀN TOÀN'
      : '🟡 CHỐNG GIAN LẬN — BẬT MỘT PHẦN';

  const head = bothOff
    ? '🔴 **Cả hai hệ thống đang tắt trên MỌI MÁY CHỦ.** Người chơi có thể dùng macro và acc clone tự do.'
    : 'Đây là **công tắc toàn cục**: bật/tắt ở đây sẽ áp dụng cho **tất cả máy chủ** có bot.\n' +
      'Máy chủ riêng lẻ không thể tự bật hay tắt.';

  const e = Embed.custom(color, title, (notice ? '❯ ' + String(notice).slice(0, 400) + '\n\n' : '') + head);

  e.addFields(
    {
      name: (auto.on ? '🟩' : '🟥') + ' Hệ thống 1 — Chống bot tự động đánh lệnh',
      value:
        (auto.on ? '**ĐANG BẬT**' : '**ĐANG TẮT**') +
        (auto.explicit ? '' : ' _(theo mặc định)_') +
        '\n└ ' +
        (auto.changedAt ? 'Đổi lần cuối ' + stamp(auto.changedAt) + (auto.changedBy ? ' bởi <@' + auto.changedBy + '>' : '') : 'Chưa từng đổi'),
      inline: true,
    },
    {
      name: (alt.on ? '🟩' : '🟥') + ' Hệ thống 2 — Chống acc clone farm xu',
      value:
        (alt.on ? '**ĐANG BẬT**' : '**ĐANG TẮT**') +
        (alt.explicit ? '' : ' _(theo mặc định)_') +
        '\n└ ' +
        (alt.changedAt ? 'Đổi lần cuối ' + stamp(alt.changedAt) + (alt.changedBy ? ' bởi <@' + alt.changedBy + '>' : '') : 'Chưa từng đổi'),
      inline: true,
    },
  );

  const cfg = s.config;
  const presetLabel = store.PRESET_LABELS[cfg.preset] || (cfg.preset === 'custom' ? 'Tự chỉnh' : cfg.preset);
  e.addFields({
    name: '⚙️ Mức độ hiện tại: ' + presetLabel,
    value:
      `🤖 Ngưỡng chống bot: theo dõi **${cfg.autoWatch}** • hỏi câu đố **${cfg.autoChallenge}** • chặn **${cfg.autoBlock}**\n` +
      `👥 Ngưỡng chống clone: theo dõi **${cfg.altWatch}** • hạn chế **${cfg.altQuarantine}** • phong toả **${cfg.altFreeze}**\n` +
      `🧾 Trần xu/ngày mỗi cụm: **${num(cfg.clusterDailyEarnCap)}** • Tuổi acc tối thiểu để chuyển xu: **${cfg.minAccountAgeDaysForTransfer} ngày**\n` +
      `🧩 Câu đố xác minh: **${cfg.captchaEnabled ? 'Bật' : 'Tắt'}** • Nhóm lệnh bị siết: \`${(cfg.enforceCategories || []).join('`, `') || 'không'}\``,
    inline: false,
  });

  const st = s.stats;
  e.addFields(
    {
      name: '📊 Hoạt động',
      value:
        `⌨️ Đã kiểm tra: **${num(st.commandsChecked)}** lệnh\n` +
        `🚫 Đã chặn: **${num(st.commandsBlocked)}** lệnh\n` +
        `⏳ Đã khoá tạm: **${num(st.penalties)}** lần`,
      inline: true,
    },
    {
      name: '🧩 Xác minh người thật',
      value:
        `Đã hỏi: **${num(st.captchaIssued)}**\n` +
        `✅ Đúng: **${num(st.captchaPassed)}**\n` +
        `❌ Sai: **${num(st.captchaFailed)}**`,
      inline: true,
    },
    {
      name: '👥 Chống acc clone',
      value:
        `🚩 Đánh dấu: **${num(st.altsFlagged)}**\n` +
        `🔗 Cụm tìm được: **${num(st.clustersFound)}**\n` +
        `💸 Chặn chuyển xu: **${num(st.transfersBlocked)}**`,
      inline: true,
    },
  );

  const c = s.counts;
  e.addFields({
    name: '🗃️ Dữ liệu đang giữ',
    value:
      `Hồ sơ: **${num(c.profiles)}** • Đang theo dõi nhịp gõ: **${num(c.tracked)}**\n` +
      `🟡 Theo dõi: **${num(c.watched)}** • 🚩 Đáng nghi: **${num(c.flagged)}** • 🔒 Đang khoá: **${num(c.penalized)}**\n` +
      `🔗 Liên kết: **${num(c.links)}** • Cụm: **${num(c.clusters)}** • ⭐ Tin cậy: **${num(c.trusted)}**`,
    inline: false,
  });

  // ----- Báo cáo người đang chọn -----
  if (selectedUser) {
    const rep = guard.report(selectedUser);
    if (!rep) {
      e.addFields({
        name: '🔍 Đang xem: <@' + selectedUser + '>',
        value: '_Chưa có hồ sơ nào cho người này (họ chưa dùng lệnh nào của bot)._',
        inline: false,
      });
    } else {
      const now = Date.now();
      const signs = [];
      for (const l of rep.autoLabels || []) signs.push('🤖 ' + l);
      for (const l of rep.riskLabels || []) signs.push('👥 ' + l);
      e.addFields({
        name: '🔍 Báo cáo: <@' + selectedUser + '>' + (rep.trusted ? ' — ⭐ TIN CẬY' : ''),
        value:
          `🤝 Tin cậy ${bar(rep.trust)} **${Math.round(rep.trust)}**/100\n` +
          `🤖 Nghi dùng máy ${bar(rep.autoScore)} **${Math.round(rep.autoScore)}**/100 (mẫu: ${rep.autoSamples})\n` +
          `👥 Nghi clone ${bar(rep.risk)} **${Math.round(rep.risk)}**/100 — ${TIER_TEXT[rep.riskTier] || rep.riskTier}\n` +
          `📛 Tuổi acc: **${rep.ageDays == null ? '?' : rep.ageDays.toFixed(1)}** ngày • ⌨️ **${num(rep.cmdCount)}** lệnh • 💬 **${num(rep.msgCount)}** tin\n` +
          `⚠️ Cảnh cáo: **${rep.strikes}** • 🧩 Xác minh đúng/sai: **${rep.captcha.passed}/${rep.captcha.failed}**\n` +
          (rep.penaltyUntil > now
            ? `🔒 Đang khoá: còn **${guard.fmtDuration(rep.penaltyUntil - now)}** — ${String(rep.penaltyReason || '').slice(0, 90)}\n`
            : '🔓 Không bị khoá\n') +
          (rep.cluster
            ? `🔗 Cụm \`${rep.cluster.id}\`: **${rep.cluster.members.length}** tài khoản, điểm **${rep.cluster.score}**\n└ ${rep.cluster.members
                .slice(0, 6)
                .map((m) => '<@' + m + '>')
                .join(' ')}${rep.cluster.members.length > 6 ? ' …' : ''}\n`
            : '') +
          (rep.sent.length
            ? `💸 Đã chuyển xu cho: ${rep.sent
                .slice(0, 4)
                .map((x) => `<@${x.to}> (${x.count}lần/${num(x.total)})`)
                .join(', ')}\n`
            : '') +
          (signs.length ? '🔎 ' + signs.slice(0, 6).join(' • ') : '🔎 Không có dấu hiệu đáng nghi'),
        inline: false,
      });
    }
  }

  e.setFooter({
    text: (viewerTag ? viewerTag + ' • ' : '') + 'Công tắc toàn cục • Bảng tự khoá sau 5 phút',
  });
  e.setTimestamp(new Date());
  return e;
}

function renderFlagged(viewerTag, notice) {
  const list = guard.listFlagged(15);
  const now = Date.now();
  const e = Embed.custom(
    list.length ? colors.warning : colors.success,
    '🚩 Tài khoản đáng nghi (' + list.length + ')',
    (notice ? '❯ ' + String(notice).slice(0, 300) + '\n\n' : '') +
      (list.length
        ? 'Sắp theo mức đáng nghi giảm dần. Chọn một người ở menu dưới để xem chi tiết và xử lý.'
        : '✅ Chưa có tài khoản nào đáng nghi. Mọi người đang chơi sạch.'),
  );

  if (list.length) {
    const lines = list.map((u, i) => {
      const locked = u.penaltyUntil > now ? ' 🔒' + guard.fmtDuration(u.penaltyUntil - now) : '';
      return (
        `**${i + 1}.** <@${u.id}>${u.trusted ? ' ⭐' : ''}${locked}\n` +
        `└ ${TIER_TEXT[u.tier] || u.tier} • clone **${u.risk}** • macro **${u.autoScore}** • cảnh cáo **${u.strikes}**` +
        (u.cluster ? ' • cụm `' + u.cluster + '`' : '')
      );
    });
    e.addFields({ name: '\u200b', value: lines.join('\n').slice(0, 1000), inline: false });
  }

  e.setFooter({ text: (viewerTag ? viewerTag + ' • ' : '') + 'Nhấn ◀️ Quay lại để về bảng chính' });
  e.setTimestamp(new Date());
  return e;
}

function renderClusters(viewerTag, notice) {
  const list = guard.listClusters(10);
  const e = Embed.custom(
    list.length ? colors.warning : colors.success,
    '🔗 Các cụm acc clone (' + list.length + ')',
    (notice ? '❯ ' + String(notice).slice(0, 300) + '\n\n' : '') +
      (list.length
        ? 'Mỗi cụm là một nhóm tài khoản được cho là của **cùng một người**.\n' +
          'Các tài khoản trong cùng cụm **không chuyển xu được cho nhau** và **dùng chung một trần xu mỗi ngày**.'
        : '✅ Chưa phát hiện cụm acc clone nào.'),
  );

  for (const c of list.slice(0, 8)) {
    e.addFields({
      name: `🔗 ${c.id} — ${c.members.length} tài khoản • điểm ${c.score}`,
      value:
        c.members
          .slice(0, 8)
          .map((m) => '<@' + m + '>')
          .join(' • ') +
        (c.members.length > 8 ? `\n… và ${c.members.length - 8} tài khoản nữa` : '') +
        (c.reasons && c.reasons.length ? `\n└ Dấu hiệu: ${c.reasons.join(', ')}` : '') +
        (c.earnAmount ? `\n└ Đã kiếm hôm nay: **${num(c.earnAmount)}** xu` : ''),
      inline: false,
    });
  }

  e.setFooter({ text: (viewerTag ? viewerTag + ' • ' : '') + 'Nhấn ◀️ Quay lại để về bảng chính' });
  e.setTimestamp(new Date());
  return e;
}

function renderPanel(client, viewerTag, notice, view, selectedUser) {
  if (view === 'flagged') return renderFlagged(viewerTag, notice);
  if (view === 'clusters') return renderClusters(viewerTag, notice);
  return renderMain(client, viewerTag, notice, selectedUser);
}

// Một trang có thể cần nhiều embed (ví dụ nhật ký gộp từ hai nguồn khác nhau).
function panelEmbeds(client, viewerTag, notice, view, selectedUser) {
  const note = String(notice == null ? '' : notice).trim();

  // Trang của trung tâm điều khiển (gộp từ lệnh dashboard cũ)
  if (dash.VIEWS.indexOf(view) !== -1) {
    const e = dash.renderView(client, view);
    if (note) e.addFields({ name: '✅ Vừa xong', value: note.slice(0, 1024), inline: false });
    return [e];
  }

  // Nhật ký: giữ cả hai nguồn — chống gian lận và công tắc/hệ thống xử lý
  if (view === 'log') {
    const main = renderLog();
    if (note) main.addFields({ name: '✅ Vừa xong', value: note.slice(0, 1024), inline: false });
    return [main, dash.renderLog()];
  }

  return [renderPanel(client, viewerTag, note, view, selectedUser)];
}

function renderLog() {
  const sysLog = store.logEntries(12);
  const swLog = gs.logEntries(8);
  if (!sysLog.length && !swLog.length) {
    return Embed.info('Nhật ký chống gian lận', 'Chưa có sự kiện nào được ghi lại.');
  }
  const e = Embed.custom(colors.info, '📜 Nhật ký chống gian lận', 'Các sự kiện gần nhất.');

  if (swLog.length) {
    e.addFields({
      name: '🎛️ Thay đổi công tắc toàn cục',
      value: swLog
        .map(
          (x) =>
            `${x.on ? '🟩 BẬT' : '🟥 TẮT'} \`${x.key}\` — ${stamp(x.at)}${x.by ? ' bởi <@' + x.by + '>' : ''}`,
        )
        .join('\n')
        .slice(0, 1000),
      inline: false,
    });
  }

  if (sysLog.length) {
    e.addFields({
      name: '🔎 Sự kiện hệ thống',
      value: sysLog
        .map(
          (x) =>
            `${KIND_TEXT[x.kind] || x.kind} — ${stamp(x.at)}${x.user ? ' • <@' + x.user + '>' : ''}` +
            (x.note ? `\n└ ${String(x.note).slice(0, 150)}` : ''),
        )
        .join('\n')
        .slice(0, 1000),
      inline: false,
    });
  }

  e.setFooter({ text: 'Giữ tối đa ' + store.MAX_LOG + ' sự kiện • ' + gs.MAX_LOG + ' thay đổi công tắc' });
  return e;
}

// =============================================================
//  Hàng nút
// =============================================================
function panelRows(client, disabled, view, selectedUser) {
  const off = Boolean(disabled);
  const autoOn = guard.isAutomationOn();
  const altOn = guard.isAltOn();
  const cfg = store.getConfig();
  const rows = [];

  // ---- Hàng 1: menu chọn trang (thay cho loạt nút điều hướng cũ) ----
  rows.push(
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('aa:view')
        .setPlaceholder('📑 Chọn trang muốn xem…')
        .setMinValues(1)
        .setMaxValues(1)
        .setDisabled(off)
        .addOptions(viewOptions(view)),
    ),
  );

  // ---- Hàng 2: công tắc & tiện ích luôn có mặt ----
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('aa:auto')
        .setLabel(autoOn ? 'Tắt chống bot' : 'Bật chống bot')
        .setEmoji('\ud83e\udd16')
        .setStyle(autoOn ? ButtonStyle.Danger : ButtonStyle.Success)
        .setDisabled(off),
      new ButtonBuilder()
        .setCustomId('aa:alt')
        .setLabel(altOn ? 'Tắt chống clone' : 'Bật chống clone')
        .setEmoji('\ud83d\udc65')
        .setStyle(altOn ? ButtonStyle.Danger : ButtonStyle.Success)
        .setDisabled(off),
      new ButtonBuilder()
        .setCustomId('aa:captcha')
        .setLabel(cfg.captchaEnabled ? 'Tắt câu đố' : 'Bật câu đố')
        .setEmoji('\ud83e\udde9')
        .setStyle(cfg.captchaEnabled ? ButtonStyle.Secondary : ButtonStyle.Success)
        .setDisabled(off),
      new ButtonBuilder().setCustomId('aa:refresh').setLabel('Làm mới').setEmoji('\ud83d\udd04').setStyle(ButtonStyle.Secondary).setDisabled(off),
      new ButtonBuilder().setCustomId('aa:close').setLabel('Đóng').setEmoji('\u2716\ufe0f').setStyle(ButtonStyle.Secondary).setDisabled(off),
    ),
  );

  // ---- Hàng riêng của từng trang trung tâm điều khiển ----
  const extra = dash.rowsFor(view, off);
  if (extra.length) {
    for (const r of extra) rows.push(r);
    return rows;
  }
  if (view === 'log') return rows;

  rows.push(
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('aa:preset')
        .setPlaceholder('\u2699\ufe0f Mức độ — đang dùng: ' + (store.PRESET_LABELS[cfg.preset] || 'Tự chỉnh'))
        .setMinValues(1)
        .setMaxValues(1)
        .setDisabled(off)
        .addOptions(
          {
            label: 'Nhẹ nhàng',
            value: 'lenient',
            description: 'Hạn chế oan sai tối đa, chỉ bắt trường hợp rõ ràng',
            emoji: '\ud83d\udfe2',
            default: cfg.preset === 'lenient',
          },
          {
            label: 'Cân bằng (khuyên dùng)',
            value: 'balanced',
            description: 'Cân giữa hiệu quả và tránh oan sai',
            emoji: '\ud83d\udfe1',
            default: cfg.preset === 'balanced',
          },
          {
            label: 'Nghiêm ngặt',
            value: 'strict',
            description: 'Bắt rất sớm, phù hợp khi đang bị cày lậu nhiều',
            emoji: '\ud83d\udd34',
            default: cfg.preset === 'strict',
          },
        ),
    ),
  );

  rows.push(
    new ActionRowBuilder().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId('aa:user')
        .setPlaceholder('\ud83d\udd0d Chọn một người để xem báo cáo & xử lý')
        .setMinValues(1)
        .setMaxValues(1)
        .setDisabled(off),
    ),
  );

  if (selectedUser) {
    const rep = guard.report(selectedUser);
    const trusted = Boolean(rep && rep.trusted);
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('aa:trust')
          .setLabel(trusted ? 'Bỏ tin cậy' : 'Cho vào tin cậy')
          .setEmoji('\u2b50')
          .setStyle(trusted ? ButtonStyle.Secondary : ButtonStyle.Success)
          .setDisabled(off),
        new ButtonBuilder().setCustomId('aa:clear').setLabel('Gỡ khoá').setEmoji('\ud83d\udd13').setStyle(ButtonStyle.Primary).setDisabled(off),
        new ButtonBuilder().setCustomId('aa:unlink').setLabel('Xoá liên kết').setEmoji('\u2702\ufe0f').setStyle(ButtonStyle.Secondary).setDisabled(off),
        new ButtonBuilder().setCustomId('aa:rescan').setLabel('Chấm điểm lại').setEmoji('\ud83d\udd0e').setStyle(ButtonStyle.Secondary).setDisabled(off),
        new ButtonBuilder().setCustomId('aa:unselect').setLabel('Bỏ chọn').setEmoji('\u21a9\ufe0f').setStyle(ButtonStyle.Secondary).setDisabled(off),
      ),
    );
  } else {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('aa:clearall').setLabel('Gỡ hết khoá').setEmoji('\ud83e\uddf9').setStyle(ButtonStyle.Secondary).setDisabled(off),
      ),
    );
  }

  return rows;
}

// =============================================================
//  Khai báo lệnh
// =============================================================
module.exports = {
  name: 'antiabuse',
  aliases: [
    'chonggianlan',
    'chongbot',
    'antibot',
    'antialt',
    'chongclone',
    'aa',
    // ---- tên gọi cũ của lệnh dashboard, giữ lại để không ai bị lỡ tay ----
    'dashboard',
    'bangdieukhien',
    'dash',
    'trungtam',
    'ownerpanel',
    'dieukhien',
  ],
  category: 'owner',
  // Discord chỉ cho phép mô tả lệnh dài tối đa 100 ký tự.
  description: 'Trung tâm điều khiển của chủ bot: chống bot/macro, acc clone, công tắc, xứ lý, dữ liệu',
  usage:
    '[status|on|off|boton|botoff|alton|altoff|preset|check|trust|untrust|clear|clearall|flagged|clusters|log|overview|switches|sanction|health|data] [@người] [mức]',
  cooldown: 3,
  ownerOnly: true,
  slash: true,
  options: [
    {
      name: 'hành_động',
      type: 'string',
      description: 'Việc muốn làm',
      required: false,
      choices: [
        { name: 'Xem bảng điều khiển', value: 'status' },
        { name: 'Bật cả hai hệ thống (mọi máy chủ)', value: 'on' },
        { name: 'Tắt cả hai hệ thống (mọi máy chủ)', value: 'off' },
        { name: 'Bật riêng chống bot tự động', value: 'boton' },
        { name: 'Tắt riêng chống bot tự động', value: 'botoff' },
        { name: 'Bật riêng chống acc clone', value: 'alton' },
        { name: 'Tắt riêng chống acc clone', value: 'altoff' },
        { name: 'Đổi mức độ', value: 'preset' },
        { name: 'Kiểm tra một người', value: 'check' },
        { name: 'Cho một người vào danh sách tin cậy', value: 'trust' },
        { name: 'Bỏ một người khỏi danh sách tin cậy', value: 'untrust' },
        { name: 'Gỡ khoá cho một người', value: 'clear' },
        { name: 'Gỡ khoá cho tất cả', value: 'clearall' },
        { name: 'Danh sách tài khoản đáng nghi', value: 'flagged' },
        { name: 'Danh sách cụm acc clone', value: 'clusters' },
        { name: 'Xem nhật ký', value: 'log' },
        { name: 'Trang: Tổng quan hệ thống', value: 'overview' },
        { name: 'Trang: Công tắc toàn cục', value: 'switches' },
        { name: 'Trang: Hệ thống xử lý', value: 'sanction' },
        { name: 'Trang: Sức khoẻ máy móc', value: 'health' },
        { name: 'Trang: Dữ liệu & bảo dưỡng', value: 'data' },
      ],
    },
    { name: 'thành_viên', type: 'user', description: 'Người cần kiểm tra / xử lý', required: false },
    {
      name: 'mức_độ',
      type: 'string',
      description: 'Mức độ nghiêm ngặt (dùng với hành động đổi mức độ)',
      required: false,
      choices: [
        { name: 'Nhẹ nhàng', value: 'lenient' },
        { name: 'Cân bằng', value: 'balanced' },
        { name: 'Nghiêm ngặt', value: 'strict' },
      ],
    },
  ],

  async run(ctx) {
    const client = ctx.client;
    const rawAction = ctx.getString('hành_động') || (ctx.isSlash ? '' : (ctx.args && ctx.args[0]) || '');
    const action = resolveAction(rawAction);

    if (!action) {
      const p = (client.config && client.config.prefix) || '!';
      return ctx.reply({
        embeds: [
          Embed.error(
            'Hành động không hợp lệ',
            'Chọn một trong: `status`, `on`, `off`, `boton`, `botoff`, `alton`, `altoff`, `preset`, `check`, `trust`, `untrust`, `clear`, `clearall`, `flagged`, `clusters`, `log`.\n' +
              'Hoặc mở thẳng một trang: `overview`, `switches`, `sanction`, `health`, `data`.\n' +
              `Ví dụ: \`${p}chongbot\` • \`${p}chongbot off\` • \`${p}chongbot check @người\` • \`${p}chongbot preset strict\``,
          ),
        ],
      });
    }

    // ---- Người được nhắc tới (nếu có) ----
    let targetUser = ctx.getUser('thành_viên');
    let targetId = targetUser ? String(targetUser.id) : '';
    if (!targetId && !ctx.isSlash) {
      for (const tok of ctx.args || []) {
        const m = /^<@!?(\d{15,25})>$|^(\d{15,25})$/.exec(String(tok));
        if (m) {
          targetId = m[1] || m[2];
          break;
        }
      }
    }

    let notice = '';
    let view = 'main';
    let selectedUser = targetId || null;

    // ---- Nhật ký & các trang của trung tâm điều khiển (mở bảng luôn) ----
    if (action === 'log' || dash.VIEWS.indexOf(action) !== -1) view = action;

    // ---- Đổi mức độ ----
    if (action === 'preset') {
      let level = String(ctx.getString('mức_độ') || '').trim().toLowerCase();
      if (!level && !ctx.isSlash) {
        const map = {
          nhe: 'lenient',
          lenient: 'lenient',
          canbang: 'balanced',
          balanced: 'balanced',
          nghiemngat: 'strict',
          strict: 'strict',
        };
        for (const tok of (ctx.args || []).slice(1)) {
          const key = plain(tok).replace(/\s+/g, '');
          if (map[key]) {
            level = map[key];
            break;
          }
        }
      }
      if (!level) {
        return ctx.reply({
          embeds: [
            Embed.error(
              'Thiếu mức độ',
              'Chọn `lenient` (nhẹ), `balanced` (cân bằng) hoặc `strict` (nghiêm ngặt).\nHoặc mở bảng điều khiển rồi chọn ở menu **Mức độ**.',
            ),
          ],
        });
      }
      const res = store.applyPreset(level);
      if (!res.ok) return ctx.reply({ embeds: [Embed.error('Không đổi được', res.error)] });
      guard.refreshEngine();
      store.log('info', ctx.author.id, 'Đổi mức độ sang ' + level);
      notice = `${emoji.success} Đã đổi mức độ sang **${store.PRESET_LABELS[level]}** cho mọi máy chủ.`;
    }

    // ---- Bật / tắt công tắc ----
    const switchOps = {
      on: [
        [guard.SWITCH_AUTOMATION, true],
        [guard.SWITCH_ALT, true],
      ],
      off: [
        [guard.SWITCH_AUTOMATION, false],
        [guard.SWITCH_ALT, false],
      ],
      boton: [[guard.SWITCH_AUTOMATION, true]],
      botoff: [[guard.SWITCH_AUTOMATION, false]],
      alton: [[guard.SWITCH_ALT, true]],
      altoff: [[guard.SWITCH_ALT, false]],
    };
    if (switchOps[action]) {
      const done = [];
      for (const [key, on] of switchOps[action]) {
        const res = guard.setSwitch(key, on, ctx.author.id);
        if (res.ok) done.push(`${gs.meta(key).label}: **${on ? 'BẬT' : 'TẮT'}**`);
      }
      notice =
        (action === 'off' || action === 'botoff' || action === 'altoff' ? emoji.warning : emoji.success) +
        ' Đã áp dụng cho **toàn bộ máy chủ**:\n' +
        done.map((x) => '• ' + x).join('\n');
      client.logger?.warn?.(
        'Công tắc chống gian lận đổi bởi ' + (ctx.author.tag || ctx.author.username) + ': ' + action,
      );
    }

    // ---- Hành động cần một người cụ thể ----
    if (['check', 'trust', 'untrust', 'clear'].includes(action)) {
      if (!targetId) {
        const p = (client.config && client.config.prefix) || '!';
        return ctx.reply({
          embeds: [
            Embed.error(
              'Thiếu người cần xử lý',
              `Hãy nhắc tên hoặc nhập ID.\nVí dụ: \`${p}chongbot ${action} @người\`\nHoặc mở bảng điều khiển rồi dùng menu **Chọn một người**.`,
            ),
          ],
        });
      }
      if (action === 'trust' || action === 'untrust') {
        const on = guard.setTrusted(targetId, action === 'trust');
        notice = on
          ? `${emoji.success} Đã cho <@${targetId}> vào **danh sách tin cậy** — mọi kiểm tra chống gian lận sẽ bỏ qua người này.`
          : `${emoji.warning} Đã bỏ <@${targetId}> khỏi danh sách tin cậy — nay sẽ bị kiểm tra như mọi người.`;
      } else if (action === 'clear') {
        guard.clearPenalty(targetId);
        notice = `${emoji.success} Đã gỡ toàn bộ khoá tạm và cảnh cáo của <@${targetId}>.`;
      } else {
        guard.analyzeUser(client, targetId, Date.now());
        notice = `🔎 Đã chấm điểm lại cho <@${targetId}>.`;
      }
      selectedUser = targetId;
    }

    if (action === 'clearall') {
      const n = guard.resetAll();
      notice = n
        ? `${emoji.success} Đã gỡ khoá tạm & cảnh cáo cho **${n}** tài khoản.`
        : 'Không có tài khoản nào đang bị khoá.';
    }

    if (action === 'flagged') view = 'flagged';
    if (action === 'clusters') view = 'clusters';

    // ---- Hiển thị bảng điều khiển ----
    const viewerTag = ctx.author.tag || ctx.author.username || '';
    const msg = await ctx.reply({
      embeds: panelEmbeds(client, viewerTag, notice, view, selectedUser),
      components: panelRows(client, false, view, selectedUser),
    });
    if (!msg || typeof msg.createMessageComponentCollector !== 'function') return;

    const collector = msg.createMessageComponentCollector({ time: PANEL_TIME });
    let ended = false;

    const lock = () => {
      if (ended) return;
      ended = true;
      Promise.resolve()
        .then(() => msg.edit({ components: panelRows(client, true, view, selectedUser) }))
        .catch(() => {});
    };

    const refresh = (i, note) =>
      i
        .update({
          embeds: panelEmbeds(client, viewerTag, note, view, selectedUser),
          components: panelRows(client, false, view, selectedUser),
        })
        .catch(() => {});

    collector.on('collect', async (i) => {
      try {
        if (!i.customId || i.customId.indexOf('aa:') !== 0) return;
        if (i.user.id !== ctx.author.id) {
          return i
            .reply({ content: emoji.error + ' Bảng điều khiển này chỉ dành cho chủ bot!', flags: MessageFlags.Ephemeral })
            .catch(() => {});
        }
        if (ended) return i.deferUpdate().catch(() => {});

        // ---- Đóng ----
        if (i.customId === 'aa:close') {
          ended = true;
          await i
            .update({
              embeds: panelEmbeds(client, viewerTag, '', view, selectedUser),
              components: panelRows(client, true, view, selectedUser),
            })
            .catch(() => {});
          collector.stop('closed');
          return;
        }

        // ---- Đổi trang (một menu duy nhất cho cả hai bảng cũ) ----
        if (i.customId === 'aa:view') {
          const next = Array.isArray(i.values) && i.values.length ? String(i.values[0]) : 'main';
          view = ALL_VIEWS.indexOf(next) !== -1 ? next : 'main';
          return refresh(i, '');
        }

        // ---- Chọn người ----
        if (i.customId === 'aa:user') {
          selectedUser = Array.isArray(i.values) && i.values.length ? String(i.values[0]) : null;
          view = 'main';
          if (selectedUser && guard.isAltOn()) {
            try {
              guard.analyzeUser(client, selectedUser, Date.now());
            } catch {
              /* bỏ qua */
            }
          }
          return refresh(i, selectedUser ? '🔍 Đang xem báo cáo của <@' + selectedUser + '>.' : '');
        }
        if (i.customId === 'aa:unselect') {
          selectedUser = null;
          return refresh(i, '');
        }

        // ---- Công tắc toàn cục ----
        if (i.customId === 'aa:auto' || i.customId === 'aa:alt') {
          const key = i.customId === 'aa:auto' ? guard.SWITCH_AUTOMATION : guard.SWITCH_ALT;
          const next = !gs.isOn(key);
          const res = guard.setSwitch(key, next, i.user.id);
          const label = gs.meta(key).label;
          client.logger?.warn?.(
            'Công tắc "' + key + '" -> ' + (next ? 'BẬT' : 'TẮT') + ' bởi ' + (i.user.tag || i.user.username),
          );
          return refresh(
            i,
            res.ok
              ? `${next ? emoji.success : emoji.warning} **${label}** nay **${next ? 'BẬT' : 'TẮT'}** trên **toàn bộ máy chủ**.`
              : `${emoji.error} ${res.error}`,
          );
        }

        // ---- Bật/tắt câu đố xác minh ----
        if (i.customId === 'aa:captcha') {
          const cfg = store.getConfig();
          const next = !cfg.captchaEnabled;
          store.setConfig({ captchaEnabled: next });
          return refresh(
            i,
            next
              ? `${emoji.success} Đã bật **câu đố xác minh người thật** (khuyên dùng — giảm oan sai rất nhiều).`
              : `${emoji.warning} Đã tắt câu đố xác minh. Hệ thống sẽ **khoá tạm ngay** thay vì cho cơ hội chứng minh.`,
          );
        }

        // ---- Mức độ ----
        if (i.customId === 'aa:preset') {
          const level = Array.isArray(i.values) ? String(i.values[0]) : '';
          const res = store.applyPreset(level);
          if (res.ok) {
            guard.refreshEngine();
            store.log('info', i.user.id, 'Đổi mức độ sang ' + level);
          }
          return refresh(
            i,
            res.ok
              ? `${emoji.success} Đã đổi mức độ sang **${store.PRESET_LABELS[level] || level}** cho mọi máy chủ.`
              : `${emoji.error} ${res.error}`,
          );
        }

        // ---- Gỡ hết khoá ----
        if (i.customId === 'aa:clearall') {
          const n = guard.resetAll();
          return refresh(
            i,
            n
              ? `${emoji.success} Đã gỡ khoá tạm & cảnh cáo cho **${n}** tài khoản.`
              : 'Không có tài khoản nào đang bị khoá.',
          );
        }

        // ---- Các hành động cần người được chọn ----
        if (['aa:trust', 'aa:clear', 'aa:unlink', 'aa:rescan'].includes(i.customId)) {
          if (!selectedUser) return refresh(i, `${emoji.error} Chưa chọn người nào.`);
          if (i.customId === 'aa:trust') {
            const rep = guard.report(selectedUser);
            const on = guard.setTrusted(selectedUser, !(rep && rep.trusted));
            return refresh(
              i,
              on
                ? `${emoji.success} Đã cho <@${selectedUser}> vào **danh sách tin cậy**.`
                : `${emoji.warning} Đã bỏ <@${selectedUser}> khỏi danh sách tin cậy.`,
            );
          }
          if (i.customId === 'aa:clear') {
            guard.clearPenalty(selectedUser);
            return refresh(i, `${emoji.success} Đã gỡ khoá tạm & cảnh cáo của <@${selectedUser}>.`);
          }
          if (i.customId === 'aa:unlink') {
            const n = guard.unlinkUser(selectedUser);
            return refresh(
              i,
              n
                ? `${emoji.success} Đã xoá **${n}** liên kết của <@${selectedUser}> — người này không còn bị gần với cụm acc clone nào.`
                : `Người này vốn không có liên kết nào.`,
            );
          }
          guard.analyzeUser(client, selectedUser, Date.now());
          return refresh(i, `🔎 Đã chấm điểm lại cho <@${selectedUser}>.`);
        }

        if (i.customId === 'aa:refresh') return refresh(i, '🔄 Đã làm mới.');

        // ---- Nút của trung tâm điều khiển (đã gộp vào bảng này) ----
        const dashId = i.customId.slice(3);
        if (dash.ownsAction(dashId)) {
          const res = await dash.handleAction(i, dashId, {
            client,
            ownerTag: i.user.tag || i.user.username || viewerTag,
          });
          if (res && res.silent) return;
          return refresh(i, (res && res.note) || '');
        }

        return i.deferUpdate().catch(() => {});
      } catch (err) {
        client.logger?.error?.('Lỗi nút bảng chống gian lận: ' + (err && err.message ? err.message : err));
        i.deferUpdate?.().catch(() => {});
      }
    });

    collector.on('end', () => lock());
  },
};
