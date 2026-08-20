// =============================================================
//  Lệnh: giveaway - tạo đợt quay thưởng có nút bấm, đếm ngược
//  và bốc thăm bằng bộ sinh số ngẫu nhiên an toàn (CSPRNG).
//
//  Dùng slash:  /giveaway thời_gian:1d số_người_thắng:3 phần_thưởng:Nitro
//  Dùng prefix: !gw 1d 3 Nitro Classic
//               !gw 12h 1 @VIP #ki-su-kien Phần thưởng
//
//  Một số tuỳ chọn chỉ có ở slash (mô tả, vai trò thưởng, ghim…) vì chế độ
//  prefix không phân biệt được hai lần nhắc vai trò khác nhau trong cùng câu.
// =============================================================
const Embed = require('../../core/EmbedFactory');
const chanUtil = require('../../core/channelResolver');
const store = require('../../core/giveawayStore');
const gm = require('../../core/giveawayManager');

// Chế độ prefix: CommandContext lấy tham số theo VỊ TRÍ, mà vai trò/kênh
// lại là tuỳ chọn nên vị trí sẽ lệch. Vì vậy tự tách tham số ở đây:
// bỏ các token nhắc vai trò / kênh (đã được lấy riêng qua mentions),
// token đầu là thời gian, token thứ hai là số giải (nếu là số và còn chợ phía sau),
// phần còn lại là phần thưởng.
function parsePrefixArgs(args) {
  const tokens = (args || []).filter(
    (t) => !/^<@&\d+>$/.test(t) && !/^<#\d+>$/.test(t),
  );
  const duration = tokens.shift() || null;
  let winners = null;
  if (tokens.length > 1 && /^\d{1,2}$/.test(tokens[0])) {
    winners = Number(tokens.shift());
  }
  const prize = tokens.join(' ').trim() || null;
  return { duration, winners, prize };
}

function humanize(ms) {
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const parts = [];
  if (d) parts.push(d + ' ngày');
  if (h) parts.push(h + ' giờ');
  if (m) parts.push(m + ' phút');
  if (s && !d && !h) parts.push(s + ' giây');
  return parts.join(' ') || '0 giây';
}

module.exports = {
  name: 'giveaway',
  aliases: ['gw', 'quaythuong', 'tangqua'],
  category: 'giveaway',
  description: 'Tạo đợt giveaway có nút tham gia, đếm ngược và bốc thăm công bằng',
  usage: '<thời gian> [số người thắng] [@vai trò] [#kênh] <phần thưởng>',
  cooldown: 10,
  guildOnly: true,
  permissions: ['ManageMessages'],
  slash: true,
  // Đánh dấu: lệnh này TỰ tách tham số khi chạy bằng prefix (xem parsePrefixArgs),
  // nên không phụ thuộc vị trí option như các lệnh khác.
  manualPrefixParse: true,
  options: [
    { name: 'thời_gian', type: 'string', description: 'Thời lượng: 30m, 2h, 1d, 1w…', required: true },
    // Phải khai báo NGAY sau option bắt buộc đầu tiên: Discord yêu cầu mọi option
    // bắt buộc đứng trước option tùy chọn (lệnh dùng manualPrefixParse nên
    // thứ tự này không ảnh hưởng cách gõ bằng prefix).
    { name: 'phần_thưởng', type: 'string', description: 'Phần thưởng của đợt này', required: true, rest: true },
    { name: 'số_người_thắng', type: 'integer', description: 'Số người thắng (mặc định 1, tối đa 20)', required: false },
    { name: 'yêu_cầu_vai_trò', type: 'role', description: 'Chỉ ai có vai trò này mới tham gia được', required: false },
    { name: 'tuổi_tài_khoản', type: 'integer', description: 'Số ngày tuổi tối thiểu của tài khoản', required: false },
    { name: 'vai_trò_thưởng', type: 'role', description: 'Vai trò được cộng thêm lượt bốc thăm', required: false },
    { name: 'lượt_thưởng', type: 'integer', description: 'Số lượt cộng thêm cho vai trò thưởng (1-10)', required: false },
    // Ô gợi ý tự làm mới -> hiện ĐẦY ĐỦ kênh, kể cả kênh vừa tạo.
    { name: 'kênh', type: 'string', channelPicker: true, autocomplete: true, description: 'Kênh đăng giveaway (gõ để tìm, mặc định: kênh hiện tại)', required: false, channelFilter: chanUtil.TEXT_LIKE },
    { name: 'mô_tả', type: 'string', description: 'Mô tả thêm hiển thị trong giveaway', required: false },
    { name: 'ghim_tin_nhắn', type: 'boolean', description: 'Ghim tin nhắn giveaway (tự bỏ ghim khi kết thúc)', required: false },
    { name: 'chủ_đợt_tham_gia', type: 'boolean', description: 'Cho phép người tổ chức tự tham gia (mặc định: không)', required: false },
    { name: 'nhắn_người_thắng', type: 'boolean', description: 'Nhắn riêng cho người thắng (mặc định: có)', required: false },
  ],

  async run(ctx) {
    const role = ctx.getRole('yêu_cầu_vai_trò');
    const channelOpt = await ctx.getChannelAsync('kênh');

    let durationRaw = null;
    let winnerCount = null;
    let prize = null;
    let description = null;
    let minDays = 0;
    let bonusRole = null;
    let bonusEntries = 0;
    let doPin = false;
    let hostCanJoin = false;
    let dmWinners = true;

    if (ctx.isSlash) {
      durationRaw = ctx.getString('thời_gian');
      winnerCount = ctx.getInteger('số_người_thắng');
      prize = ctx.getString('phần_thưởng');
      description = ctx.getString('mô_tả');
      minDays = ctx.getInteger('tuổi_tài_khoản') || 0;
      bonusRole = ctx.getRole('vai_trò_thưởng');
      bonusEntries = ctx.getInteger('lượt_thưởng') || 0;
      doPin = ctx.getBoolean('ghim_tin_nhắn') === true;
      hostCanJoin = ctx.getBoolean('chủ_đợt_tham_gia') === true;
      dmWinners = ctx.getBoolean('nhắn_người_thắng') !== false;
    } else {
      const parsed = parsePrefixArgs(ctx.args);
      durationRaw = parsed.duration;
      winnerCount = parsed.winners;
      prize = parsed.prize;
    }

    // Báo "đang xử lý" ngay ở slash: sau đó còn phải đăng tin nhắn, ghim tin nhắn
    // và ghi file, rất dễ vượt hạn 3 giây của Discord -> "application did not respond".
    // Để dạng hiện công khai, giữ nguyên như trước đây (không "Only you can see this").
    if (ctx.isSlash) await ctx.defer();

    // --- Kiểm tra đầu vào ---
    if (!durationRaw || !prize) {
      return ctx.reply({
        embeds: [
          Embed.error(
            'Thiếu thông tin',
            'Cú pháp: `giveaway <thời gian> [số người thắng] <phần thưởng>`\n' +
              'Ví dụ: `giveaway 1d 3 Nitro Classic`\n' +
              'Có thể nhắc thêm `@vai trò` và `#kênh` ở bất kỳ đâu trong câu lệnh.\n' +
              'Dùng `/giveaway` để có thêm lượt thưởng theo vai trò, mô tả và ghim tin nhắn.',
          ),
        ],
      });
    }

    const ms = gm.parseDuration(durationRaw);
    if (!ms) {
      return ctx.reply({
        embeds: [Embed.error('Thời gian không hợp lệ', 'Ví dụ hợp lệ: `30s`, `10m`, `2h`, `1d`, `1w`.')],
      });
    }
    if (ms < gm.MIN_MS) {
      return ctx.reply({ embeds: [Embed.error('Quá ngắn', 'Giveaway phải kéo dài **ít nhất 10 giây**.')] });
    }
    if (ms > gm.MAX_MS) {
      return ctx.reply({ embeds: [Embed.error('Quá dài', 'Giveaway tối đa **60 ngày**.')] });
    }

    let winners = Number(winnerCount);
    if (!Number.isFinite(winners) || winners < 1) winners = 1;
    winners = Math.min(Math.floor(winners), gm.MAX_WINNERS);

    prize = String(prize).slice(0, gm.MAX_PRIZE_LEN).trim();
    if (!prize) {
      return ctx.reply({ embeds: [Embed.error('Thiếu phần thưởng', 'Hãy ghi rõ phần thưởng của đợt này.')] });
    }
    description = description ? String(description).slice(0, gm.MAX_DESC_LEN).trim() : null;

    if (!Number.isFinite(minDays) || minDays < 0) minDays = 0;
    minDays = Math.min(Math.floor(minDays), 3650);

    // Lượt thưởng chỉ có nghĩa khi đi kèm một vai trò cụ thể.
    if (!Number.isFinite(bonusEntries) || bonusEntries < 0) bonusEntries = 0;
    bonusEntries = Math.min(Math.floor(bonusEntries), gm.MAX_BONUS);
    if (bonusRole && bonusEntries === 0) bonusEntries = 1;
    if (!bonusRole) bonusEntries = 0;

    // --- Kênh đăng ---
    const target = channelOpt || ctx.channel;
    if (!target || typeof target.send !== 'function') {
      return ctx.reply({ embeds: [Embed.error('Kênh không hợp lệ', 'Hãy chọn một kênh văn bản.')] });
    }
    let canPin = false;
    const me = ctx.guild.members.me;
    if (me && typeof target.permissionsFor === 'function') {
      const perms = target.permissionsFor(me);
      if (perms) {
        const missing = ['ViewChannel', 'SendMessages', 'EmbedLinks'].filter((p) => !perms.has(p));
        if (missing.length) {
          return ctx.reply({
            embeds: [
              Embed.error(
                'Thiếu quyền',
                'Tôi cần thêm quyền **' + missing.join(', ') + '** ở ' + target + ' mới đăng được giveaway.',
              ),
            ],
          });
        }
        canPin = perms.has('ManageMessages');
      }
    }
    if (doPin && !canPin) {
      doPin = false; // không ghim được thì bỏ qua, không chặn cả lệnh
    }

    // --- Giới hạn số đợt đang chạy để file dữ liệu và số timer không phình vô hạn ---
    store.prune();
    const active = store.activeInGuild(ctx.guild.id);
    if (active.length >= store.MAX_ACTIVE_PER_GUILD) {
      return ctx.reply({
        embeds: [
          Embed.error(
            'Quá nhiều đợt đang chạy',
            'Máy chủ này đang có **' + active.length + '** đợt giveaway diễn ra (tối đa **' +
              store.MAX_ACTIVE_PER_GUILD + '**).\nHãy kết thúc bớt rồi thử lại — xem bằng lệnh `gwlist`.',
          ),
        ],
      });
    }

    // --- Ai được ping cái gì? ---
    // Nguyên tắc: bot KHÔNG cho ai ping vượt quyền của chính họ.
    // Người tổ chức tự hò được @everyone thì đặt vào tên/mô tả giải cũng hò được.
    const mentioned = gm.extractMentions(prize + ' ' + (description || ''));
    const hostPerms =
      ctx.member && typeof ctx.member.permissionsIn === 'function'
        ? ctx.member.permissionsIn(target)
        : ctx.member && ctx.member.permissions
          ? ctx.member.permissions
          : null;
    const hasPerm = (p, perms) => Boolean(perms && typeof perms.has === 'function' && perms.has(p));
    const botPerms = me && typeof target.permissionsFor === 'function' ? target.permissionsFor(me) : null;
    const hostCanEveryone = hasPerm('MentionEveryone', hostPerms);
    // Không đọc được quyền của bot thì cứ thả — Discord sẽ tự chặn nếu thiếu quyền.
    const botCanEveryone = !botPerms || hasPerm('MentionEveryone', botPerms);
    const allowEveryone = hostCanEveryone && botCanEveryone;

    // Vai trò "cho phép ai cũng nhắc" thì ai cũng ping được;
    // vai trò khóa nhắc thì chỉ ping được khi người tổ chức có quyền Nhắc đến @everyone.
    const roleCache = ctx.guild.roles && ctx.guild.roles.cache ? ctx.guild.roles.cache : null;
    const pingRoleIds = mentioned.roles.filter((id) => {
      if (allowEveryone) return true;
      const r = roleCache && typeof roleCache.get === 'function' ? roleCache.get(id) : null;
      return Boolean(r && r.mentionable);
    });

    // --- Tạo đợt giveaway ---
    const gw = {
      messageId: null,
      channelId: target.id,
      guildId: ctx.guild.id,
      hostId: ctx.author.id,
      prize,
      description,
      winnerCount: winners,
      endAt: Date.now() + ms,
      requiredRoleId: role ? role.id : null,
      minAccountDays: minDays,
      bonusRoleId: bonusRole ? bonusRole.id : null,
      bonusEntries,
      hostCanJoin,
      dmWinners,
      pinned: false,
      entries: [],
      weights: {},
      ended: false,
      cancelled: false,
      winners: [],
      pastWinners: [],
      allowEveryone,
      pingUserIds: mentioned.users.slice(0, 20),
      pingRoleIds: pingRoleIds.slice(0, 20),
      createdAt: Date.now(),
    };

    // Mention nằm trong embed không báo cho ai cả, nên thêm một dòng chữ thường
    // chỉ chứa những thứ đã được phép ping.
    const pingLine = gm.pingContent(gw);
    const sendPayload = {
      embeds: [gm.buildEmbed(gw)],
      components: gm.buildRows(gw),
      allowedMentions: gm.mentionsFor(gw),
    };
    if (pingLine) sendPayload.content = pingLine;

    const msg = await target.send(sendPayload).catch(() => null);
    if (!msg) {
      return ctx.reply({
        embeds: [Embed.error('Không gửi được', 'Không thể đăng giveaway vào kênh đó. Hãy kiểm tra quyền của bot.')],
      });
    }

    gw.messageId = msg.id;

    // Chỉ ghi nhận pinned = true khi ghim THÀNH CÔNG, để lúc kết thúc
    // không đi bỏ ghim một tin nhắn chưa từng được ghim.
    if (doPin && typeof msg.pin === 'function') {
      const pinned = await msg.pin().then(() => true).catch(() => false);
      gw.pinned = pinned;
    }

    store.save(gw);
    gm.scheduleOne(ctx.client, gw);

    // --- Xác nhận cho người tạo ---
    const endSec = Math.floor(gw.endAt / 1000);
    const conditions =
      (role ? '• Vai trò ' + role + '\n' : '') +
      (minDays ? '• Tài khoản ≥ ' + minDays + ' ngày tuổi\n' : '') +
      (bonusRole ? '• ' + bonusRole + ' được ' + (1 + bonusEntries) + ' lượt bốc thăm\n' : '') +
      (hostCanJoin ? '• Bạn được tự tham gia đợt này\n' : '') +
      (gw.pinned ? '• Đã ghim tin nhắn\n' : '') +
      (mentioned.everyone || mentioned.here
        ? allowEveryone
          ? '• Có hò @everyone/@here\n'
          : '• @everyone/@here sẽ **không** ping — ' +
            (hostCanEveryone ? 'bot' : 'bạn') +
            ' thiếu quyền **Nhắc đến @everyone**\n'
        : '') +
      (mentioned.roles.length > pingRoleIds.length
        ? '• Một số vai trò sẽ **không** ping vì vai trò đó khóa nhắc\n'
        : '') +
      (dmWinners ? '' : '• Không nhắn riêng người thắng\n');

    const confirm = Embed.success('Đã tạo giveaway')
      .setDescription('Giveaway đã được đăng tại ' + target + '.')
      .addFields(
        { name: '🏆 Phần thưởng', value: gm.escapeMd(prize), inline: true },
        { name: '👑 Số giải', value: String(winners), inline: true },
        { name: '⏳ Kéo dài', value: humanize(ms) + ' (xong <t:' + endSec + ':R>)', inline: true },
        { name: '📋 Tùy chỉnh', value: conditions || '• Không có' },
      )
      .setFooter({ text: 'Có thể kết thúc sớm, huỷ đợt hoặc quay lại bằng nút trên tin nhắn giveaway.' });

    return ctx.reply({ embeds: [confirm], allowedMentions: { parse: [] } });
  },
};
