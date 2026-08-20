// =============================================================
//  Sự kiện: guildMemberRemove - lời tạm biệt khi thành viên rời đi
//
//  - Bật/tắt riêng cho từng máy chủ bằng lệnh `welcome` (quản trị viên).
//  - Mặc định lấy theo GOODBYE_CHANNEL_ID / GOODBYE_ENABLED trong .env.
//    Nếu chưa đặt GOODBYE_CHANNEL_ID thì dùng chung kênh chào mừng.
// =============================================================
const welcomeStore = require('../core/welcomeStore');
const inviteStore = require('../core/inviteStore');
const greetings = require('../core/greetings');

module.exports = {
  name: 'guildMemberRemove',
  async execute(client, member) {
    try {
      if (!member || !member.guild) return;
      const settings = welcomeStore.resolve(member.guild.id, client.config);

      // Trừ lượt mời của người đã mời thành viên này (luôn làm, kể cả khi tắt lời tạm biệt).
      let leaveInfo = null;
      if (settings.inviteTracking && member.user && !member.user.bot) {
        leaveInfo = inviteStore.noteLeave(member.guild.id, member.id);
      }

      if (!settings.goodbyeEnabled) return;
      const channel = await greetings.resolveChannel(member.guild, settings.goodbyeChannelId);
      if (!channel) return;
      if (!greetings.canSpeak(channel, member.guild)) {
        client.logger?.warn?.(
          'Không gửi được lời tạm biệt tại "' + member.guild.name + '": bot thiếu quyền ở kênh tạm biệt.',
        );
        return;
      }

      const embed = greetings.goodbyeEmbed(member, leaveInfo);
      await channel.send({ embeds: [embed] }).catch(() => {});
    } catch (err) {
      client.logger?.error?.('Lỗi sự kiện tạm biệt: ' + (err && err.message ? err.message : err));
    }
  },
};
