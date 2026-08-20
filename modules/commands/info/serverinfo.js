// =============================================================
//  Lệnh: serverinfo - thông tin máy chủ
// =============================================================
const { ChannelType } = require('discord.js');
const Embed = require('../../core/EmbedFactory');
const { colors } = require('../../core/palette');

module.exports = {
  name: 'serverinfo',
  aliases: ['server', 'guild', 'thongtinserver'],
  category: 'info',
  description: 'Xem thông tin chi tiết của máy chủ',
  cooldown: 5,
  guildOnly: true,
  slash: true,
  async run(ctx) {
    // Tải danh sách thành viên có thể lâu hơn 3 giây ở máy chủ lớn.
    if (ctx.isSlash) await ctx.defer();

    const g = ctx.guild;
    await g.members.fetch().catch(() => {});
    const channels = g.channels.cache;
    const text = channels.filter((c) => c.type === ChannelType.GuildText).size;
    const voice = channels.filter((c) => c.type === ChannelType.GuildVoice).size;
    const owner = await g.fetchOwner().catch(() => null);
    const bots = g.members.cache.filter((m) => m.user.bot).size;
    const humans = g.memberCount - bots;

    const embed = Embed.custom(colors.info, `🏠 ${g.name}`)
      .setThumbnail(g.iconURL({ size: 256 }))
      .addFields(
        { name: '👑 Chủ sở hữu', value: owner ? `${owner.user.tag}` : 'Không rõ', inline: true },
        { name: '🆔 ID', value: `\`${g.id}\``, inline: true },
        { name: '📅 Tạo ngày', value: `<t:${Math.floor(g.createdTimestamp / 1000)}:D>`, inline: true },
        { name: '👥 Thành viên', value: `${g.memberCount}`, inline: true },
        { name: '👤 Người thật', value: `${humans}`, inline: true },
        { name: '🤖 Bot', value: `${bots}`, inline: true },
        { name: '💬 Kênh chat', value: `${text}`, inline: true },
        { name: '🔊 Kênh thoại', value: `${voice}`, inline: true },
        { name: '😀 Emoji', value: `${g.emojis.cache.size}`, inline: true },
        { name: '🎭 Vai trò', value: `${g.roles.cache.size}`, inline: true },
        { name: '✨ Mức boost', value: `Cấp ${g.premiumTier} (${g.premiumSubscriptionCount || 0} boost)`, inline: true },
      );
    if (g.bannerURL()) embed.setImage(g.bannerURL({ size: 1024 }));
    await ctx.reply({ embeds: [embed] });
  },
};
