// =============================================================
//  Lệnh: khangnghi - GỬI ĐƠN KHÁNG NGHỊ
//
//  Dành cho người chơi bị hệ thống xử lý ra án (cảnh cáo /
//  cấm tạm / cấm vĩnh viễn) nhưng cho rằng mình bị oan.
//
//  Lệnh này NẰM TRONG DANH SÁCH CHO PHÉP của hệ thống xử lý
//  và được miễn kiểm tra chống gian lận (bypassAbuseGuard) — nếu
//  không thì người đang bị cấm sẽ bị kỹt, không cách nào tự cứu.
// =============================================================
const { EmbedBuilder } = require('discord.js');
const Embed = require('../../core/EmbedFactory');
const { colors } = require('../../core/palette');
const sanctions = require('../../core/sanctions');
const sstore = require('../../core/sanctionStore');
const engine = require('../../core/sanctionEngine');

const fmt = sanctions.fmtDuration;

function stampR(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return 'chưa có';
  return '<t:' + Math.floor(n / 1000) + ':R>';
}

function plain(text, max = 600) {
  return String(text == null ? '' : text)
    .replace(/[*_`~|>]/g, '')
    .slice(0, max);
}

function levelText(level) {
  const k = String(level || 'none');
  return (engine.LEVEL_EMOJI[k] || '⚪') + ' ' + (engine.LEVEL_LABELS[k] || k);
}

// Gửi đơn cho chủ bot kèm nút xử lý nhanh.
// Không dùng alertOwner() vì hàm đó có hãm 20 giây — kháng nghị là
// việc quan trọng, không được phép bị bỏ sót.
async function sendToOwner(client, ctx, userId, text, level) {
  try {
    const ownerId = client.config && client.config.ownerId;
    if (!ownerId) return false;
    const owner = await client.users.fetch(String(ownerId)).catch(() => null);
    if (!owner) return false;

    const prefix = (client.config && client.config.prefix) || 'c';
    const e = new EmbedBuilder()
      .setColor(colors.info)
      .setTitle('📬 Có đơn kháng nghị mới')
      .setDescription(plain(text, 900))
      .addFields(
        { name: 'Người gửi', value: '<@' + userId + '>\n`' + userId + '`', inline: true },
        { name: 'Đang bị', value: levelText(level), inline: true },
        {
          name: 'Cách xử lý',
          value:
            'Nhận đơn: `' + prefix + 'xuly duyet ' + userId + '`\n' +
            'Từ chối: `' + prefix + 'xuly tuchoi ' + userId + '`\n' +
            'Xem hồ sơ: `' + prefix + 'xuly hoso ' + userId + '`',
          inline: false,
        },
      )
      .setFooter({ text: (client.config && client.config.footerText) || 'Cubitix Studios' })
      .setTimestamp();

    const payload = { embeds: [e] };
    try {
      const rows = sanctions.ownerAlertRows(userId);
      if (rows && rows.length) payload.components = rows;
    } catch {
      /* không có nút thì vẫn gửi được đơn */
    }

    await owner.send(payload);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  name: 'khangnghi',
  aliases: ['appeal', 'khieunai'],
  category: 'utility',
  description: 'Gửi đơn kháng nghị nếu bạn bị hệ thống xử lý phạt oan',
  usage: 'khangnghi <lý do của bạn>',
  cooldown: 30,
  slash: true,
  // Bắt buộc: người đang bị cấm vẫn phải gõ được lệnh này.
  bypassAbuseGuard: true,
  options: [
    {
      name: 'lydo',
      type: 'string',
      description: 'Giải thích vì sao bạn cho rằng mình bị oan (ít nhất 10 ký tự)',
      required: false,
      rest: true,
    },
  ],

  async run(ctx) {
    const client = ctx.client;
    const userId = String(ctx.author.id);
    const now = Date.now();
    const prefix = (client.config && client.config.prefix) || 'c';
    const cfg = sstore.getConfig();

    const text = ctx.isSlash ? ctx.getString('lydo') || '' : (Array.isArray(ctx.args) ? ctx.args.join(' ') : '');

    // --- Tính năng bị tắt ---
    if (!cfg.appealEnabled) {
      return ctx
        .reply({
          embeds: [Embed.error('Kháng nghị đang tắt', 'Chủ bot đang tắt tính năng kháng nghị. Bạn hãy liên hệ trực tiếp với chủ bot.')],
        })
        .catch(() => {});
    }

    const rep = sstore.report(userId, now);
    const r = rep.restriction || {};
    const hasSomething = r.restricted || (rep.activeWarns || 0) > 0;

    // --- Không có án gì ---
    if (!hasSomething) {
      return ctx
        .reply({
          embeds: [
            Embed.success(
              '✅ Bạn không bị phạt gì cả',
              'Hệ thống không ghi nhận án nào cho bạn, nên bạn **không cần kháng nghị**.\n' +
                'Bạn cứ chơi bình thường thôi!\n\n' +
                'Muốn xem điểm tin cậy của mình thì gõ `' + prefix + 'verify`.',
            ),
          ],
        })
        .catch(() => {});
    }

    // --- Chưa ghi lý do: hiện tình trạng + hướng dẫn ---
    if (!text || text.trim().length < 10) {
      const e = Embed.custom(
        r.level === 'ban' ? colors.error : colors.warning,
        '📝 Gửi đơn kháng nghị',
        'Bạn đang bị: **' + levelText(r.restricted ? r.level : 'warn') + '**' +
          (r.restricted && r.level !== 'ban' && r.until ? '\nHết hạn ' + stampR(r.until) + ' (còn ' + fmt(r.remaining) + ')' : '') +
          (r.reason ? '\n**Lý do bị phạt:** ' + plain(r.reason, 300) : ''),
      ).addFields(
        {
          name: 'Cách gửi',
          value: '`' + prefix + 'khangnghi <lý do của bạn>`\nVí dụ: `' + prefix + 'khangnghi Em chỉ chơi bình thường, em không dùng bot tự động`',
          inline: false,
        },
        {
          name: 'Lưu ý',
          value:
            '• Viết **ít nhất 10 ký tự**, nói rõ tình huống của bạn.\n' +
            '• Mỗi lần chỉ gửi được **một đơn**, hãy chờ chủ bot xem xét.\n' +
            '• Nói thật sẽ được xem xét nhẹ hơn rất nhiều.',
          inline: false,
        },
      );
      if (rep.appeal && rep.appeal.status === 'pending') {
        e.addFields({
          name: '⏳ Bạn đang có đơn chờ duyệt',
          value: 'Gửi ' + stampR(rep.appeal.at) + '. Hãy kiên nhẫn chờ chủ bot xem xét nhé.',
          inline: false,
        });
      }
      return ctx.reply({ embeds: [e] }).catch(() => {});
    }

    // --- Gửi đơn ---
    const res = sstore.submitAppeal(userId, text, now);
    if (!res.ok) {
      return ctx.reply({ embeds: [Embed.error('Không gửi được đơn', res.error || 'Lỗi không rõ.')] }).catch(() => {});
    }

    // Ghi tên để chủ bot dễ nhận ra người gửi.
    try {
      sstore.setName(userId, ctx.author.tag || ctx.author.username || userId);
    } catch {
      /* không quan trọng */
    }

    const sent = await sendToOwner(client, ctx, userId, text, res.level);

    return ctx
      .reply({
        embeds: [
          Embed.success(
            '✉️ Đã gửi đơn kháng nghị',
            'Nội dung của bạn đã được ghi lại' +
              (sent ? ' và **đã gửi tới chủ bot**' : ' (chủ bot sẽ thấy khi mở bảng xử lý)') +
              '.\n\n' +
              '**Nội dung đã gửi:**\n' + plain(text, 500) + '\n\n' +
              'Trong lúc chờ, án của bạn **vẫn còn hiệu lực**. Vui lòng không gửi thêm đơn.',
          ),
        ],
      })
      .catch(() => {});
  },
};
