// =============================================================
//  Lệnh: fishdex - danh mục tất cả loài cá & độ hiếm
//  Đánh dấu loài bạn đã TỪNG câu được (lưu trọn đời, không mất khi bán).
// =============================================================
const { ActionRowBuilder, StringSelectMenuBuilder, ComponentType, MessageFlags } = require('discord.js');
const Embed = require('../../core/EmbedFactory');
const { colors } = require('../../core/palette');
const db = require('../../core/Database');
const fishing = require('../../core/fishing');

// Giới hạn của Discord: mô tả embed tối đa 4096 ký tự.
// Chừa sẵn biên an toàn vì số loài cá rất lớn (hàng trăm loài mỗi độ hiếm).
const MAX_DESC = 3800;

function dropRatePct(rarityKey) {
  const rs = fishing.RARITIES;
  if (!rs[rarityKey]) return '?';
  const total = Object.values(rs).reduce((a, x) => a + x.weight, 0);
  if (!total) return '?';
  const pct = (rs[rarityKey].weight / total) * 100;
  const val = pct >= 1 ? Number(pct.toFixed(2)) : Number(pct.toPrecision(2));
  return `${val}%`;
}

function progress(got, total) {
  const size = 12;
  const filled = total ? Math.round((got / total) * size) : 0;
  return '▰'.repeat(filled) + '▱'.repeat(size - filled);
}

function rarityEmbed(rarityKey, discovered) {
  const r = fishing.rarityMeta(rarityKey);
  const list = fishing.speciesByRarity(rarityKey);

  // Chỉ liệt kê loài ĐÃ sưu tầm, số loài chưa biết gộp thành 1 dòng.
  // Cách này vừa giữ nguyên ý nghĩa "ẩn loài chưa câu được",
  // vừa không bao giờ làm vượt giới hạn ký tự của Discord.
  const found = list.filter((sp) => (discovered[sp.id] || 0) > 0);
  const missing = list.length - found.length;

  const lines = [];
  let used = 0;
  let shown = 0;
  for (const sp of found) {
    const line = `✅ ${sp.emoji} **${sp.name}** \`×${discovered[sp.id]}\``;
    if (used + line.length + 1 > MAX_DESC) break;
    lines.push(line);
    used += line.length + 1;
    shown += 1;
  }
  if (shown < found.length) {
    lines.push(`… và **${found.length - shown}** loài đã sưu tầm khác`);
  }
  if (!found.length) {
    lines.push('*Bạn chưa sưu tầm được loài nào ở độ hiếm này.*');
  }
  if (missing > 0) {
    lines.push(`⬜ ❓ Còn **${missing}** loài chưa khám phá`);
  }

  const anim = r.animated ? '\n\n✨ *Loài cực hiếm này có hiệu ứng emoji động khi câu được!*' : '';
  const price = fishing.PRICES[rarityKey];
  const priceText = typeof price === 'number' ? price.toLocaleString('vi-VN') : '?';
  return Embed.custom(r.color, `${r.badge} Độ hiếm: ${r.label} — ${found.length}/${list.length}`, lines.join('\n') + anim)
    .setFooter({ text: `Giá bán: ${priceText} xu • Tỉ lệ ra: ${dropRatePct(rarityKey)}` });
}

function overview(discovered) {
  const rarities = Object.values(fishing.RARITIES).sort((a, b) => a.order - b.order);
  const total = fishing.SPECIES.length;
  const got = fishing.SPECIES.filter((s) => (discovered[s.id] || 0) > 0).length;
  const pct = total ? Math.round((got / total) * 100) : 0;
  const e = Embed.custom(colors.primary, '📖 Fishdex — Bộ sưu tập cá', `${progress(got, total)}  **${got}/${total}** loài (${pct}%)\nChọn một độ hiếm bên dưới để xem chi tiết.`);
  for (const r of rarities) {
    const list = fishing.speciesByRarity(r.key);
    const c = list.filter((s) => (discovered[s.id] || 0) > 0).length;
    const done = c === list.length ? ' ✅' : '';
    e.addFields({ name: `${r.badge} ${r.label}`, value: `${c}/${list.length} loài${done}`, inline: true });
  }
  return e;
}

module.exports = {
  name: 'fishdex',
  aliases: ['fishlist', 'danhmucca', 'dex'],
  category: 'fishing',
  description: 'Xem danh mục tất cả loài cá và độ hiếm (đánh dấu loài đã sưu tầm)',
  usage: '',
  cooldown: 5,
  guildOnly: true,
  slash: true,
  async run(ctx) {
    const wallet = db.getWallet(ctx.author.id);
    const discovered = (wallet.fishStats && wallet.fishStats.discovered) || {};

    const rarities = Object.values(fishing.RARITIES).sort((a, b) => a.order - b.order);
    const menu = new StringSelectMenuBuilder()
      .setCustomId('dex_menu')
      .setPlaceholder('🔎 Chọn độ hiếm để xem các loài cá...')
      .addOptions(rarities.map((r) => {
        const list = fishing.speciesByRarity(r.key);
        const c = list.filter((s) => (discovered[s.id] || 0) > 0).length;
        return { label: `${r.label} (${c}/${list.length})`, value: r.key, emoji: r.badge };
      }));
    const row = new ActionRowBuilder().addComponents(menu);

    const msg = await ctx.reply({ embeds: [overview(discovered)], components: [row] });
    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 120000 });

    collector.on('collect', async (i) => {
      if (i.user.id !== ctx.author.id) {
        return i.reply({ content: '❌ Menu này không phải của bạn!', flags: MessageFlags.Ephemeral }).catch(() => {});
      }
      await i.update({ embeds: [rarityEmbed(i.values[0], discovered)], components: [row] });
    });

    collector.on('end', () => {
      msg.edit({ components: [] }).catch(() => {});
    });
  },
};
