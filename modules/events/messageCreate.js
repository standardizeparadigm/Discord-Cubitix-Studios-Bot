// =============================================================
//  Sự kiện: messageCreate - xử lý lệnh prefix
// =============================================================
const CommandContext = require('../core/CommandContext');
const runCommand = require('../core/runner');
const Embed = require('../core/EmbedFactory');
const afk = require('../core/afkStore');
const db = require('../core/Database');
const { PermissionsBitField } = require('discord.js');
const { AntiSpamEngine } = require('../core/antiSpam');
const abuseGuard = require('../core/abuseGuard');

// Bộ máy chống spam dùng chung (bộ nhớ tạm, tự suy giảm vi phạm theo thời gian).
const antiSpam = new AntiSpamEngine();
const REASON_TEXT = {
  flood: 'gửi tin quá nhanh',
  duplicate: 'lặp lại nội dung',
  mention: 'tag quá nhiều người',
  wall: 'xuống dòng quá nhiều',
  charflood: 'lặp ký tự quá nhiều',
  caps: 'viết HOA quá nhiều',
};
function describeReasons(rs) {
  return rs.map((r) => REASON_TEXT[r] || r).join(', ');
}
function humanTime(ms) {
  const s = Math.round(ms / 1000);
  if (s >= 3600) return `${Math.round(s / 3600)} giờ`;
  if (s >= 60) return `${Math.round(s / 60)} phút`;
  return `${s} giây`;
}

module.exports = {
  name: 'messageCreate',
  async execute(client, message) {
    if (message.author.bot || !message.guild) return;

    // --- Hệ thống chống spam thông minh (tự động cảnh cáo & timeout) ---
    const asPrivileged =
      message.author.id === client.config.ownerId ||
      message.member?.permissions?.has(PermissionsBitField.Flags.Administrator) ||
      message.member?.permissions?.has(PermissionsBitField.Flags.ManageMessages) ||
      message.member?.permissions?.has(PermissionsBitField.Flags.ManageGuild);
    if (!asPrivileged && db.isAntiSpamEnabled(message.guild.id)) {
      try {
        const mentionCount =
          message.mentions.users.size + message.mentions.roles.size + (message.mentions.everyone ? 5 : 0);
        const verdict = antiSpam.check({
          guildId: message.guild.id,
          userId: message.author.id,
          content: message.content,
          mentions: mentionCount,
          now: Date.now(),
        });
        if (verdict.flagged) {
          if (verdict.deleteMessage) message.delete().catch(() => {});
          const why = describeReasons(verdict.reasons);
          let desc;
          if (verdict.action === 'timeout' && verdict.timeoutMs > 0) {
            if (message.member?.moderatable) {
              await message.member.timeout(verdict.timeoutMs, `Chống spam: ${why}`).catch(() => {});
            }
            desc = `${message.author}, bạn đã bị tạm khóa chat **${humanTime(verdict.timeoutMs)}** vì spam (${why}).`;
          } else {
            desc = `${message.author}, vui lòng đừng spam (${why}). Tái phạm sẽ bị tạm khóa chat.`;
          }
          message.channel
            .send({ embeds: [Embed.warn('🛡️ Chống spam', desc)] })
            .then((m) => setTimeout(() => m.delete().catch(() => {}), 8000))
            .catch(() => {});
          return; // Ngừng xử lý — không chạy lệnh từ tin nhắn spam
        }
      } catch (e) {
        client.logger?.error?.('Lỗi anti-spam: ' + e.message);
      }
    }

    // --- Hệ thống chống acc clone: ghi nhận nhịp nói chuyện ---
    // Người thật thì có nói chuyện, acc clone thường chỉ gõ lệnh kiếm xu.
    // Hàm này tự giới hạn tần suất bên trong nên gọi mỗi tin nhắn vẫn rất nhẹ.
    try {
      abuseGuard.noteMessage(client, message);
    } catch (e) {
      client.logger?.error?.('Lỗi ghi nhận tin nhắn (chống gian lận): ' + e.message);
    }

    // Prefix riêng theo từng máy chủ (đọc lại mỗi tin nhắn -> áp dụng ngay).
    // Chỉ đọc MỘT lần rồi dùng chung, tránh đọc ổ đĩa 2 lần cho mỗi tin nhắn.
    const customPrefix = db.getPrefix(message.guild.id);
    const prefix = customPrefix || client.config.prefix;

    // Danh sách prefix chấp nhận: prefix tùy chỉnh (nếu có) + prefix mặc định.
    //  - Prefix mặc định LUÔN dùng song song với prefix tùy chỉnh.
    //  - So khớp KHÔNG phân biệt chữ hoa/thường.
    // Phòng trường hợp config.prefix bị bỏ trống -> quay về '!'
    const defaultPrefix = (typeof client.config.prefix === 'string' && client.config.prefix) || '!';
    const acceptedPrefixes = [];
    if (customPrefix) acceptedPrefixes.push(customPrefix);
    if (!acceptedPrefixes.some((p) => p.toLowerCase() === defaultPrefix.toLowerCase())) {
      acceptedPrefixes.push(defaultPrefix);
    }
    // Ưu tiên prefix dài hơn để tránh nhập nhằng (vd: '!!' trước '!').
    const sortedPrefixes = acceptedPrefixes.slice().sort((a, b) => b.length - a.length);
    const matchPrefix = (content) => {
      const lower = content.toLowerCase();
      for (const p of sortedPrefixes) {
        if (lower.startsWith(p.toLowerCase())) return content.slice(0, p.length);
      }
      return null;
    };

    // SỬA LỖI: trước đây phần AFK dùng nội dung đã .trim() còn phần nhận lệnh lại dùng
    // nội dung thô, nên tin nhắn có khoảng trắng/xuống dòng ở đầu (vd: " !daily")
    // bị coi là đang gọi lệnh (nên không gỡ AFK) nhưng lại KHÔNG chạy được lệnh.
    // Nay cả hai nơi dùng chung một biến để hành vi luôn nhất quán.
    const trimmedContent = message.content.trim();

    // --- Hệ thống AFK ---
    try {
      // Thông báo khi có người nhắc đến thành viên đang AFK
      const notes = [];
      for (const u of message.mentions.users.values()) {
        if (u.bot || u.id === message.author.id) continue;
        const info = afk.get(message.guild.id, u.id);
        if (info) notes.push(`**${u.username}** đang AFK: ${info.reason} • <t:${Math.floor(info.since / 1000)}:R>`);
      }
      if (notes.length) {
        message.reply({ embeds: [Embed.info('Thành viên đang AFK', notes.slice(0, 3).join('\n'))] }).catch(() => {});
      }

      // Tự gỡ AFK khi chủ nhân quay lại (trừ khi đang gọi lệnh afk)
      const trimmed = trimmedContent;
      const afkUsed = matchPrefix(trimmed);
      const afkRest = afkUsed ? trimmed.slice(afkUsed.length).trim().toLowerCase() : '';
      const isAfkCmd = !!afkUsed && ['afk', 'nghi', 'nghingoi'].some((n) => afkRest === n || afkRest.startsWith(n + ' '));
      const mine = afk.get(message.guild.id, message.author.id);
      if (mine && !isAfkCmd) {
        afk.clear(message.guild.id, message.author.id);
        message
          .reply({ embeds: [Embed.custom(Embed.colors.success, '👋 Chào mừng trở lại!', 'Đã gỡ trạng thái AFK của bạn.')] })
          .then((m) => setTimeout(() => m.delete().catch(() => {}), 8000))
          .catch(() => {});
      }
    } catch (e) {
      client.logger?.error?.('Lỗi xử lý AFK: ' + e.message);
    }

    // Cho phép gọi bot bằng cách mention (client.user có thể chưa sẵn sàng khi vừa kết nối)
    if (!client.user) return;
    const mentionPrefix = new RegExp(`^<@!?${client.user.id}>\\s*`);
    let used = null;
    let usedMention = false;
    const textPrefix = matchPrefix(trimmedContent);
    if (textPrefix !== null) {
      used = textPrefix;
    } else if (mentionPrefix.test(trimmedContent)) {
      used = trimmedContent.match(mentionPrefix)[0];
      usedMention = true;
    } else return;

    const args = trimmedContent.slice(used.length).trim().split(/\s+/);
    const cmdName = (args.shift() || '').toLowerCase();
    if (!cmdName) {
      // Chỉ mention bot -> gợi ý dùng help
      if (usedMention) {
        message.reply({
          embeds: [Embed.info('Xin chào!', `Prefix của tôi là \`${prefix}\`. Gõ \`${prefix}help\` để xem tất cả lệnh.`)],
        }).catch(() => {});
      }
      return;
    }

    const command =
      client.commands.get(cmdName) || client.commands.get(client.aliases.get(cmdName));
    if (!command) return;

    const ctx = new CommandContext(client, { message, command, args });
    await runCommand(client, command, ctx);
  },
};
