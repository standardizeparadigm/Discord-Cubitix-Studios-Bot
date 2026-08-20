// =============================================================
//  Lệnh: pray - cầu nguyện tăng điểm may mắn (+1)
//  - Không mention: +1 điểm may mắn cho chính mình
//  - Có mention: +1 điểm may mắn cho người được nhắc
//  - CHỈ ảnh hưởng tới điểm may mắn, không thưởng xu, không tác dụng phụ
//  - Thời gian chờ: 5 phút
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { colors } = require('../../core/palette');
const db = require('../../core/Database');
const rng = require('../../core/secureRandom');

const PRAY_CD = 5 * 60 * 1000; // 5 phút

// Lời chúc ngẫu nhiên (chỉ để cho vui, KHÔNG ảnh hưởng kết quả)
const SELF = [
  'Một vầng hào quang ấm áp bao bọc lấy bạn',
  'Thần May Mắn mỉm cười với bạn',
  'Bạn thắp một nén nhang thành tâm',
  'Tiếng chuông ngân vang, lòng bạn an yên',
  'Bạn gửi một điều ước lên trời cao',
];
const OTHER = [
  'Bạn thành tâm cầu phước cho {name}',
  'Một luồng ánh sáng may mắn lan tới {name}',
  'Bạn gửi lời chúc bình an đến {name}',
  'Thần May Mắn ghé thăm {name} theo lời khấn của bạn',
  'Bạn thắp một nén nhang cầu phúc cho {name}',
];

module.exports = {
  name: 'pray',
  aliases: ['caunguyen', 'khan', 'blessing'],
  category: 'fun',
  description: 'Cầu nguyện +1 điểm may mắn cho bản thân hoặc người được nhắc (5 phút/lần)',
  usage: 'pray [@người]',
  cooldown: 3,
  guildOnly: true,
  slash: true,
  options: [
    { name: 'nguoi', type: 'user', description: 'Người được cầu phước (bỏ trống = chính bạn)', required: false },
  ],
  async run(ctx) {
    const now = Date.now();
    const caster = db.getWallet(ctx.author.id);

    // --- Thời gian chờ 5 phút (tính trên người dùng lệnh) ---
    const passed = now - (caster.lastPray || 0);
    if (passed < PRAY_CD) {
      const left = PRAY_CD - passed;
      const m = Math.floor(left / 60000);
      const s = Math.floor((left % 60000) / 1000);
      return ctx.reply({ embeds: [Embed.warn('Thần linh cần nghỉ ngơi', `Hãy cầu nguyện lại sau **${m} phút ${s} giây** nữa.`)] });
    }

    const target = ctx.getUser('nguoi');
    if (target && target.bot) {
      return ctx.reply({ embeds: [Embed.warn('Không thể cầu cho bot', 'Bầy bot không có điểm may mắn để nhận phước.')] });
    }

    // Ghi nhận thời điểm dùng lệnh (cooldown của người cầu nguyện)
    caster.lastPray = now;
    const isSelf = !target || target.id === ctx.author.id;

    let receiver;
    let receiverName;
    if (isSelf) {
      receiver = caster;
      receiverName = ctx.author.username;
    } else {
      receiver = db.getWallet(target.id);
      receiverName = target.username;
    }

    // Chỉ tăng điểm may mắn +1, KHÔNG đụng tới bất cứ thứ gì khác
    receiver.karma = (receiver.karma || 0) + 1;

    if (isSelf) {
      db.saveWallet(ctx.author.id, caster);
    } else {
      db.saveWallet(target.id, receiver);
      db.saveWallet(ctx.author.id, caster);
    }

    const flavor = rng.pick(isSelf ? SELF : OTHER).replace('{name}', `**${receiverName}**`);
    const who = isSelf ? 'bạn' : `**${receiverName}**`;
    const embed = Embed.custom(colors.gold, '🙏 Phước lành')
      .setDescription(`${flavor}.\n\n🍀 Điểm may mắn của ${who} **+1** → **${receiver.karma}**`)
      .setFooter({ text: 'Quay lại sau 5 phút để cầu nguyện tiếp' });
    await ctx.reply({ embeds: [embed] });
  },
};
