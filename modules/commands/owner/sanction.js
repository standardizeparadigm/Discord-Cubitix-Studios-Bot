// =============================================================
//  Lệnh: xuly - TRUNG TÂM XỬ LÝ (cảnh cáo / mute / ban)
//
//  Dành RIÊNG cho chủ bot. Cho phép ra án thủ công, gỡ án, xem
//  hồ sơ, duyệt kháng nghị và đổi mức độ của hệ thống xử lý.
//
//  Mọi thao tác đều đi qua modules/core/sanctions.js nên luôn:
//    - Ghi vào nhật ký + tạo mã vụ việc
//    - Nhắn riêng cho người bị xử lý
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { colors } = require('../../core/palette');
const sanctions = require('../../core/sanctions');
const sstore = require('../../core/sanctionStore');
const engine = require('../../core/sanctionEngine');

const fmt = sanctions.fmtDuration;

// ---------- Tiện ích nhỏ ----------

function stampR(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return 'chưa có';
  return '<t:' + Math.floor(n / 1000) + ':R>';
}

function stampF(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return 'chưa có';
  return '<t:' + Math.floor(n / 1000) + ':f>';
}

// Cắt bớt và bỏ ký tự markdown để không làm vỡ embed.
function plain(text, max = 300) {
  return String(text == null ? '' : text)
    .replace(/[*_`~|>]/g, '')
    .slice(0, max);
}

function levelText(level) {
  const k = String(level || 'none');
  const emo = engine.LEVEL_EMOJI[k] || '⚪';
  const lab = engine.LEVEL_LABELS[k] || k;
  return emo + ' ' + lab;
}

// Đọc thời gian kiểu "30m", "2h", "1d", "1h30m", "1 tuần".
// Số trần (không đơn vị) được hiểu là PHÚT.
function parseDur(text) {
  if (text == null) return 0;
  const s = String(text).trim().toLowerCase();
  if (!s) return 0;

  const re = /(\d+)\s*(ngay|ngày|tuan|tuần|gio|giờ|phut|phút|giay|giây|w|d|h|m|s)/g;
  let total = 0;
  let matched = false;
  let m;
  while ((m = re.exec(s)) !== null) {
    matched = true;
    const n = parseInt(m[1], 10);
    if (!Number.isFinite(n) || n <= 0) continue;
    const u = m[2];
    if (u === 'w' || u === 'tuan' || u === 'tuần') total += n * 7 * 86400000;
    else if (u === 'd' || u === 'ngay' || u === 'ngày') total += n * 86400000;
    else if (u === 'h' || u === 'gio' || u === 'giờ') total += n * 3600000;
    else if (u === 'm' || u === 'phut' || u === 'phút') total += n * 60000;
    else total += n * 1000;
  }

  if (!matched) {
    const n = parseInt(s, 10);
    if (Number.isFinite(n) && n > 0) total = n * 60000;
  }
  return total;
}

// Lấy ID người bị nhắm từ slash hoặc từ chữ người dùng gõ.
function pickUserId(ctx, token) {
  const u = ctx.isSlash ? ctx.getUser('nguoi') : null;
  if (u && u.id) return String(u.id);
  const raw = String(token || '');
  const mention = raw.match(/^<@!?(\d{5,25})>$/);
  if (mention) return mention[1];
  if (/^\d{5,25}$/.test(raw)) return raw;
  return null;
}

async function nameOf(client, userId) {
  try {
    const u = await client.users.fetch(userId).catch(() => null);
    if (u) return u.tag || u.username || String(userId);
  } catch {
    /* bỏ qua - không lấy được tên thì dùng ID */
  }
  const known = sstore.peek(userId);
  return (known && known.name) || String(userId);
}

// ---------- Các bảng hiển thị ----------

function overviewEmbed(client) {
  const st = sanctions.status();
  const s = st.stats || {};
  const cfg = st.config || {};
  const prefix = (client.config && client.config.prefix) || 'c';

  const e = Embed.custom(
    st.on ? colors.primary : colors.warning,
    '⚖️ Hệ thống xử lý',
    st.on
      ? 'Hệ thống đang **hoạt động**.'
      : '⚠️ Hệ thống đang **tắt** — phát hiện vẫn chạy nhưng không ai bị phạt.',
  );

  if (cfg.observeOnly) {
    e.addFields({
      name: '👁️ Chế độ chỉ quan sát',
      value: 'Đang BẬT — bot chỉ ghi nhận, **không phạt ai cả**.',
      inline: false,
    });
  }

  e.addFields(
    { name: 'Mức độ', value: '**' + (st.presetLabel || 'Tự chỉnh') + '**', inline: true },
    { name: 'Đang bị cấm vĩnh viễn', value: String(s.activeBans || 0), inline: true },
    { name: 'Đang bị cấm tạm', value: String(s.activeMutes || 0), inline: true },
    { name: 'Đang có cảnh cáo', value: String(s.activeWarnUsers || 0), inline: true },
    { name: 'Miễn trừ', value: String(s.immune || 0), inline: true },
    { name: 'Kháng nghị chờ duyệt', value: (s.pendingAppeals || 0) > 0 ? '🔔 **' + s.pendingAppeals + '**' : '0', inline: true },
    {
      name: '📊 Đã ra án',
      value:
        'Cảnh cáo: **' + (s.warnsIssued || 0) + '** · ' +
        'Cấm tạm: **' + (s.mutesIssued || 0) + '** · ' +
        'Cấm vĩnh viễn: **' + (s.bansIssued || 0) + '**',
      inline: false,
    },
    {
      name: '🧩 Thang cấm tạm',
      value: (st.ladder && st.ladder.muteLadderText ? st.ladder.muteLadderText.join(' → ') : 'không rõ'),
      inline: false,
    },
    {
      name: '📖 Cách dùng',
      value:
        '`' + prefix + 'xuly hoso @người` — xem hồ sơ\n' +
        '`' + prefix + 'xuly canhcao @người <lý do>`\n' +
        '`' + prefix + 'xuly mute @người 2h <lý do>`\n' +
        '`' + prefix + 'xuly ban @người <lý do>`\n' +
        '`' + prefix + 'xuly tha @người` — gỡ sạch án\n' +
        '`' + prefix + 'xuly danhsach` · `khangnghi` · `nhatky` · `thongke`\n' +
        '`' + prefix + 'antiabuse` — trung tâm điều khiển đầy đủ (đã gộp `dashboard`)',
      inline: false,
    },
  );
  return e;
}

function reportEmbed(rep, displayName) {
  const now = Date.now();
  const r = rep.restriction || {};
  const c = rep.counters || {};

  const color =
    rep.level === 'ban' ? colors.error : rep.level === 'mute' ? colors.orange : rep.level === 'warn' ? colors.warning : colors.success;

  const e = Embed.custom(color, '📁 Hồ sơ xử lý — ' + plain(displayName, 60), null);

  e.addFields(
    { name: 'Người dùng', value: '<@' + rep.id + '>\n`' + rep.id + '`', inline: true },
    { name: 'Mức hiện tại', value: levelText(rep.level), inline: true },
    { name: 'Miễn trừ', value: rep.immune ? '⭐ Có' : 'Không', inline: true },
  );

  if (r.restricted) {
    e.addFields({
      name: '⏸️ Đang bị hạn chế',
      value:
        r.level === 'ban'
          ? 'Cấm dùng bot **vĩnh viễn**' + (r.at ? ' (từ ' + stampF(r.at) + ')' : '')
          : 'Còn **' + fmt(r.remaining) + '** — hết hạn ' + stampR(r.until),
      inline: false,
    });
    if (r.reason) e.addFields({ name: 'Lý do', value: plain(r.reason, 400), inline: false });
    if (r.caseId) e.addFields({ name: 'Mã vụ việc', value: '`' + r.caseId + '`', inline: true });
  }

  e.addFields({
    name: '📈 Lịch sử',
    value:
      'Cảnh cáo đang hiệu lực: **' + (rep.activeWarns || 0) + '**\n' +
      'Tổng: cảnh cáo **' + (c.warn || 0) + '** · cấm tạm **' + (c.mute || 0) + '** · cấm vĩnh viễn **' + (c.ban || 0) + '**\n' +
      'Số lần được tha: **' + (c.pardon || 0) + '**\n' +
      'Lần bị xử lý gần nhất: ' + stampR(rep.lastSanctionAt),
    inline: false,
  });

  if ((rep.mutesBeforeBan || 0) > 0) {
    const left = Math.max(0, (rep.mutesBeforeBan || 0) - (c.mute || 0));
    e.addFields({
      name: '⚠️ Mức tiếp theo',
      value:
        (rep.nextMuteMs ? 'Lần cấm tạm tới sẽ dài **' + fmt(rep.nextMuteMs) + '**\n' : '') +
        'Còn **' + left + '** lần cấm tạm nữa trước khi bị cấm vĩnh viễn.',
      inline: false,
    });
  }

  if (rep.lastEvaluatedAt) {
    e.addFields({
      name: '🧠 Lần đánh giá gần nhất',
      value:
        stampR(rep.lastEvaluatedAt) +
        ' — điểm **' + Math.round(Number(rep.lastSeverity) || 0) + '/100**' +
        ', độ tin cậy **' + Math.round((Number(rep.lastConfidence) || 0) * 100) + '%**' +
        (rep.lastVerdict ? '\nKết luận: ' + plain(rep.lastVerdict, 300) : ''),
      inline: false,
    });
  }

  if (rep.appeal && rep.appeal.text) {
    e.addFields({
      name: '📝 Kháng nghị' + (rep.appeal.status === 'pending' ? ' (ĐANG CHỜ DUYỆT)' : ''),
      value: plain(rep.appeal.text, 500) + '\n— gửi ' + stampR(rep.appeal.at),
      inline: false,
    });
  }

  if (rep.note) e.addFields({ name: '📌 Ghi chú của chủ bot', value: plain(rep.note, 400), inline: false });
  if ((rep.blockedAttempts || 0) > 0) {
    e.addFields({ name: 'Số lần bị chặn lệnh', value: String(rep.blockedAttempts), inline: true });
  }
  if (!rep.exists) e.setDescription('Người này **chưa có hồ sơ xử lý** nào.');

  return e;
}

// ---------- Bản đồ hành động ----------

const ALIAS = {
  hoso: 'hoso', report: 'hoso', xem: 'hoso', check: 'hoso',
  canhcao: 'warn', warn: 'warn', canh: 'warn',
  mute: 'mute', camtam: 'mute', tam: 'mute',
  ban: 'ban', camvinhvien: 'ban', vinhvien: 'ban',
  tha: 'tha', pardon: 'tha', go: 'tha',
  gomute: 'gomute', unmute: 'gomute',
  goban: 'goban', unban: 'goban',
  xoacanhcao: 'xoacanhcao', clearwarns: 'xoacanhcao',
  mientru: 'mientru', immune: 'mientru',
  ghichu: 'ghichu', note: 'ghichu',
  danhsach: 'danhsach', list: 'danhsach',
  canhbao: 'canhbao', warned: 'canhbao',
  khangnghi: 'khangnghi', appeals: 'khangnghi',
  duyet: 'duyet', accept: 'duyet',
  tuchoi: 'tuchoi', reject: 'tuchoi',
  vuviec: 'vuviec', case: 'vuviec',
  muc: 'muc', preset: 'muc',
  thongke: 'thongke', stats: 'thongke',
  nhatky: 'nhatky', log: 'nhatky',
  thaton: 'thaton', amnesty: 'thaton',
};

module.exports = {
  name: 'xuly',
  aliases: ['sanction', 'anphat', 'phatnguoi'],
  category: 'owner',
  description: 'Trung tâm xử lý: cảnh cáo, cấm tạm, cấm vĩnh viễn, gỡ án và duyệt kháng nghị',
  usage: 'xuly [việc] [@người] [thời gian] [lý do]',
  cooldown: 3,
  ownerOnly: true,
  slash: true,
  options: [
    {
      name: 'viec',
      type: 'string',
      description: 'Việc muốn làm',
      required: false,
      choices: [
        { name: 'Xem hồ sơ', value: 'hoso' },
        { name: 'Cảnh cáo (warn)', value: 'warn' },
        { name: 'Cấm tạm (mute)', value: 'mute' },
        { name: 'Cấm vĩnh viễn (ban)', value: 'ban' },
        { name: 'Tha bổng (gỡ sạch án)', value: 'tha' },
        { name: 'Gỡ cấm tạm', value: 'gomute' },
        { name: 'Gỡ cấm vĩnh viễn', value: 'goban' },
        { name: 'Xoá hết cảnh cáo', value: 'xoacanhcao' },
        { name: 'Bật/tắt miễn trừ', value: 'mientru' },
        { name: 'Ghi chú', value: 'ghichu' },
        { name: 'Danh sách đang bị cấm', value: 'danhsach' },
        { name: 'Danh sách đang có cảnh cáo', value: 'canhbao' },
        { name: 'Kháng nghị chờ duyệt', value: 'khangnghi' },
        { name: 'Duyệt kháng nghị', value: 'duyet' },
        { name: 'Từ chối kháng nghị', value: 'tuchoi' },
        { name: 'Xem vụ việc', value: 'vuviec' },
        { name: 'Đổi mức độ', value: 'muc' },
        { name: 'Thống kê', value: 'thongke' },
        { name: 'Nhật ký', value: 'nhatky' },
        { name: 'Tha bổng TOÀN BỘ', value: 'thaton' },
      ],
    },
    { name: 'nguoi', type: 'user', description: 'Người muốn xử lý', required: false },
    { name: 'thoigian', type: 'string', description: 'Thời gian cấm tạm (ví dụ: 30m, 2h, 1d)', required: false },
    { name: 'lydo', type: 'string', description: 'Lý do / ghi chú / mã vụ việc / mức độ', required: false, rest: true },
  ],

  async run(ctx) {
    const client = ctx.client;
    const args = Array.isArray(ctx.args) ? ctx.args.slice() : [];

    // --- Đọc tham số từ slash hoặc từ chữ gõ tay ---
    let action;
    let userToken = '';
    let durToken = '';
    let rest = '';

    if (ctx.isSlash) {
      action = ctx.getString('viec') || 'tongquan';
      durToken = ctx.getString('thoigian') || '';
      rest = ctx.getString('lydo') || '';
    } else {
      const raw = (args[0] || '').toLowerCase();
      action = ALIAS[raw] || (raw ? raw : 'tongquan');
      userToken = args[1] || '';
      // Với mute thì tham số thứ 3 là thời gian, còn lại là lý do.
      if (action === 'mute') {
        durToken = args[2] || '';
        rest = args.slice(3).join(' ');
      } else if (action === 'vuviec' || action === 'muc') {
        rest = args.slice(1).join(' ');
      } else {
        rest = args.slice(2).join(' ');
      }
    }

    if (ctx.isSlash) action = ALIAS[action] || action;
    const ownerTag = ctx.author.tag || ctx.author.username || 'chủ bot';
    const now = Date.now();

    // --- Nhóm việc KHÔNG cần chọn người ---

    if (action === 'tongquan') {
      return ctx.reply({ embeds: [overviewEmbed(client)] }).catch(() => {});
    }

    if (action === 'danhsach') {
      const rows = sstore.listRestricted(now, 20);
      if (!rows.length) {
        return ctx.reply({ embeds: [Embed.success('Không có ai bị cấm', 'Hiện không có người nào bị cấm dùng bot.')] }).catch(() => {});
      }
      const lines = rows.map((r, i) => {
        const rec = r.record || {};
        const who = rec.name ? plain(rec.name, 40) : rec.id;
        return (
          '`' + String(i + 1).padStart(2, '0') + '.` ' +
          (r.level === 'ban' ? '🔴' : '🟠') + ' **' + who + '** — `' + rec.id + '`\n' +
          ' ' + (r.level === 'ban' ? 'cấm vĩnh viễn' : 'hết hạn ' + stampR(r.until))
        );
      });
      return ctx
        .reply({ embeds: [Embed.custom(colors.error, '⛔ Đang bị cấm dùng bot (' + rows.length + ')', lines.join('\n'))] })
        .catch(() => {});
    }

    if (action === 'canhbao') {
      const rows = sstore.listWarned(now, 20);
      if (!rows.length) {
        return ctx.reply({ embeds: [Embed.success('Không có cảnh cáo nào', 'Hiện không ai đang có cảnh cáo hiệu lực.')] }).catch(() => {});
      }
      const lines = rows.map((r, i) => {
        const rec = r.record || {};
        const who = rec.name ? plain(rec.name, 40) : rec.id;
        return '`' + String(i + 1).padStart(2, '0') + '.` **' + who + '** — `' + rec.id + '` · ' + (r.active || 0) + ' cảnh cáo';
      });
      return ctx
        .reply({ embeds: [Embed.custom(colors.warning, '🟡 Đang có cảnh cáo (' + rows.length + ')', lines.join('\n'))] })
        .catch(() => {});
    }

    if (action === 'khangnghi') {
      const rows = sstore.pendingAppeals(10);
      if (!rows.length) {
        return ctx.reply({ embeds: [Embed.success('Không có kháng nghị', 'Hiện không có đơn kháng nghị nào chờ duyệt.')] }).catch(() => {});
      }
      const prefix = (client.config && client.config.prefix) || 'c';
      const e = Embed.custom(colors.info, '📬 Kháng nghị chờ duyệt (' + rows.length + ')', null);
      for (const rec of rows.slice(0, 8)) {
        e.addFields({
          name: plain(rec.name || rec.id, 60) + ' — ' + levelText(rec.level),
          value:
            plain(rec.appeal && rec.appeal.text ? rec.appeal.text : '(không có nội dung)', 400) +
            '\n`' + rec.id + '` · gửi ' + stampR(rec.appeal && rec.appeal.at) +
            '\nDuyệt: `' + prefix + 'xuly duyet ' + rec.id + '` · Từ chối: `' + prefix + 'xuly tuchoi ' + rec.id + '`',
          inline: false,
        });
      }
      return ctx.reply({ embeds: [e] }).catch(() => {});
    }

    if (action === 'thongke') {
      const st = sanctions.status();
      const s = st.stats || {};
      const e = Embed.custom(colors.info, '📊 Thống kê hệ thống xử lý', null).addFields(
        { name: 'Số lần đánh giá', value: String(s.evaluations || 0), inline: true },
        { name: 'Tự động ra án', value: String(s.autoActions || 0), inline: true },
        { name: 'Chủ bot ra án', value: String(s.manualActions || 0), inline: true },
        { name: 'Cảnh cáo', value: String(s.warnsIssued || 0), inline: true },
        { name: 'Cấm tạm', value: String(s.mutesIssued || 0), inline: true },
        { name: 'Cấm vĩnh viễn', value: String(s.bansIssued || 0), inline: true },
        { name: 'Lệnh bị chặn', value: String(s.blockedCommands || 0), inline: true },
        { name: 'Được tha', value: String(s.pardons || 0), inline: true },
        { name: 'Hết hạn tự gỡ', value: String((s.liftedMutes || 0) + (s.liftedBans || 0)), inline: true },
        { name: 'Kháng nghị', value: 'gửi ' + (s.appealsFiled || 0) + ' · nhận ' + (s.appealsAccepted || 0) + ' · từ chối ' + (s.appealsRejected || 0), inline: false },
        { name: 'Bỏ qua vì chỉ quan sát', value: String(s.observeOnlySkips || 0), inline: true },
        { name: 'Số hồ sơ', value: String(s.users || 0), inline: true },
        { name: 'Số vụ việc', value: String(s.cases || 0), inline: true },
      );
      return ctx.reply({ embeds: [e] }).catch(() => {});
    }

    if (action === 'nhatky') {
      const rows = sstore.logEntries(15);
      if (!rows.length) {
        return ctx.reply({ embeds: [Embed.info('Nhật ký trống', 'Chưa có hoạt động nào được ghi lại.')] }).catch(() => {});
      }
      const icon = { info: 'ℹ️', warn: '⚠️', error: '🔴', reset: '♻️' };
      const lines = rows.map((l) => (icon[l.kind] || '•') + ' ' + stampR(l.at) + ' — ' + plain(l.text, 150));
      return ctx.reply({ embeds: [Embed.custom(colors.dark, '📜 Nhật ký xử lý', lines.join('\n'))] }).catch(() => {});
    }

    if (action === 'muc') {
      const want = String(rest || '').trim().toLowerCase();
      if (!want) {
        const keys = Object.keys(sstore.PRESETS || {});
        const lines = keys.map(
          (k) => '• `' + k + '` — **' + (sstore.PRESET_LABELS[k] || k) + '**' + (sstore.PRESET_NOTES && sstore.PRESET_NOTES[k] ? '\n ' + sstore.PRESET_NOTES[k] : ''),
        );
        return ctx
          .reply({
            embeds: [
              Embed.info(
                'Mức độ xử lý',
                'Đang dùng: **' + (sanctions.status().presetLabel || 'Tự chỉnh') + '**\n\n' + lines.join('\n'),
              ),
            ],
          })
          .catch(() => {});
      }
      const res = sstore.applyPreset(want);
      if (!res.ok) return ctx.reply({ embeds: [Embed.error('Không đổi được', res.error)] }).catch(() => {});
      sstore.log('info', ownerTag, 'Đổi mức độ xử lý sang "' + want + '"');
      return ctx
        .reply({ embeds: [Embed.success('Đã đổi mức độ', 'Hệ thống xử lý nay chạy ở mức **' + (sstore.PRESET_LABELS[want] || want) + '**.')] })
        .catch(() => {});
    }

    if (action === 'thaton') {
      const freed = sstore.amnesty(ownerTag, true);
      return ctx
        .reply({
          embeds: [
            Embed.success(
              'Đã tha bổng toàn bộ',
              'Đã gỡ án cho **' + (Number(freed) || 0) + '** người. Mọi cảnh cáo, cấm tạm và cấm vĩnh viễn đã được xoá.',
            ),
          ],
        })
        .catch(() => {});
    }

    if (action === 'vuviec') {
      const id = String(rest || '').trim();
      if (!id) {
        const rows = sstore.recentCases(10);
        if (!rows.length) {
          return ctx.reply({ embeds: [Embed.info('Chưa có vụ việc', 'Hệ thống chưa ghi nhận vụ việc nào.')] }).catch(() => {});
        }
        const lines = rows.map(
          (k) => '`' + k.id + '` ' + levelText(k.level) + ' — ' + plain(k.userName || k.userId, 40) + ' · ' + stampR(k.at),
        );
        return ctx.reply({ embeds: [Embed.custom(colors.info, '🗂️ Vụ việc gần đây', lines.join('\n'))] }).catch(() => {});
      }
      const k = sstore.getCase(id);
      if (!k) return ctx.reply({ embeds: [Embed.error('Không tìm thấy', 'Không có vụ việc nào mã `' + plain(id, 40) + '`.')] }).catch(() => {});
      const e = Embed.custom(colors.info, '🗂️ Vụ việc `' + k.id + '`', null).addFields(
        { name: 'Người bị xử lý', value: '<@' + k.userId + '>\n`' + k.userId + '`', inline: true },
        { name: 'Mức', value: levelText(k.level), inline: true },
        { name: 'Thứ hạng', value: String(Math.round(Number(k.severity) || 0)) + '/100', inline: true },
        { name: 'Độ tin cậy', value: Math.round((Number(k.confidence) || 0) * 100) + '%', inline: true },
        { name: 'Nguồn', value: k.source === 'manual' ? 'chủ bot' : 'tự động', inline: true },
        { name: 'Thời điểm', value: stampF(k.at), inline: true },
      );
      if (k.durationMs) e.addFields({ name: 'Thời hạn', value: fmt(k.durationMs), inline: true });
      if (k.reason) e.addFields({ name: 'Lý do', value: plain(k.reason, 500), inline: false });
      if (Array.isArray(k.decisive) && k.decisive.length) {
        e.addFields({ name: 'Bằng chứng quyết định', value: k.decisive.map((x) => '• ' + plain(x, 120)).join('\n'), inline: false });
      }
      if (Array.isArray(k.blockers) && k.blockers.length) {
        e.addFields({ name: 'Yếu tố giảm nhẹ', value: k.blockers.map((x) => '• ' + plain(x, 120)).join('\n'), inline: false });
      }
      return ctx.reply({ embeds: [e] }).catch(() => {});
    }

    // --- Từ đây trở xuống ĐỀU cần chọn người ---

    const userId = pickUserId(ctx, userToken || rest.split(/\s+/)[0]);
    if (!userId) {
      const prefix = (client.config && client.config.prefix) || 'c';
      return ctx
        .reply({
          embeds: [
            Embed.error(
              'Thiếu người dùng',
              'Bạn phải chọn người (tag hoặc dán ID).\nVí dụ: `' + prefix + 'xuly ' + action + ' @người`',
            ),
          ],
        })
        .catch(() => {});
    }

    // Không cho tự xử lý chính mình hoặc xử lý bot.
    if (userId === String(ctx.author.id) && (action === 'warn' || action === 'mute' || action === 'ban')) {
      return ctx.reply({ embeds: [Embed.error('Không hợp lệ', 'Bạn không thể tự ra án cho chính mình.')] }).catch(() => {});
    }
    if (client.user && userId === String(client.user.id)) {
      return ctx.reply({ embeds: [Embed.error('Không hợp lệ', 'Không thể xử lý chính con bot.')] }).catch(() => {});
    }

    const displayName = await nameOf(client, userId);
    // Ghi tên lại để các bảng danh sách hiển thị đẹp hơn.
    try {
      sstore.setName(userId, displayName);
    } catch {
      /* không quan trọng */
    }

    switch (action) {
      case 'hoso': {
        const rep = sstore.report(userId, now);
        const payload = { embeds: [reportEmbed(rep, displayName)] };
        // Kèm nút xử lý nhanh (tha / miễn trừ / cấm vĩnh viễn).
        try {
          const rows = sanctions.ownerAlertRows(userId);
          if (rows && rows.length) payload.components = rows;
        } catch {
          /* không có nút thì thôi */
        }
        return ctx.reply(payload).catch(() => {});
      }

      case 'warn': {
        const reason = plain(rest, 400) || 'Chủ bot cảnh cáo trực tiếp';
        const res = await sanctions.manualWarn(client, userId, { by: ownerTag, reason, name: displayName });
        if (!res.ok) return ctx.reply({ embeds: [Embed.error('Không cảnh cáo được', res.error || 'Lỗi không rõ.')] }).catch(() => {});
        return ctx
          .reply({
            embeds: [
              Embed.custom(
                colors.warning,
                '🟡 Đã cảnh cáo ' + plain(displayName, 60),
                'Số cảnh cáo đang hiệu lực: **' + (res.activeWarns || 1) + '**\n' +
                  '**Lý do:** ' + reason + '\n' +
                  'Mã vụ việc: `' + res.caseId + '`\n\nĐã nhắn riêng cho người này.',
              ),
            ],
          })
          .catch(() => {});
      }

      case 'mute': {
        let ms = parseDur(durToken);
        if (!ms && !ctx.isSlash) ms = parseDur(rest.split(/\s+/)[0]);
        if (!ms) {
          const ladder = sanctions.status().ladder || {};
          return ctx
            .reply({
              embeds: [
                Embed.error(
                  'Thiếu thời gian',
                  'Hãy ghi thời gian cấm tạm, ví dụ: `30m`, `2h`, `1d`, `1h30m`.\n' +
                    'Thang mặc định: ' + (ladder.muteLadderText ? ladder.muteLadderText.join(' → ') : 'không rõ'),
                ),
              ],
            })
            .catch(() => {});
        }
        const reason = plain(rest, 400) || 'Chủ bot ra quyết định trực tiếp';
        const res = await sanctions.manualMute(client, userId, { by: ownerTag, reason, durationMs: ms, name: displayName });
        if (!res.ok) return ctx.reply({ embeds: [Embed.error('Không cấm tạm được', res.error || 'Lỗi không rõ.')] }).catch(() => {});
        return ctx
          .reply({
            embeds: [
              Embed.custom(
                colors.orange,
                '🟠 Đã cấm tạm ' + plain(displayName, 60),
                'Thời hạn: **' + fmt(res.durationMs) + '** — hết hạn ' + stampR(res.until) + '\n' +
                  '**Lý do:** ' + reason + '\n' +
                  'Mã vụ việc: `' + res.caseId + '`\n\nNgười này không dùng được bot tới khi hết hạn.',
              ),
            ],
          })
          .catch(() => {});
      }

      case 'ban': {
        const reason = plain(rest, 400) || 'Chủ bot ra quyết định trực tiếp';
        const res = await sanctions.manualBan(client, userId, { by: ownerTag, reason, name: displayName });
        if (!res.ok) return ctx.reply({ embeds: [Embed.error('Không cấm được', res.error || 'Lỗi không rõ.')] }).catch(() => {});
        return ctx
          .reply({
            embeds: [
              Embed.custom(
                colors.error,
                '🔴 Đã cấm dùng bot vĩnh viễn ' + plain(displayName, 60),
                '**Lý do:** ' + reason + '\nMã vụ việc: `' + res.caseId + '`\n\n' +
                  'Muốn gỡ thì dùng `xuly tha ' + userId + '`.',
              ),
            ],
          })
          .catch(() => {});
      }

      case 'tha': {
        const note = plain(rest, 300);
        const res = sstore.pardon(userId, ownerTag, note, true);
        if (!res.ok) return ctx.reply({ embeds: [Embed.error('Không tha được', res.error || 'Người này không có án nào.')] }).catch(() => {});
        await sanctions.notifyLifted(client, userId, 'pardon', note).catch(() => {});
        return ctx
          .reply({
            embeds: [
              Embed.success(
                'Đã tha bổng ' + plain(displayName, 60),
                'Toàn bộ cảnh cáo, cấm tạm và cấm vĩnh viễn đã được xoá.' + (note ? '\n**Ghi chú:** ' + note : ''),
              ),
            ],
          })
          .catch(() => {});
      }

      case 'gomute': {
        const res = sstore.liftMute(userId, ownerTag, plain(rest, 200));
        if (!res.ok) return ctx.reply({ embeds: [Embed.error('Không gỡ được', res.error || 'Người này không bị cấm tạm.')] }).catch(() => {});
        await sanctions.notifyLifted(client, userId, 'mute', plain(rest, 200)).catch(() => {});
        return ctx.reply({ embeds: [Embed.success('Đã gỡ cấm tạm', plain(displayName, 60) + ' đã có thể dùng bot lại.')] }).catch(() => {});
      }

      case 'goban': {
        const res = sstore.liftBan(userId, ownerTag, plain(rest, 200));
        if (!res.ok) return ctx.reply({ embeds: [Embed.error('Không gỡ được', res.error || 'Người này không bị cấm vĩnh viễn.')] }).catch(() => {});
        await sanctions.notifyLifted(client, userId, 'ban', plain(rest, 200)).catch(() => {});
        return ctx.reply({ embeds: [Embed.success('Đã gỡ cấm vĩnh viễn', plain(displayName, 60) + ' đã có thể dùng bot lại.')] }).catch(() => {});
      }

      case 'xoacanhcao': {
        const res = sstore.clearWarns(userId, ownerTag);
        if (!res.ok) return ctx.reply({ embeds: [Embed.error('Không xoá được', res.error || 'Người này không có cảnh cáo.')] }).catch(() => {});
        return ctx
          .reply({ embeds: [Embed.success('Đã xoá cảnh cáo', 'Đã xoá **' + (res.cleared || 0) + '** cảnh cáo của ' + plain(displayName, 60) + '.')] })
          .catch(() => {});
      }

      case 'mientru': {
        const cur = sstore.isImmune(userId);
        const res = sstore.setImmune(userId, !cur, ownerTag);
        if (!res.ok) return ctx.reply({ embeds: [Embed.error('Không đổi được', res.error || 'Lỗi không rõ.')] }).catch(() => {});
        return ctx
          .reply({
            embeds: [
              res.immune
                ? Embed.success('Đã bật miễn trừ', plain(displayName, 60) + ' sẽ **không bao giờ** bị hệ thống xử lý tự động phạt.')
                : Embed.warn('Đã tắt miễn trừ', plain(displayName, 60) + ' lại bị hệ thống xử lý kiểm tra như bình thường.'),
            ],
          })
          .catch(() => {});
      }

      case 'ghichu': {
        const text = plain(rest, 400);
        const res = sstore.setNote(userId, text, ownerTag);
        if (!res.ok) return ctx.reply({ embeds: [Embed.error('Không ghi được', res.error || 'Lỗi không rõ.')] }).catch(() => {});
        return ctx
          .reply({
            embeds: [
              text
                ? Embed.success('Đã lưu ghi chú', 'Ghi chú cho ' + plain(displayName, 60) + ':\n' + text)
                : Embed.success('Đã xoá ghi chú', 'Đã bỏ ghi chú của ' + plain(displayName, 60) + '.'),
            ],
          })
          .catch(() => {});
      }

      case 'duyet':
      case 'tuchoi': {
        const accept = action === 'duyet';
        const res = sstore.reviewAppeal(userId, accept ? 'accept' : 'reject', ownerTag, plain(rest, 300));
        if (!res.ok) {
          return ctx.reply({ embeds: [Embed.error('Không duyệt được', res.error || 'Người này không có đơn đang chờ.')] }).catch(() => {});
        }
        await sanctions.notifyAppealResult(client, userId, accept, plain(rest, 300)).catch(() => {});
        return ctx
          .reply({
            embeds: [
              accept
                ? Embed.success('Đã nhận kháng nghị', 'Đã gỡ án cho ' + plain(displayName, 60) + ' và nhắn riêng thông báo.')
                : Embed.warn('Đã từ chối kháng nghị', 'Án của ' + plain(displayName, 60) + ' được giữ nguyên.'),
            ],
          })
          .catch(() => {});
      }

      default: {
        const prefix = (client.config && client.config.prefix) || 'c';
        return ctx
          .reply({
            embeds: [
              Embed.error(
                'Không hiểu việc bạn muốn làm',
                'Gõ `' + prefix + 'xuly` để xem danh sách việc làm được.',
              ),
            ],
          })
          .catch(() => {});
      }
    }
  },
};
