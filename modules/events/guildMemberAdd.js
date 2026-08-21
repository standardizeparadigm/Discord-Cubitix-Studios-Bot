// =============================================================
//  Sự kiện: guildMemberAdd - chào mừng thành viên mới
//
//  - Bật/tắt riêng cho từng máy chủ bằng lệnh `welcome` (quản trị viên).
//  - Mặc định lấy theo WELCOME_CHANNEL_ID / WELCOME_ENABLED trong .env.
//  - Kèm theo dõi người mời: hiện ai đã mời và họ có bao nhiêu lượt mời.
// =============================================================
const welcomeStore = require('../core/welcomeStore');
const inviteStore = require('../core/inviteStore');
const greetings = require('../core/greetings');
const abuseGuard = require('../core/abuseGuard');

module.exports = {
  name: 'guildMemberAdd',
  async execute(client, member) {
    try {
      if (!member || !member.guild) return;
      // Bỏ qua bot khi đếm lượt mời, nhưng vẫn chào nếu máy chủ muốn.
      const settings = welcomeStore.resolve(member.guild.id, client.config);

      // --- Theo dõi người mời (làm trước để số liệu luôn đúng, kể cả khi tắt lời chào) ---
      let invite = null;
      if (settings.inviteTracking && !member.user.bot) {
        const found = await inviteStore.detectInviter(member.guild).catch(() => null);
        if (found) {
          const credited = inviteStore.credit(member.guild.id, found.inviterId, member.id, found.code);
          invite = {
            inviterId: found.inviterId || '',
            code: found.code || '',
            vanity: Boolean(found.vanity),
            total: credited ? credited.total : 0,
          };
          // Người tự mời chính mình thì không ghi công (tránh cày lượt mời ảo).
          if (invite.inviterId && invite.inviterId === String(member.id)) {
            invite.inviterId = '';
          }
        }
      }

      // --- Hệ thống chống acc clone: ghi nhận lượt vào máy chủ ---
      // Nhiều tài khoản mới vào cùng một lúc, hoặc cùng một người mời, là
      // dấu hiệu rất mạnh của việc tạo acc clone để cày xu.
      // Đặt trước phần lời chào để dữ liệu luôn được ghi, kể cả khi tắt lời chào.
      if (!member.user.bot) {
        try {
          abuseGuard.noteJoin(client, member, (invite && invite.inviterId) || '');
        } catch (e) {
          client.logger?.error?.('Lỗi ghi nhận lượt vào (chống gian lận): ' + e.message);
        }
      }

      // --- Gửi lời chào ---
      if (!settings.welcomeEnabled) return;
      const channel = await greetings.resolveChannel(member.guild, settings.welcomeChannelId);
      if (!channel) return;
      if (!greetings.canSpeak(channel, member.guild)) {
        client.logger?.warn?.(
          'Không gửi được lời chào tại "' + member.guild.name + '": bot thiếu quyền ở kênh chào mừng.',
        );
        return;
      }

      const embed = greetings.welcomeEmbed(member, invite);
      await channel.send({ content: String(member), embeds: [embed] }).catch(() => {});
    } catch (err) {
      client.logger?.error?.('Lỗi sự kiện chào mừng: ' + (err && err.message ? err.message : err));
    }
  },
};
