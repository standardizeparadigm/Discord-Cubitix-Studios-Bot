// =============================================================
//  Lệnh: maintenance - BẬT/TẮT CHẾ ĐỘ BẢO TRÌ (CHỈ CHỦ BOT)
//
//  Khi bật bảo trì toàn bộ: mọi lệnh prefix và slash đều bị chặn,
//  chỉ chủ bot (và những ai được miễn trừ) mới dùng được.
//
//  Tính năng:
//    - Bật/tắt tức thì, hoặc hẹn giờ tự mở lại (30m, 2h, 1h30m, 1d...)
//    - Lý do bảo trì hiển thị cho người chơi
//    - Danh sách miễn trừ theo người và theo vai trò
//    - BẢO TRÌ RIÊNG TẪNG LỆNH: khoá đúng một lệnh, các lệnh khác vẫn chạy
//    - LÀM ĐƯỢC NGAY TRÊN DASHBOARD: chọn lệnh để khoá / mở bằng menu,
//      không bắt buộc phải gõ lệnh slash nữa
//    - Mọi bảng điều khiển đang mở ĐỒNG BỘ với nhau sau mỗi thay đổi
//    - Thống kê số lệnh bị chặn, số phiên bảo trì, nhật ký thao tác
//    - Tự đổi trạng thái bot sang "Đang bảo trì" và khôi phục khi tắt
// =============================================================
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  UserSelectMenuBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
  ActivityType,
} = require('discord.js');
const Embed = require('../../core/EmbedFactory');
const { colors, emoji } = require('../../core/palette');
const mt = require('../../core/maintenanceStore');
const panels = require('../../core/maintenancePanels');

const PANEL_TIME = 180000; // bảng điều khiển sống 3 phút

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
  on: ['on', 'bat', 'enable', 'true', 'start', 'mo bao tri', 'baotri'],
  off: ['off', 'tat', 'disable', 'false', 'stop', 'end', 'ket thuc'],
  status: ['status', 'trang thai', 'trangthai', 'tt', 'info', 'panel', 'bang'],
  allow: ['allow', 'mien tru', 'mientru', 'cho phep', 'chophep', 'add'],
  deny: ['deny', 'unallow', 'go', 'bo', 'remove', 'xoa'],
  log: ['log', 'nhat ky', 'nhatky', 'lichsu', 'lich su', 'history'],
  // Bảo trì riêng theo từng lệnh
  cmd: ['cmd', 'lenh', 'command', 'baotrilenh', 'bao tri lenh', 'cmdon', 'lenhon', 'khoalenh', 'khoa lenh'],
  cmdoff: ['cmdoff', 'lenhoff', 'mo lenh', 'molenh', 'golenh', 'go lenh', 'unlock', 'mokhoalenh'],
  cmdlist: ['cmdlist', 'dslenh', 'danh sach lenh', 'danhsachlenh', 'listcmd', 'lenhlist'],
};

function resolveAction(raw) {
  const t = plain(raw);
  if (!t) return 'status';
  for (const key of Object.keys(ACTIONS)) {
    if (key === t) return key;
    if (ACTIONS[key].indexOf(t) !== -1) return key;
  }
  return null;
}

// Thanh tiến độ cho lần bảo trì có hẹn giờ.
function progressBar(done, total, size) {
  const width = size || 14;
  const d = Number(done);
  const t = Number(total);
  if (!Number.isFinite(d) || !Number.isFinite(t) || t <= 0) return '';
  const ratio = Math.min(1, Math.max(0, d / t));
  const filled = Math.round(ratio * width);
  return '`' + '\u2588'.repeat(filled) + '\u2591'.repeat(Math.max(0, width - filled)) + '` ' + Math.round(ratio * 100) + '%';
}

function mentionList(ids, prefix, limit) {
  const max = limit || 12;
  if (!ids || !ids.length) return '_Chưa có_';
  const shown = ids.slice(0, max).map((id) => '<@' + prefix + id + '>').join(' \u2022 ');
  const rest = ids.length - max;
  return (rest > 0 ? shown + '\n\u2026 và ' + rest + ' mục nữa' : shown).slice(0, 1000);
}

function stamp(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return 'không rõ';
  return '<t:' + Math.floor(n / 1000) + ':R>';
}

// Đổi trạng thái hiển thị của bot. Không bao giờ được phép ném lỗi.
function applyPresence(client, on) {
  try {
    if (!client || !client.user || typeof client.user.setPresence !== 'function') return;
    if (on) {
      client.presenceLocked = true;
      client.user.setPresence({
        status: 'dnd',
        activities: [{ name: '\ud83d\udd27 Đang bảo trì...', type: ActivityType.Playing }],
      });
    } else {
      client.presenceLocked = false;
      client.user.setPresence({ status: 'online', activities: [] });
    }
  } catch (_) {
    /* bỏ qua: không để việc đổi trạng thái làm hỏng lệnh */
  }
}

// ---------- Bảng điều khiển ----------
// view: 'main' = bảng chính, 'cmd' = trang bảo trì theo từng lệnh
function renderPanel(client, viewerTag, notice, view, category) {
  const s = mt.getState();
  const on = s.enabled === true;
  const cmds = Array.isArray(s.commandList) ? s.commandList : [];

  // SỬA LỖI: trước đây bảng luôn báo "ĐANG TẮT" dù đang có lệnh bị bảo trì riêng,
  // khiến người dùng tưởng tính năng bảo trì theo lệnh không hoạt động.
  let color;
  let title;
  let head;
  if (on) {
    color = colors.error;
    title = '\ud83d\udd27 CHẾ ĐỘ BẢO TRÌ \u2014 ĐANG BẬT';
    head =
      '\ud83d\udd34 Bot **chỉ nhận lệnh từ chủ bot** và những người/vai trò được miễn trừ.\n' +
      'Mọi lệnh prefix và slash của người khác đều bị từ chối.';
  } else if (cmds.length) {
    color = colors.warning;
    title = '\ud83e\uddf0 BẢO TRÌ RIÊNG \u2014 ' + cmds.length + ' LỆNH ĐANG KHOÁ';
    head =
      '\ud83d\udfe1 Bot vẫn hoạt động bình thường, nhưng **' + cmds.length + ' lệnh** đang bị khoá riêng.\n' +
      'Nhấn **\ud83e\uddf0 Bảo trì theo lệnh** để khoá / mở từng lệnh.';
  } else {
    color = colors.success;
    title = '\u2705 CHẾ ĐỘ BẢO TRÌ \u2014 ĐANG TẮT';
    head = '\ud83d\udfe2 Bot đang hoạt động bình thường, **mọi người đều dùng được lệnh**.';
  }

  const bar = on && s.until && s.elapsed >= 0 ? progressBar(s.elapsed, s.elapsed + s.remaining) : '';

  // ----- Trang "bảo trì theo lệnh" -----
  if (view === 'cmd') {
    const catText = category ? ' \u2022 nhóm **' + category + '**' : '';
    const e = Embed.custom(
      color,
      '\ud83e\uddf0 BẢO TRÌ THEO TẪNG LỆNH',
      (notice ? '\u276f ' + String(notice).slice(0, 400) + '\n\n' : '') +
        'Chọn nhóm lệnh \u2192 chọn lệnh để **khoá**, hoặc dùng menu dưới cùng để **mở lại**.' + catText + '\n' +
        'Có thể nhấn **⌨\ufe0f Nhập tên lệnh** để gõ trực tiếp tên lệnh + thời lượng + lý do.',
    );

    const detail = cmds.length
      ? cmds
          .slice(0, 12)
          .map(
            (c) =>
              '\u2022 `' + c.name + '` \u2014 ' +
              (c.remaining > 0 ? 'mở lại ' + stamp(c.until) + ' (còn ' + mt.formatDuration(c.remaining) + ')' : 'không hẹn giờ') +
              (c.reason ? '\n\u2514 ' + String(c.reason).slice(0, 90) : ''),
          )
          .join('\n')
      : '_Không có lệnh nào đang bị khoá._';

    e.addFields({
      name: '\ud83d\udd12 Đang khoá (' + cmds.length + ')',
      value: (detail + (cmds.length > 12 ? '\n\u2026 và ' + (cmds.length - 12) + ' lệnh nữa' : '')).slice(0, 1000),
      inline: false,
    });

    if (on) {
      e.addFields({
        name: '\u26a0\ufe0f Lưu ý',
        value: 'Bot đang bảo trì **toàn bộ**, nên mọi lệnh đều bị chặn bất kể danh sách trên.',
        inline: false,
      });
    }

    e.setFooter({ text: (viewerTag ? viewerTag + ' \u2022 ' : '') + 'Nhấn ◀ Quay lại để về bảng chính \u2022 Tự khoá sau 3 phút' });
    e.setTimestamp(new Date());
    return e;
  }

  // ----- Bảng chính -----
  const desc =
    (notice ? '\u276f ' + String(notice).slice(0, 300) + '\n\n' : '') +
    head +
    (bar ? '\n\n**Tiến độ phiên bảo trì**\n' + bar : '');

  const e = Embed.custom(color, title, desc);

  e.addFields({
    name: '\ud83d\udcdd Lý do',
    value: on ? (s.reason ? s.reason.slice(0, 1000) : '_Không nêu lý do_') : '_Không áp dụng_',
    inline: false,
  });

  if (on) {
    e.addFields(
      { name: '\u23f1\ufe0f Bắt đầu', value: s.since ? stamp(s.since) : 'không rõ', inline: true },
      {
        name: '\u23f3 Tự mở lại',
        value: s.until ? stamp(s.until) + '\n(còn ' + mt.formatDuration(s.remaining) + ')' : 'Không hẹn giờ',
        inline: true,
      },
      { name: '\ud83d\udc51 Người bật', value: s.by ? '<@' + s.by + '>' : 'không rõ', inline: true },
      { name: '\ud83d\udeab Lệnh bị chặn (phiên này)', value: String(s.blocked || 0), inline: true },
    );
  }

  const cmdText = cmds.length
    ? (cmds
        .slice(0, 10)
        .map(
          (c) =>
            '\u2022 `' +
            c.name +
            '` \u2014 ' +
            (c.remaining > 0 ? 'còn ' + mt.formatDuration(c.remaining) : 'không hẹn giờ') +
            (c.reason ? '\n\u2514 ' + c.reason.slice(0, 100) : ''),
        )
        .join('\n') + (cmds.length > 10 ? '\n\u2026 và ' + (cmds.length - 10) + ' lệnh nữa' : '')).slice(0, 1000)
    : '_Không có_';

  e.addFields(
    {
      name: '\ud83c\udfab Người được miễn trừ (' + s.allowlist.length + ')',
      value: mentionList(s.allowlist, ''),
      inline: false,
    },
    {
      name: '\ud83c\udff7\ufe0f Vai trò được miễn trừ (' + s.allowRoles.length + ')',
      value: mentionList(s.allowRoles, '&'),
      inline: false,
    },
    {
      name: '\ud83e\uddf0 Lệnh đang bảo trì riêng (' + cmds.length + ')',
      value: cmdText,
      inline: false,
    },
    { name: '\ud83d\udcca Tổng lệnh đã chặn', value: String(s.totalBlocked || 0), inline: true },
    { name: '\ud83d\udd01 Số phiên bảo trì', value: String(s.sessions || 0), inline: true },
    {
      name: '\ud83d\udd52 Lần chặn gần nhất',
      value: s.lastBlockedAt ? stamp(s.lastBlockedAt) : 'Chưa có',
      inline: true,
    },
  );

  e.setFooter({
    text:
      (viewerTag ? viewerTag + ' \u2022 ' : '') +
      'Menu dưới để thêm/gỡ miễn trừ \u2022 Bảng tự khoá sau 3 phút',
  });
  e.setTimestamp(new Date());
  return e;
}

// Lấy danh sách nhóm lệnh (bỏ những nhóm rỗng sau khi loại `maintenance`).
function categoriesOf(client) {
  const set = new Set();
  for (const c of client.commands.values()) {
    if (c.name === 'maintenance') continue;
    set.add(c.category || 'khác');
  }
  return Array.from(set).sort();
}

function commandsIn(client, category) {
  return Array.from(client.commands.values())
    .filter((c) => c.name !== 'maintenance' && (c.category || 'khác') === category)
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 25);
}

function panelRows(client, disabled, view, category) {
  const s = mt.getState();
  const on = s.enabled === true;
  const off = Boolean(disabled);
  const cmds = Array.isArray(s.commandList) ? s.commandList : [];

  // ================= TRANG BẢO TRÌ THEO LỆNH =================
  if (view === 'cmd') {
    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('mt:back').setLabel('Quay lại').setEmoji('\u25c0\ufe0f').setStyle(ButtonStyle.Secondary).setDisabled(off),
      new ButtonBuilder().setCustomId('mt:refresh').setLabel('Làm mới').setEmoji('\ud83d\udd04').setStyle(ButtonStyle.Secondary).setDisabled(off),
      new ButtonBuilder().setCustomId('mt:cmdtype').setLabel('Nhập tên lệnh').setEmoji('\u2328\ufe0f').setStyle(ButtonStyle.Primary).setDisabled(off),
      new ButtonBuilder()
        .setCustomId('mt:cmdclear')
        .setLabel('Mở lại mọi lệnh')
        .setEmoji('\ud83e\uddf9')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(off || !cmds.length),
      new ButtonBuilder().setCustomId('mt:close').setLabel('Đóng').setEmoji('\u2716\ufe0f').setStyle(ButtonStyle.Secondary).setDisabled(off),
    );

    const cats = categoriesOf(client);
    const catSel = new StringSelectMenuBuilder()
      .setCustomId('mt:cmdcat')
      .setPlaceholder('\ud83d\udcc1 Bước 1 \u2014 chọn nhóm lệnh' + (category ? ' (đang xem: ' + category + ')' : ''))
      .setMinValues(1)
      .setMaxValues(1)
      .setDisabled(off || !cats.length)
      .addOptions(
        (cats.length ? cats : ['khác']).slice(0, 25).map((c) => ({
          label: String(c).slice(0, 100),
          value: String(c).slice(0, 100),
          description: 'Xem các lệnh trong nhóm ' + String(c).slice(0, 60),
          default: c === category,
        })),
      );
    const row2 = new ActionRowBuilder().addComponents(catSel);

    // Bước 2: chọn lệnh để khoá (chỉ hiện khi đã chọn nhóm).
    const list = category ? commandsIn(client, category) : [];
    const downSet = new Set(cmds.map((c) => c.name));
    const lockSel = new StringSelectMenuBuilder()
      .setCustomId('mt:cmdlock')
      .setPlaceholder(category ? '\ud83d\udd12 Bước 2 \u2014 chọn lệnh để khoá' : '\ud83d\udd12 Bước 2 \u2014 hãy chọn nhóm trước')
      .setMinValues(1)
      .setMaxValues(1)
      .setDisabled(off || !list.length)
      .addOptions(
        list.length
          ? list.map((c) => ({
              label: (downSet.has(c.name) ? '\ud83d\udd12 ' : '') + c.name.slice(0, 90),
              value: c.name.slice(0, 100),
              description: String(c.description || 'Không có mô tả').slice(0, 100),
            }))
          : [{ label: 'Chưa chọn nhóm lệnh', value: '__none__', description: 'Hãy chọn nhóm ở menu phía trên' }],
      );
    const row3 = new ActionRowBuilder().addComponents(lockSel);

    // Mở lại: chỉ liệt kê những lệnh đang bị khoá.
    const unlockSel = new StringSelectMenuBuilder()
      .setCustomId('mt:cmdunlock')
      .setPlaceholder(cmds.length ? '\ud83d\udd13 Chọn lệnh để mở lại' : '\ud83d\udd13 Không có lệnh nào đang khoá')
      .setMinValues(1)
      .setMaxValues(Math.min(10, Math.max(1, cmds.length)))
      .setDisabled(off || !cmds.length)
      .addOptions(
        cmds.length
          ? cmds.slice(0, 25).map((c) => ({
              label: c.name.slice(0, 90),
              value: c.name.slice(0, 100),
              description: (c.remaining > 0 ? 'Còn ' + mt.formatDuration(c.remaining) : 'Không hẹn giờ').slice(0, 100),
            }))
          : [{ label: 'Không có lệnh nào đang khoá', value: '__none__' }],
      );
    const row4 = new ActionRowBuilder().addComponents(unlockSel);

    return [row1, row2, row3, row4];
  }

  // ================= BẢNG CHÍNH =================
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mt:toggle')
      .setLabel(on ? 'Mở lại bot' : 'Bật bảo trì')
      .setEmoji(on ? '\u2705' : '\ud83d\udd27')
      .setStyle(on ? ButtonStyle.Success : ButtonStyle.Danger)
      .setDisabled(off),
    new ButtonBuilder().setCustomId('mt:refresh').setLabel('Làm mới').setEmoji('\ud83d\udd04').setStyle(ButtonStyle.Secondary).setDisabled(off),
    new ButtonBuilder().setCustomId('mt:log').setLabel('Nhật ký').setEmoji('\ud83d\udcdc').setStyle(ButtonStyle.Secondary).setDisabled(off),
    new ButtonBuilder()
      .setCustomId('mt:clear')
      .setLabel('Xoá miễn trừ')
      .setEmoji('\ud83e\uddf9')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(off || !(s.allowlist.length + s.allowRoles.length)),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('mt:ext').setLabel('+30 phút').setEmoji('\u23f3').setStyle(ButtonStyle.Primary).setDisabled(off || !on),
    new ButtonBuilder()
      .setCustomId('mt:notimer')
      .setLabel('Bỏ hẹn giờ')
      .setEmoji('\u267e\ufe0f')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(off || !on || !s.until),
    // MỚI: vào thẳng trang bảo trì theo lệnh ngay trên dashboard.
    new ButtonBuilder()
      .setCustomId('mt:cmdview')
      .setLabel(cmds.length ? 'Bảo trì theo lệnh (' + cmds.length + ')' : 'Bảo trì theo lệnh')
      .setEmoji('\ud83e\uddf0')
      .setStyle(cmds.length ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(off),
    new ButtonBuilder().setCustomId('mt:close').setLabel('Đóng').setEmoji('\u2716\ufe0f').setStyle(ButtonStyle.Secondary).setDisabled(off),
  );

  const row3 = new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId('mt:usel')
      .setPlaceholder('\ud83c\udfab Chọn người để thêm / gỡ miễn trừ')
      .setMinValues(1)
      .setMaxValues(10)
      .setDisabled(off),
  );

  const row4 = new ActionRowBuilder().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId('mt:rsel')
      .setPlaceholder('\ud83c\udff7\ufe0f Chọn vai trò để thêm / gỡ miễn trừ')
      .setMinValues(1)
      .setMaxValues(10)
      .setDisabled(off),
  );

  return [row1, row2, row3, row4];
}

const LOG_LABEL = {
  on: '\ud83d\udd27 Bật bảo trì',
  off: '\u2705 Tắt bảo trì',
  update: '\u270f\ufe0f Cập nhật',
  'auto-off': '\u23f0 Tự mở lại',
  extend: '\u23f3 Gia hạn',
  'no-timer': '\u267e\ufe0f Bỏ hẹn giờ',
  reason: '\ud83d\udcdd Đổi lý do',
  allow: '\ud83c\udfab Miễn trừ',
  deny: '\ud83d\udeab Gỡ miễn trừ',
  'allow-role': '\ud83c\udff7\ufe0f Miễn trừ vai trò',
  'deny-role': '\ud83d\udeab Gỡ miễn trừ vai trò',
  'deny-all': '\ud83e\uddf9 Xoá miễn trừ',
  'clear-log': '\ud83e\uddf9 Xoá nhật ký',
  'cmd-on': '\ud83e\uddf0 Bảo trì lệnh',
  'cmd-update': '\u270f\ufe0f Cập nhật bảo trì lệnh',
  'cmd-off': '\u2705 Mở lại lệnh',
  'cmd-off-all': '\ud83e\uddf9 Mở lại mọi lệnh',
  'cmd-auto-off': '\u23f0 Lệnh tự mở lại',
};

function renderLog() {
  const s = mt.getState();
  if (!s.log.length) return Embed.info('Nhật ký bảo trì', 'Chưa có thao tác nào được ghi lại.');
  const lines = s.log
    .slice(-15)
    .reverse()
    .map((entry) => {
      const label = LOG_LABEL[entry.action] || entry.action || 'thao tác';
      const who = entry.by ? ' \u2022 bởi <@' + entry.by + '>' : '';
      return '**' + label + '** \u2014 ' + stamp(entry.at) + who + (entry.note ? '\n\u2514 ' + entry.note.slice(0, 150) : '');
    });
  return Embed.custom(colors.info, '\ud83d\udcdc Nhật ký bảo trì', lines.join('\n').slice(0, 4000)).setFooter({
    text: 'Hiển thị ' + Math.min(15, s.log.length) + '/' + s.log.length + ' thao tác gần nhất',
  });
}

function renderCommandList() {
  const list = mt.listCommands();
  if (!list.length) {
    return Embed.info('Lệnh đang bảo trì riêng', 'Hiện **không có lệnh nào** bị bảo trì riêng. Toàn bộ lệnh đang hoạt động bình thường.');
  }
  const lines = list.map((c, idx) => {
    const when = c.remaining > 0 ? 'mở lại ' + stamp(c.until) + ' (còn ' + mt.formatDuration(c.remaining) + ')' : 'không hẹn giờ';
    return (
      '**' + (idx + 1) + '. `' + c.name + '`** \u2014 ' + when +
      (c.by ? '\n\u2514 bởi <@' + c.by + '>' : '') +
      (c.reason ? '\n\u2514 ' + c.reason.slice(0, 200) : '')
    );
  });
  return Embed.custom(colors.warning, '\ud83e\uddf0 Lệnh đang bảo trì riêng (' + list.length + ')', lines.join('\n\n').slice(0, 4000)).setFooter({
    text: 'Các lệnh không có trong danh sách này vẫn hoạt động bình thường',
  });
}

// Tìm lệnh theo tên hoặc tên gọi khác, trả về lệnh gốc.
function findCommand(client, rawName) {
  const key = String(rawName || '').trim().toLowerCase().replace(/^[/!.]+/, '');
  if (!key) return null;
  return client.commands.get(key) || client.commands.get(client.aliases.get(key)) || null;
}

// ---------- Khai báo lệnh ----------
module.exports = {
  name: 'maintenance',
  aliases: ['baotri', 'bao-tri', 'bt', 'maint', 'mtn'],
  category: 'owner',
  description: 'Bảo trì toàn bot hoặc bảo trì riêng từng lệnh (chỉ chủ bot)',
  usage:
    '[on|off|status|allow|deny|log] [thời lượng] [lý do]\n' +
    'cmd <tên lệnh> [thời lượng] [lý do] \u2022 cmdoff <tên lệnh> \u2022 cmdlist',
  cooldown: 3,
  ownerOnly: true,
  slash: true,
  options: [
    {
      name: 'hành_động',
      type: 'string',
      description: 'Bật, tắt, xem trạng thái, miễn trừ, gỡ miễn trừ hoặc xem nhật ký',
      required: false,
      choices: [
        { name: 'Bật bảo trì', value: 'on' },
        { name: 'Tắt bảo trì (mở lại bot)', value: 'off' },
        { name: 'Xem bảng điều khiển', value: 'status' },
        { name: 'Miễn trừ cho một người', value: 'allow' },
        { name: 'Gỡ miễn trừ', value: 'deny' },
        { name: 'Xem nhật ký', value: 'log' },
        { name: 'Bảo trì riêng một lệnh', value: 'cmd' },
        { name: 'Mở lại một lệnh', value: 'cmdoff' },
        { name: 'Xem các lệnh đang bảo trì riêng', value: 'cmdlist' },
      ],
    },
    {
      name: 'thời_lượng',
      type: 'string',
      description: 'Ví dụ: 30m, 2h, 1h30m, 1d. Bỏ trống hoặc 0 = không hẹn giờ',
      required: false,
    },
    {
      name: 'lý_do',
      type: 'string',
      description: 'Lý do bảo trì, sẽ hiện cho người chơi thấy',
      required: false,
      rest: true,
    },
    {
      name: 'thành_viên',
      type: 'user',
      description: 'Người cần miễn trừ / gỡ miễn trừ',
      required: false,
    },
    {
      name: 'vai_trò',
      type: 'role',
      description: 'Vai trò cần miễn trừ / gỡ miễn trừ (cả vai trò đều dùng được lệnh)',
      required: false,
    },
    // ĐẶT CUỐI CÙNG: giữ nguyên thứ tự tham số theo vị trí của chế độ prefix.
    {
      name: 'lệnh',
      type: 'string',
      description: 'Tên lệnh cần bảo trì riêng / mở lại (dùng với hành động cmd, cmdoff)',
      required: false,
      autocomplete: true,
    },
  ],

  // Gợi ý tên lệnh cho tham số "lệnh".
  async autocomplete(interaction, client) {
    try {
      const focused = interaction.options.getFocused(true);
      if (!focused || focused.name !== 'lệnh') return interaction.respond([]).catch(() => {});
      const q = String(focused.value || '').trim().toLowerCase().replace(/^[/!.]+/, '');
      const down = new Set(mt.listCommands().map((c) => c.name));
      const names = Array.from(client.commands.keys())
        .filter((n) => n !== 'maintenance')
        .filter((n) => !q || n.indexOf(q) !== -1)
        .sort((a, b) => {
          const da = down.has(a) ? 0 : 1;
          const db = down.has(b) ? 0 : 1;
          if (da !== db) return da - db;
          return a.localeCompare(b);
        })
        .slice(0, 25);
      await interaction.respond(names.map((n) => ({ name: (down.has(n) ? '\ud83e\uddf0 ' : '') + n, value: n })));
    } catch (_) {
      interaction.respond([]).catch(() => {});
    }
  },

  async run(ctx) {
    const client = ctx.client;
    const ownerId = String((client.config && client.config.ownerId) || '');
    const rawAction = ctx.getString('hành_động');
    const action = resolveAction(rawAction);

    if (!action) {
      return ctx.reply({
        embeds: [
          Embed.error(
            'Hành động không hợp lệ',
            'Chọn một trong: `on`, `off`, `status`, `allow`, `deny`, `log`, `cmd`, `cmdoff`, `cmdlist`.\n' +
              'Ví dụ: `' + (client.config.prefix || '!') + 'baotri on 30m Đang cập nhật tính năng mới`\n' +
              'Ví dụ: `' + (client.config.prefix || '!') + 'baotri cmd work 30m Đang cân bằng lại thu nhập`',
          ),
        ],
      });
    }

    // ----- Miễn trừ / gỡ miễn trừ (cho cả người và vai trò) -----
    let notice = '';
    let changed = false;

    if (action === 'allow' || action === 'deny') {
      const targetUser = ctx.getUser('thành_viên');
      let targetRole = null;
      try {
        targetRole = ctx.getRole('vai_trò');
      } catch (_) {
        targetRole = null;
      }

      const rawArg = (ctx.getString('thời_lượng') || '').trim();
      const roleMention = /^<@&(\d{15,25})>$/.exec(rawArg);
      const bareId = /^(\d{15,25})$/.exec(rawArg.replace(/^<@[!&]?/, '').replace(/>$/, ''));

      let targetId = '';
      let isRole = false;

      if (targetRole) {
        targetId = String(targetRole.id);
        isRole = true;
      } else if (targetUser) {
        targetId = String(targetUser.id);
      } else if (roleMention) {
        targetId = roleMention[1];
        isRole = true;
      } else if (/^@?everyone$/i.test(rawArg) && ctx.guild) {
        targetId = String(ctx.guild.id);
        isRole = true;
      } else if (bareId) {
        targetId = bareId[1];
        try {
          if (ctx.guild && ctx.guild.roles && ctx.guild.roles.cache && ctx.guild.roles.cache.has(targetId)) {
            isRole = true;
          }
        } catch (_) {
          /* không tra được thì cứ coi là người dùng */
        }
      }

      if (!targetId) {
        const p = (client.config && client.config.prefix) || '!';
        return ctx.reply({
          embeds: [
            Embed.error(
              'Thiếu người hoặc vai trò',
              'Hãy nhắc tên người, nhắc vai trò, hoặc nhập ID.\n' +
                '\u2022 `' + p + 'baotri ' + action + ' @ai_đó`\n' +
                '\u2022 `' + p + 'baotri ' + action + ' @Tên_Vai_Trò`\n' +
                '\u2022 `' + p + 'baotri ' + action + ' 123456789012345678`',
            ),
          ],
        });
      }
      if (!isRole && targetId === ownerId) {
        return ctx.reply({
          embeds: [Embed.warn('Không cần thiết', 'Chủ bot luôn dùng được lệnh kể cả khi đang bảo trì.')],
        });
      }

      let res;
      if (action === 'allow') {
        res = isRole ? mt.allowRole(targetId, ctx.author.id) : mt.allow(targetId, ctx.author.id);
      } else {
        res = isRole ? mt.disallowRole(targetId, ctx.author.id) : mt.disallow(targetId, ctx.author.id);
      }
      if (!res.ok) return ctx.reply({ embeds: [Embed.error('Không thực hiện được', res.error)] });

      const tag = isRole ? '<@&' + targetId + '>' : '<@' + targetId + '>';
      notice =
        action === 'allow'
          ? emoji.success + ' Đã miễn trừ cho ' + tag + ' \u2014 **vẫn dùng được lệnh** trong lúc bảo trì.'
          : emoji.success + ' Đã gỡ miễn trừ của ' + tag + ' \u2014 nay **sẽ bị chặn** như mọi người.';
      changed = true;
    }

    // ----- Xem danh sách lệnh đang bảo trì riêng -----
    if (action === 'cmdlist') {
      return ctx.reply({ embeds: [renderCommandList()] });
    }

    // ----- Bảo trì riêng theo từng lệnh -----
    if (action === 'cmd' || action === 'cmdoff') {
      let cmdRaw = '';
      let durRaw = '';
      let reasonRaw = '';

      if (ctx.isSlash) {
        cmdRaw = (ctx.getString('lệnh') || '').trim();
        durRaw = (ctx.getString('thời_lượng') || '').trim();
        reasonRaw = (ctx.getString('lý_do') || '').trim();
      } else {
        // Prefix: <hành động> <tên lệnh> [thời lượng] [lý do]
        const parts = Array.isArray(ctx.args) ? ctx.args.slice(1) : [];
        cmdRaw = String(parts.shift() || '').trim();
        if (parts.length && /^\d/.test(parts[0])) {
          const test = mt.parseDuration(parts[0]);
          if (test && !test.error && test.ms > 0) durRaw = String(parts.shift());
        }
        reasonRaw = parts.join(' ').trim();
      }

      const p = (client.config && client.config.prefix) || '!';
      if (!cmdRaw) {
        return ctx.reply({
          embeds: [
            Embed.error(
              'Thiếu tên lệnh',
              'Hãy cho biết lệnh nào cần ' + (action === 'cmd' ? 'bảo trì' : 'mở lại') + '.\n' +
                '\u2022 `' + p + 'baotri cmd work 30m Sửa lỗi tiền thưởng`\n' +
                '\u2022 `' + p + 'baotri cmdoff work`\n' +
                '\u2022 `' + p + 'baotri cmdlist`\n' +
                'Hoặc mở `' + p + 'baotri` rồi bấm **\ud83e\uddf0 Bảo trì theo lệnh**.',
            ),
          ],
        });
      }

      const target = findCommand(client, cmdRaw);
      if (!target) {
        return ctx.reply({
          embeds: [
            Embed.error('Không tìm thấy lệnh', 'Không có lệnh nào tên `' + cmdRaw.slice(0, 40) + '`. Dùng `' + p + 'help` để xem danh sách lệnh.'),
          ],
        });
      }
      if (target.name === 'maintenance') {
        return ctx.reply({
          embeds: [Embed.warn('Không thể bảo trì lệnh này', 'Phải giữ `maintenance` hoạt động thì mới tắt bảo trì lại được.')],
        });
      }

      if (action === 'cmd') {
        const parsed = mt.parseDuration(durRaw);
        if (parsed.error) return ctx.reply({ embeds: [Embed.error('Thời lượng không hợp lệ', parsed.error)] });
        const res = mt.enableCommand(target.name, { reason: reasonRaw, ms: parsed.ms, by: ctx.author.id });
        if (!res.ok) return ctx.reply({ embeds: [Embed.error('Không thực hiện được', res.error)] });
        notice =
          emoji.success +
          ' Đã bảo trì riêng lệnh `' + target.name + '`' +
          (parsed.ms > 0 ? ' trong **' + mt.formatDuration(parsed.ms) + '**' : ' (không hẹn giờ)') +
          '. Các lệnh khác **vẫn chạy bình thường**.';
        client.logger?.warn?.('Bảo trì riêng lệnh "' + target.name + '" bởi ' + (ctx.author.tag || ctx.author.username));
      } else {
        const res = mt.disableCommand(target.name, ctx.author.id);
        if (!res.ok) return ctx.reply({ embeds: [Embed.error('Không thực hiện được', res.error)] });
        notice = emoji.success + ' Đã mở lại lệnh `' + target.name + '`.';
        client.logger?.info?.('Mở lại lệnh "' + target.name + '" bởi ' + (ctx.author.tag || ctx.author.username));
      }
      changed = true;
    }

    // ----- Xem nhật ký -----
    if (action === 'log') {
      return ctx.reply({ embeds: [renderLog()] });
    }

    // ----- Bật bảo trì -----
    if (action === 'on') {
      const parsed = mt.parseDuration(ctx.getString('thời_lượng'));
      if (parsed.error) return ctx.reply({ embeds: [Embed.error('Thời lượng không hợp lệ', parsed.error)] });
      const reason = (ctx.getString('lý_do') || '').trim();
      mt.enable({ reason, ms: parsed.ms, by: ctx.author.id });
      applyPresence(client, true);
      changed = true;
      client.logger?.warn?.('ĐÃ BẬT BẢO TRÌ bởi ' + (ctx.author.tag || ctx.author.username));
    }

    // ----- Tắt bảo trì -----
    if (action === 'off') {
      const was = mt.getState();
      mt.disable({ by: ctx.author.id });
      applyPresence(client, false);
      changed = true;
      if (was.enabled) {
        client.logger?.info?.('ĐÃ TẮT BẢO TRÌ bởi ' + (ctx.author.tag || ctx.author.username));
      }
    }

    // SỬA LỖI: đồng bộ mọi bảng điều khiển đang mở sau khi dùng lệnh prefix/slash.
    if (changed) panels.syncAll();

    // ----- Hiển thị bảng điều khiển (dùng chung cho on/off/status/cmd/allow) -----
    const viewerTag = ctx.author.tag || ctx.author.username || '';
    // Vào thẳng trang "theo lệnh" nếu người dùng vừa thao tác với lệnh.
    let view = action === 'cmd' || action === 'cmdoff' ? 'cmd' : 'main';
    let category = null;

    const msg = await ctx.reply({
      embeds: [renderPanel(client, viewerTag, notice, view, category)],
      components: panelRows(client, false, view, category),
    });
    if (!msg || typeof msg.createMessageComponentCollector !== 'function') return;

    const collector = msg.createMessageComponentCollector({ time: PANEL_TIME });
    let ended = false;

    // Ghi danh bảng này để các thay đổi ở nơi khác cũng làm nó tự cập nhật.
    const panel = {
      id: msg.id,
      ended: false,
      render: () =>
        msg
          .edit({
            embeds: [renderPanel(client, viewerTag, '', view, category)],
            components: panelRows(client, false, view, category),
          })
          .catch(() => {}),
    };
    const unregister = panels.register(panel);

    const lock = () => {
      if (ended) return;
      ended = true;
      panel.ended = true;
      unregister();
      Promise.resolve()
        .then(() => msg.edit({ components: panelRows(client, true, view, category) }))
        .catch(() => {});
    };

    // Cập nhật chính bảng này rồi đồng bộ các bảng còn lại.
    const refresh = async (i, note) => {
      await i
        .update({
          embeds: [renderPanel(client, viewerTag, note, view, category)],
          components: panelRows(client, false, view, category),
        })
        .catch(() => {});
      panels.syncAll(msg.id);
    };

    collector.on('collect', async (i) => {
      try {
        if (!i.customId || i.customId.indexOf('mt:') !== 0) return;
        if (i.user.id !== ctx.author.id) {
          return i
            .reply({ content: emoji.error + ' Bảng điều khiển này chỉ dành cho chủ bot!', flags: MessageFlags.Ephemeral })
            .catch(() => {});
        }
        if (ended) return i.deferUpdate().catch(() => {});

        // ---- Nhật ký (riêng tư) ----
        if (i.customId === 'mt:log') {
          return i.reply({ embeds: [renderLog()], flags: MessageFlags.Ephemeral }).catch(() => {});
        }

        // ---- Chuyển trang ----
        if (i.customId === 'mt:cmdview') {
          view = 'cmd';
          return refresh(i, '\ud83e\uddf0 Chọn nhóm lệnh để bắt đầu.');
        }
        if (i.customId === 'mt:back') {
          view = 'main';
          category = null;
          return refresh(i, '');
        }

        // ---- Chọn nhóm lệnh ----
        if (i.customId === 'mt:cmdcat') {
          category = Array.isArray(i.values) ? i.values[0] : null;
          return refresh(i, '\ud83d\udcc1 Nhóm **' + category + '** \u2014 giờ hãy chọn lệnh để khoá.');
        }

        // ---- Khoá một lệnh (mở hộp thoại nhập thời lượng + lý do) ----
        if (i.customId === 'mt:cmdlock' || i.customId === 'mt:cmdtype') {
          const preset = i.customId === 'mt:cmdlock' && Array.isArray(i.values) ? i.values[0] : '';
          if (preset === '__none__') return i.deferUpdate().catch(() => {});

          const modalId = 'mt:modal:' + Date.now();
          const modal = new ModalBuilder().setCustomId(modalId).setTitle('Bảo trì riêng một lệnh');

          const nameInput = new TextInputBuilder()
            .setCustomId('name')
            .setLabel('Tên lệnh')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('ví dụ: work')
            .setRequired(true)
            .setMaxLength(32);
          if (preset) nameInput.setValue(preset);

          const durInput = new TextInputBuilder()
            .setCustomId('dur')
            .setLabel('Thời lượng (bỏ trống = không hẹn giờ)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('30m, 2h, 1h30m, 1d')
            .setRequired(false)
            .setMaxLength(16);

          const reasonInput = new TextInputBuilder()
            .setCustomId('reason')
            .setLabel('Lý do (hiện cho người chơi)')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Đang sửa lỗi tiền thưởng...')
            .setRequired(false)
            .setMaxLength(300);

          modal.addComponents(
            new ActionRowBuilder().addComponents(nameInput),
            new ActionRowBuilder().addComponents(durInput),
            new ActionRowBuilder().addComponents(reasonInput),
          );

          await i.showModal(modal).catch(() => {});
          const submitted = await i
            .awaitModalSubmit({
              time: 120000,
              filter: (m) => m.customId === modalId && m.user.id === i.user.id,
            })
            .catch(() => null);
          if (!submitted) return;

          const rawName = submitted.fields.getTextInputValue('name');
          const rawDur = submitted.fields.getTextInputValue('dur');
          const rawReason = submitted.fields.getTextInputValue('reason');

          const target = findCommand(client, rawName);
          let note;
          if (!target) {
            note = emoji.error + ' Không có lệnh nào tên `' + String(rawName).slice(0, 30) + '`.';
          } else if (target.name === 'maintenance') {
            note = emoji.error + ' Không thể khoá chính lệnh `maintenance`.';
          } else {
            const parsed = mt.parseDuration(rawDur);
            if (parsed.error) {
              note = emoji.error + ' Thời lượng không hợp lệ: ' + parsed.error;
            } else {
              const res = mt.enableCommand(target.name, {
                reason: String(rawReason || '').trim(),
                ms: parsed.ms,
                by: submitted.user.id,
              });
              note = res.ok
                ? emoji.success + ' Đã khoá lệnh `' + target.name + '`' +
                  (parsed.ms > 0 ? ' trong **' + mt.formatDuration(parsed.ms) + '**' : ' (không hẹn giờ)') + '.'
                : emoji.error + ' ' + res.error;
              if (res.ok) {
                client.logger?.warn?.('Bảo trì riêng lệnh "' + target.name + '" bởi ' + (submitted.user.tag || submitted.user.username));
              }
            }
          }

          await submitted.deferUpdate().catch(() => {});
          await msg
            .edit({
              embeds: [renderPanel(client, viewerTag, note, view, category)],
              components: panelRows(client, false, view, category),
            })
            .catch(() => {});
          panels.syncAll(msg.id);
          return;
        }

        // ---- Mở lại lệnh đã chọn ----
        if (i.customId === 'mt:cmdunlock') {
          const picked = (Array.isArray(i.values) ? i.values : []).filter((v) => v && v !== '__none__');
          const okList = [];
          const failList = [];
          for (const name of picked) {
            const res = mt.disableCommand(name, i.user.id);
            if (res.ok) okList.push('`' + name + '`');
            else failList.push('`' + name + '`');
          }
          const parts = [];
          if (okList.length) parts.push(emoji.success + ' Đã mở lại: ' + okList.join(' \u2022 '));
          if (failList.length) parts.push(emoji.error + ' Bỏ qua: ' + failList.join(' \u2022 '));
          return refresh(i, parts.join('\n') || 'Không có thay đổi nào.');
        }

        // ---- Menu chọn người / vai trò: bật-tắt miễn trừ ngay tại bảng ----
        if (i.customId === 'mt:usel' || i.customId === 'mt:rsel') {
          const isRoleSel = i.customId === 'mt:rsel';
          const picked = Array.isArray(i.values) ? i.values.slice(0, 10) : [];
          const added = [];
          const removed = [];
          const failed = [];

          for (const id of picked) {
            if (!isRoleSel && String(id) === ownerId) {
              failed.push('<@' + id + '> (chủ bot luôn dùng được)');
              continue;
            }
            const r = isRoleSel ? mt.toggleRole(id, i.user.id) : mt.toggleUser(id, i.user.id);
            const tag = isRoleSel ? '<@&' + id + '>' : '<@' + id + '>';
            if (!r.ok) failed.push(tag);
            else if (r.added) added.push(tag);
            else removed.push(tag);
          }

          const parts = [];
          if (added.length) parts.push(emoji.success + ' Thêm miễn trừ: ' + added.join(' \u2022 '));
          if (removed.length) parts.push(emoji.warning + ' Gỡ miễn trừ: ' + removed.join(' \u2022 '));
          if (failed.length) parts.push(emoji.error + ' Bỏ qua: ' + failed.join(' \u2022 '));

          return refresh(i, parts.join('\n') || 'Không có thay đổi nào.');
        }

        // ---- Mở lại toàn bộ lệnh ----
        if (i.customId === 'mt:cmdclear') {
          const total = mt.listCommands().length;
          mt.clearCommands(i.user.id);
          return refresh(
            i,
            total
              ? emoji.success + ' Đã mở lại toàn bộ ' + total + ' lệnh đang bảo trì riêng.'
              : 'Không có lệnh nào đang bảo trì riêng.',
          );
        }

        // ---- Xoá miễn trừ ----
        if (i.customId === 'mt:clear') {
          const before = mt.getState();
          const total = before.allowlist.length + before.allowRoles.length;
          mt.clearAllow(i.user.id);
          return refresh(
            i,
            total ? emoji.success + ' Đã xoá toàn bộ ' + total + ' mục miễn trừ.' : 'Danh sách miễn trừ vốn đã trống.',
          );
        }

        // ---- Đóng bảng ----
        if (i.customId === 'mt:close') {
          ended = true;
          panel.ended = true;
          unregister();
          await i
            .update({ embeds: [renderPanel(client, viewerTag, '', view, category)], components: panelRows(client, true, view, category) })
            .catch(() => {});
          collector.stop('closed');
          return;
        }

        // ---- Các nút còn lại ----
        let note = '';
        if (i.customId === 'mt:toggle') {
          if (mt.isEnabled()) {
            mt.disable({ by: i.user.id });
            applyPresence(client, false);
            note = emoji.success + ' Đã mở lại bot.';
          } else {
            mt.enable({ reason: 'Bật nhanh từ bảng điều khiển', ms: 0, by: i.user.id });
            applyPresence(client, true);
            note = emoji.warning + ' Đã bật bảo trì toàn bộ.';
          }
        } else if (i.customId === 'mt:ext') {
          const r = mt.extend(30 * 60000, i.user.id);
          note = r && r.ok === false ? emoji.error + ' ' + r.error : emoji.success + ' Đã gia hạn thêm 30 phút.';
        } else if (i.customId === 'mt:notimer') {
          mt.clearTimer(i.user.id);
          note = emoji.success + ' Đã bỏ hẹn giờ \u2014 bảo trì sẽ kéo dài đến khi tắt thủ công.';
        } else if (i.customId === 'mt:refresh') {
          note = '\ud83d\udd04 Đã làm mới.';
        }

        return refresh(i, note);
      } catch (err) {
        client.logger?.error?.('Lỗi nút bảo trì: ' + (err && err.message ? err.message : err));
        i.deferUpdate?.().catch(() => {});
      }
    });

    collector.on('end', () => lock());
  },
};

// Cho phép ready.js khôi phục trạng thái "đang bảo trì" sau khi bot khởi động lại.
module.exports.applyPresence = applyPresence;
