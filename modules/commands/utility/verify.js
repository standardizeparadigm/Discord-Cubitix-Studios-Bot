// =============================================================
//  Lệnh: verify - TỰ XÁC MINH LÀ NGƯỜI THẬT
//
//  Dành cho người chơi bị hệ thống chống bot / chống acc clone
//  nhắc nhở hoặc khoá tạm. Giải đúng một câu đố nhỏ là:
//    - Gỡ toàn bộ khoá tạm đang có
//    - Cộng điểm tin cậy
//    - Xóa dữ liệu nghi ngờ cũ (muốn phạt lại phải có bằng chứng mới)
//
//  Lệnh này được miễn kiểm tra chống gian lận (bypassAbuseGuard)
//  để người đang bị khoá vẫn dùng được — tránh bị kỹt.
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { colors, emoji } = require('../../core/palette');
const guard = require('../../core/abuseGuard');

function bar(value, max = 100, size = 12) {
  const ratio = Math.min(1, Math.max(0, (Number(value) || 0) / Math.max(1, max)));
  const filled = Math.round(ratio * size);
  return '`' + '\u2588'.repeat(filled) + '\u2591'.repeat(Math.max(0, size - filled)) + '`';
}

function stamp(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return 'chưa có';
  return '<t:' + Math.floor(n / 1000) + ':R>';
}

const TIER_TEXT = {
  ok: '🟢 Bình thường',
  watch: '🟡 Đang theo dõi',
  quarantine: '🟠 Bị hạn chế',
  freeze: '🔴 Bị phong toả',
};

// Dụng bảng trạng thái cá nhân.
function statusEmbed(rep, ctx) {
  const on = { auto: guard.isAutomationOn(), alt: guard.isAltOn() };
  const now = Date.now();

  if (!rep) {
    return Embed.custom(
      colors.success,
      '✅ Tài khoản của bạn hoàn toàn bình thường',
      'Hệ thống chưa ghi nhận bất kỳ dấu hiệu đáng nghi nào từ bạn. Bạn không cần làm gì cả, chứ chơi bình thường thôi!',
    ).addFields(
      { name: '🤖 Chống bot tự động', value: on.auto ? '🟢 Đang bật' : '⚪ Đang tắt', inline: true },
      { name: '👥 Chống acc clone', value: on.alt ? '🟢 Đang bật' : '⚪ Đang tắt', inline: true },
    );
  }

  const locked = rep.penaltyUntil > now;
  const tier = rep.riskTier || 'ok';
  const color = locked || tier === 'freeze' ? colors.error : tier === 'quarantine' || tier === 'watch' ? colors.warning : colors.success;

  const e = Embed.custom(
    color,
    '🛡️ Trạng thái tài khoản của bạn',
    rep.trusted
      ? '⭐ Bạn đã nằm trong **danh sách tin cậy** của chủ bot — mọi kiểm tra chống gian lận đều được bỏ qua cho bạn.'
      : locked
        ? '🔒 Các lệnh liên quan đến tiền của bạn **đang bị khoá tạm**. Hãy giải câu đố bên dưới để gỡ ngay.'
        : 'Dưới đây là những gì hệ thống chống gian lận đang thấy về tài khoản của bạn.',
  );

  e.addFields(
    { name: '💚 Điểm tin cậy', value: `${bar(rep.trust)} **${Math.round(rep.trust)}**/100`, inline: false },
    {
      name: '🤖 Điểm nghi dùng máy',
      value: `${bar(rep.autoScore)} **${Math.round(rep.autoScore)}**/100`,
      inline: true,
    },
    { name: '👥 Điểm nghi acc clone', value: `${bar(rep.risk)} **${Math.round(rep.risk)}**/100`, inline: true },
    { name: '📑 Mức hiện tại', value: TIER_TEXT[tier] || tier, inline: true },
  );

  if (locked) {
    e.addFields({
      name: '🔒 Đang khoá tạm',
      value: `${guard.fmtDuration(rep.penaltyUntil - now)} nữa (${stamp(rep.penaltyUntil)})${
        rep.penaltyReason ? '\n└ ' + String(rep.penaltyReason).slice(0, 200) : ''
      }`,
      inline: false,
    });
  }

  const signs = [];
  for (const l of rep.autoLabels || []) signs.push('🤖 ' + l);
  for (const l of rep.riskLabels || []) signs.push('👥 ' + l);
  if (signs.length) {
    e.addFields({
      name: '🔎 Dấu hiệu hệ thống ghi nhận',
      value: signs.slice(0, 8).map((s) => '• ' + s).join('\n').slice(0, 1000),
      inline: false,
    });
  }

  e.addFields(
    { name: '📛 Tuổi tài khoản', value: rep.ageDays == null ? 'không rõ' : `${rep.ageDays.toFixed(1)} ngày`, inline: true },
    { name: '⌨️ Số lệnh đã dùng', value: String(rep.cmdCount || 0), inline: true },
    { name: '💬 Số tin nhắn', value: String(rep.msgCount || 0), inline: true },
    {
      name: '🧩 Lịch sử xác minh',
      value: `Đúng **${rep.captcha.passed}** • Sai **${rep.captcha.failed}** • Tổng **${rep.captcha.issued}**`,
      inline: true,
    },
    { name: '⚠️ Cảnh cáo', value: String(rep.strikes || 0), inline: true },
  );

  if (rep.remainingClusterEarn != null) {
    e.addFields({
      name: '🧾 Xu còn được kiếm hôm nay',
      value: `${Number(rep.remainingClusterEarn).toLocaleString('vi-VN')} xu (dùng chung cho nhóm tài khoản bị nghi)`,
      inline: false,
    });
  }

  e.setFooter({ text: (ctx.author.tag || ctx.author.username || '') + ' \u2022 Hệ thống chống gian lận' });
  e.setTimestamp(new Date());
  return e;
}

module.exports = {
  name: 'verify',
  aliases: ['xacminh', 'xac-minh', 'xm', 'nguoithat'],
  category: 'utility',
  description: 'Xem trạng thái chống gian lận của bạn và tự xác minh là người thật',
  usage: '[status]',
  cooldown: 20,
  slash: true,
  // RẤT QUAN TRỌNG: không được để lệnh này bị chính hệ thống chống gian lận chặn.
  bypassAbuseGuard: true,
  options: [
    {
      name: 'chế_độ',
      type: 'string',
      description: 'Chỉ xem trạng thái, hoặc giải câu đố để xác minh',
      required: false,
      choices: [
        { name: 'Xác minh ngay (giải câu đố)', value: 'verify' },
        { name: 'Chỉ xem trạng thái', value: 'status' },
      ],
    },
  ],

  async run(ctx) {
    const client = ctx.client;
    const mode = String(ctx.getString('chế_độ') || (ctx.args && ctx.args[0]) || '')
      .trim()
      .toLowerCase();
    const onlyStatus = ['status', 'tt', 'trangthai', 'xem', 'info'].includes(mode);

    const rep = guard.report(ctx.author.id);

    // Không bật hệ thống nào -> chỉ báo cho biết.
    if (!guard.isAutomationOn() && !guard.isAltOn()) {
      return ctx.reply({
        embeds: [
          Embed.custom(
            colors.info,
            'ℹ️ Hệ thống chống gian lận đang tắt',
            'Chủ bot đang tắt cả hai hệ thống chống gian lận nên bạn không cần xác minh gì cả.',
          ),
        ],
      });
    }

    if (rep && rep.trusted) {
      return ctx.reply({ embeds: [statusEmbed(rep, ctx)] });
    }

    const now = Date.now();
    const needVerify =
      rep &&
      (rep.penaltyUntil > now ||
        rep.strikes > 0 ||
        rep.riskTier === 'watch' ||
        rep.riskTier === 'quarantine' ||
        rep.riskTier === 'freeze' ||
        rep.autoScore >= 40);

    // Chỉ xem, hoặc không có gì cần gỡ -> hiển thị trạng thái.
    if (onlyStatus || !needVerify) {
      const e = statusEmbed(rep, ctx);
      if (!needVerify) {
        e.addFields({
          name: '✅ Kết luận',
          value: 'Bạn **không bị hạn chế gì**. Không cần giải câu đố nào cả.',
          inline: false,
        });
      } else {
        e.addFields({
          name: '🧩 Muốn gỡ ngay?',
          value: `Gõ \`${(client.config && client.config.prefix) || '!'}verify\` (không kèm tham số) để giải câu đố xác minh.`,
          inline: false,
        });
      }
      return ctx.reply({ embeds: [e] });
    }

    // ----- Giải câu đố -----
    const res = await guard.selfVerify(client, ctx);

    if (res.reason === 'busy') {
      return ctx.send({
        embeds: [Embed.warn('Đang có câu đố chưa xong', 'Bạn đang có một câu đố xác minh chưa trả lời. Hãy hoàn thành câu đó trước.')],
      });
    }

    const after = guard.report(ctx.author.id);

    if (res.ok) {
      const e = Embed.custom(
        colors.success,
        `${emoji.success} Xác minh thành công!`,
        'Cảm ơn bạn đã chứng minh mình là người thật. Mọi khoá tạm đã được gỡ và bạn có thể chơi bình thường ngay.',
      ).addFields(
        { name: '⏱️ Thời gian trả lời', value: `${(res.ms / 1000).toFixed(2)}s`, inline: true },
        { name: '💚 Điểm tin cậy', value: after ? `${Math.round(after.trust)}/100` : '—', inline: true },
        { name: '🔓 Khoá tạm', value: 'Đã gỡ hoàn toàn', inline: true },
      );
      if (after && (after.riskTier === 'quarantine' || after.riskTier === 'freeze')) {
        e.addFields({
          name: '⚠️ Lưu ý',
          value:
            'Tài khoản của bạn **vẫn đang bị hệ thống chống acc clone đánh dấu** (đây là hệ thống khác, dựa trên tuổi tài khoản, dòng chuyển xu…).\n' +
            'Hãy liên hệ chủ bot nếu bạn cho rằng mình bị nhầm.',
          inline: false,
        });
      }
      return ctx.send({ embeds: [e] });
    }

    const why =
      res.reason === 'too_fast'
        ? 'Bạn bấm nhanh hơn mức một người đọc kịp câu hỏi.'
        : res.reason === 'timeout'
          ? 'Bạn không trả lời kịp thời gian cho phép.'
          : res.reason === 'wrong'
            ? 'Bạn chọn sai đáp án.'
            : 'Không gửi được câu đố (có thể bot thiếu quyền gửi tin/nút trong kênh này).';

    return ctx.send({
      embeds: [
        Embed.custom(colors.error, `${emoji.error} Xác minh chưa thành công`, why).addFields(
          {
            name: '🔁 Thử lại',
            value: `Đợi hết thời gian chờ rồi gõ lại \`${(client.config && client.config.prefix) || '!'}verify\`.`,
            inline: false,
          },
          {
            name: '💬 Vẫn bị nhầm?',
            value: 'Nếu bạn chắc chắn mình không dùng bot tự động, hãy liên hệ chủ bot để được đưa vào danh sách tin cậy.',
            inline: false,
          },
        ),
      ],
    });
  },
};
