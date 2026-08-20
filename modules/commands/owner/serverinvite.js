// =============================================================
//  Lệnh: serverinvite - tạo link mời tới một máy chủ bot đang ở (CHỈ CHỦ BOT)
// =============================================================
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const Embed = require('../../core/EmbedFactory');
const { colors } = require('../../core/palette');

const INVITABLE = [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice];

module.exports = {
  name: 'serverinvite',
  aliases: ['getinvite', 'createinvite', 'laymoi'],
  category: 'owner',
  description: 'Tạo link mời tới một máy chủ mà bot đang tham gia (chỉ chủ bot)',
  usage: '<ID máy chủ>',
  cooldown: 5,
  ownerOnly: true,
  slash: true,
  options: [{ name: 'server', type: 'string', description: 'ID máy chủ cần lấy link mời', required: true }],
  async run(ctx) {
    const client = ctx.client;
    const id = (ctx.getString('server') || '').trim();
    const guild = client.guilds.cache.get(id);
    if (!guild) {
      return ctx.reply({ embeds: [Embed.error('Không tìm thấy máy chủ', `Bot không ở trong máy chủ có ID \`${id}\`. Dùng \`servers\` để xem danh sách.`)] });
    }

    const me = guild.members.me || (await guild.members.fetchMe().catch(() => null));
    if (!me) {
      return ctx.reply({ embeds: [Embed.error('Lỗi', 'Không xác định được quyền của bot trong máy chủ này.')] });
    }

    const channel = guild.channels.cache.find(
      (c) => INVITABLE.includes(c.type) && c.permissionsFor(me)?.has(PermissionFlagsBits.CreateInstantInvite),
    );
    if (!channel) {
      return ctx.reply({ embeds: [Embed.error('Không thể tạo link mời', `Bot không có quyền **Tạo lời mời** ở bất kỳ kênh nào trong **${guild.name}**.`)] });
    }

    const invite = await channel
      .createInvite({ maxAge: 0, maxUses: 0, unique: true, reason: `Yêu cầu bởi chủ bot (${ctx.author.tag})` })
      .catch(() => null);
    if (!invite) {
      return ctx.reply({ embeds: [Embed.error('Thất bại', 'Không tạo được link mời. Có thể do thiếu quyền.')] });
    }

    const embed = Embed.custom(colors.success, '🔗 Link mời máy chủ')
      .addFields(
        { name: 'Máy chủ', value: `**${guild.name}**`, inline: true },
        { name: 'Kênh', value: `#${channel.name}`, inline: true },
        { name: 'Link', value: `https://discord.gg/${invite.code}` },
      )
      .setFooter({ text: 'Link không hết hạn, không giới hạn lượt dùng' });
    await ctx.reply({ embeds: [embed] });
  },
};
