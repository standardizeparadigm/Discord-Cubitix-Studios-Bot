// =============================================================
//  Lệnh: botinfo - thông tin về bot
// =============================================================
const { version: djsVersion } = require('discord.js');
const Embed = require('../../core/EmbedFactory');
const { colors, emoji } = require('../../core/palette');
const db = require('../../core/Database');

function uptime(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${d} ngày ${h} giờ ${m} phút ${sec} giây`;
}

module.exports = {
  name: 'botinfo',
  aliases: ['bot', 'about', 'thongtinbot'],
  category: 'info',
  description: 'Xem thông tin và thống kê của bot',
  cooldown: 5,
  slash: true,
  async run(ctx) {
    const client = ctx.client;
    const totalUsers = client.guilds.cache.reduce((a, g) => a + (g.memberCount || 0), 0);
    const memMB = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);

    const embed = Embed.custom(colors.purple, `${emoji.rocket} ${client.config.brand} — Thông tin bot`)
      .setThumbnail(client.user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: '🤖 Tên bot', value: `${client.user.tag}`, inline: true },
        { name: '📦 Số lệnh', value: `${client.commands.size}`, inline: true },
        { name: '📁 Số nhóm lệnh', value: `${client.categories.length}`, inline: true },
        { name: '🏠 Máy chủ', value: `${client.guilds.cache.size}`, inline: true },
        { name: '👥 Người dùng', value: `${totalUsers}`, inline: true },
        { name: '⏱️ Thời gian hoạt động', value: uptime(client.uptime), inline: true },
        { name: '⚙️ Discord.js', value: `v${djsVersion}`, inline: true },
        { name: '🟢 Node.js', value: `${process.version}`, inline: true },
        { name: '💾 RAM đang dùng', value: `${memMB} MB`, inline: true },
      )
      .setFooter({ text: `${client.config.footerText} • Prefix: ${(ctx.guild ? db.getPrefix(ctx.guild.id) : null) || client.config.prefix}` });
    await ctx.reply({ embeds: [embed] });
  },
};
