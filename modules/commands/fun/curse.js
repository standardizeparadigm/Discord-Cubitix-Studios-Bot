// =============================================================
//  Lệnh: curse - nguyền rủa, giảm điểm may mắn (-1)
//  - Không mention: -1 điểm may mắn của chính mình
//  - Có mention: -1 điểm may mắn của người được nhắc
//  - CHỈ ảnh hưởng tới điểm may mắn, không cướp xu, không tác dụng phụ
//  - Thời gian chờ: 5 phút
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { colors } = require('../../core/palette');
const db = require('../../core/Database');
const rng = require('../../core/secureRandom');

const CURSE_CD = 5 * 60 * 1000; // 5 phút

const SELF = [
  'Bạn tự gieo lên mình một lời nguyền u ám',
  'Một bóng đen thoáng lướt qua vận may của bạn',
  'Bạn lỡ giẫm phải vệt xui rủi',
  'Vận may của bạn chợt hao đi một chút',
];
const OTHER = [
  'Bạn gieo điều xui rủi lên {name}',
  'Một lời nguyền hắc ám giáng xuống {name}',
  'Bạn rút bớt vận may của {name}',
  'Bóng tối lởn vởn quanh {name} theo lời bạn',
];

module.exports = {
  name: 'curse',
  aliases: ['nguyen', 'nguyenrua', 'voodoo'],
  category: 'fun',
  description: 'Nguyền rủa -1 điểm may mắn: bỏ trống = chính mình, có nhắc = người đó (5 phút/lần)',
  usage: 'curse [@người]',
  cooldown: 3,
  guildOnly: true,
  slash: true,
  options: [
    { name: 'nguoi', type: 'user', description: 'Người bị nguyền (bỏ trống = chính bạn)', required: false },
  ],
  async run(ctx) {
    const now = Date.now();
    const caster = db.getWallet(ctx.author.id);

    // --- Thời gian chờ 5 phút (tính trên người dùng lệnh) ---
    const passed = now - (caster.lastCurse || 0);
    if (passed < CURSE_CD) {
      const left = CURSE_CD - passed;
      const m = Math.floor(left / 60000);
      const s = Math.floor((left % 60000) / 1000);
      return ctx.reply({ embeds: [Embed.warn('Năng lượng hắc ám chưa hồi', `Hãy chờ **${m} phút ${s} giây** nữa mới có thể nguyền tiếp.`)] });
    }

    const target = ctx.getUser('nguoi');
    if (target && target.bot) {
      return ctx.reply({ embeds: [Embed.warn('Không thể nguyền bot', 'Bầy bot miễn nhiễm với lời nguyền của bạn.')] });
    }

    // Ghi nhận thời điểm dùng lệnh (cooldown của người nguyền)
    caster.lastCurse = now;
    const isSelf = !target || target.id === ctx.author.id;

    let victim;
    let victimName;
    if (isSelf) {
      victim = caster;
      victimName = ctx.author.username;
    } else {
      victim = db.getWallet(target.id);
      victimName = target.username;
    }

    // Chỉ giảm điểm may mắn -1, KHÔNG đụng tới bất cứ thứ gì khác
    victim.karma = (victim.karma || 0) - 1;

    if (isSelf) {
      db.saveWallet(ctx.author.id, caster);
    } else {
      db.saveWallet(target.id, victim);
      db.saveWallet(ctx.author.id, caster);
    }

    const flavor = rng.pick(isSelf ? SELF : OTHER).replace('{name}', `**${victimName}**`);
    const who = isSelf ? 'bạn' : `**${victimName}**`;
    const embed = Embed.custom(colors.purple, '🔮 Lời nguyền')
      .setDescription(`${flavor}.\n\n🍀 Điểm may mắn của ${who} **-1** → **${victim.karma}**`)
      .setFooter({ text: 'Quay lại sau 5 phút để nguyền tiếp' });
    await ctx.reply({ embeds: [embed] });
  },
};
