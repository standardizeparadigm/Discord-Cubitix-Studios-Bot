// =============================================================
//  Lệnh: aquarium - xem bể cá (cá đã câu, chưa bán)
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { colors, emoji } = require('../../core/palette');
const db = require('../../core/Database');
const fishing = require('../../core/fishing');

module.exports = {
  name: 'aquarium',
  aliases: ['aq', 'beca', 'tank', 'hoca'],
  category: 'fishing',
  description: 'Xem bể cá của bạn hoặc người khác',
  usage: '[@thành_viên]',
  cooldown: 4,
  guildOnly: true,
  slash: true,
  options: [{ name: 'thành_viên', type: 'user', description: 'Người muốn xem (bỏ trống = chính bạn)', required: false }],
  async run(ctx) {
    const user = ctx.getUser('thành_viên') || ctx.author;
    const wallet = db.getWallet(user.id);
    const aquarium = wallet.aquarium || [];

    if (!aquarium.length) {
      return ctx.reply({
        embeds: [Embed.info(`🐠 Bể cá của ${user.username}`, `Bể cá đang trống. Dùng \`${db.getPrefix(ctx.guild?.id) || ctx.client.config.prefix}fish\` để bắt đầu câu!`)],
      });
    }

    // Gom nhóm theo loài cá: { id: { count, value } }
    const groups = {};
    let totalValue = 0;
    for (const f of aquarium) {
      // Dùng giá HIỆN TẠI (fishing.valueOf) thay vì giá lưu lúc câu,
      // nếu không bảng giá sau khi cân bằng sẽ lệch với số xu bán thực nhận.
      const v = fishing.valueOf(f);
      totalValue += v;
      if (!groups[f.id]) groups[f.id] = { count: 0, value: 0 };
      groups[f.id].count += 1;
      groups[f.id].value += v;
    }

    // Sắp xếp theo độ hiếm giảm dần
    const embed = Embed.custom(colors.aqua, `🐠 Bể cá của ${user.username}`)
      .setThumbnail(user.displayAvatarURL());

    // Giới hạn của Discord: mỗi field tối đa 1024 ký tự và tối đa 25 field.
    // Bể cá có thể chứa rất nhiều loài nên phải tự cắt thành nhiều field,
    // nếu không Discord sẽ từ chối toàn bộ tin nhắn và lệnh báo lỗi.
    const FIELD_MAX = 1000;
    const MAX_FIELDS = 24;
    const rarities = Object.values(fishing.RARITIES).sort((a, b) => b.order - a.order);
    let fieldCount = 0;
    let truncated = false;

    for (const r of rarities) {
      if (fieldCount >= MAX_FIELDS) { truncated = true; break; }
      const speciesInRarity = fishing.speciesByRarity(r.key).filter((sp) => groups[sp.id]);
      if (!speciesInRarity.length) continue;

      const lines = speciesInRarity.map((sp) => {
        const g = groups[sp.id];
        return `${sp.emoji} **${sp.name}** ×${g.count} — ${g.value.toLocaleString('vi-VN')} xu`;
      });

      // Cắt danh sách thành các khối không vượt FIELD_MAX ký tự.
      const chunks = [];
      let buf = [];
      let len = 0;
      for (const line of lines) {
        if (buf.length && len + line.length + 1 > FIELD_MAX) {
          chunks.push(buf.join('\n'));
          buf = [];
          len = 0;
        }
        buf.push(line);
        len += line.length + 1;
      }
      if (buf.length) chunks.push(buf.join('\n'));

      for (let idx = 0; idx < chunks.length; idx += 1) {
        if (fieldCount >= MAX_FIELDS) { truncated = true; break; }
        embed.addFields({
          name: idx === 0 ? `${r.badge} ${r.label}` : `${r.badge} ${r.label} (tiếp)`,
          value: chunks[idx],
        });
        fieldCount += 1;
      }
      if (truncated) break;
    }

    const note = truncated ? ' • danh sách quá dài nên đã rút gọn' : '';
    embed.setFooter({ text: `Tổng ${aquarium.length} con • Giá trị ~${totalValue.toLocaleString('vi-VN')} xu • ${emoji.coin} sellfish để bán${note}` });
    await ctx.reply({ embeds: [embed] });
  },
};
