// =============================================================
//  Lệnh: warn - cảnh cáo thành viên (lưu vào file JSON)
//  Dùng: warn @người <lý do> | warn list @người | warn clear @người
// =============================================================
const Embed = require('../../core/EmbedFactory');
const db = require('../../core/Database');
const { guardTarget } = require('../../core/modGuard');

module.exports = {
  name: 'warn',
  aliases: ['canhcao'],
  category: 'moderation',
  description: 'Cảnh cáo thành viên, xem danh sách hoặc xóa cảnh cáo',
  usage: '<@thành_viên> [lý do]  |  warn list @người  |  warn clear @người',
  cooldown: 4,
  guildOnly: true,
  permissions: ['ManageMessages'],
  slash: true,
  options: [
    { name: 'thành_viên', type: 'user', description: 'Thành viên bị cảnh cáo', required: true },
    { name: 'lý_do', type: 'string', description: 'Lý do (hoặc gõ "list" / "clear" ở đầu để xem / xóa)', required: false, rest: true },
  ],
  async run(ctx) {
    const member = await ctx.getMember('thành_viên');
    if (!member) return ctx.reply({ embeds: [Embed.error('Không tìm thấy', 'Hãy nhắc tên (mention) thành viên.')] });

    const rest = (ctx.getString('lý_do') || '').trim();
    const firstWord = rest.split(/\s+/)[0]?.toLowerCase();

    // --- Xem danh sách cảnh cáo ---
    if (firstWord === 'list' || firstWord === 'xem') {
      const list = db.getWarns(ctx.guild.id, member.id);
      if (!list.length) return ctx.reply({ embeds: [Embed.info('Không có cảnh cáo', `${member.user.tag} chưa bị cảnh cáo lần nào.`)] });
      // Chỉ hiện 10 cảnh cáo gần nhất và giới hạn độ dài (embed tối đa 4096 ký tự).
      const shown = list.slice(-10);
      let desc = shown
        .map((w, i) => `**${list.length - shown.length + i + 1}.** ${String(w.reason).slice(0, 300)}\n↳ bởi ${w.by} • <t:${Math.floor(w.at / 1000)}:R>`)
        .join('\n\n');
      if (list.length > shown.length) desc = `_(hiện ${shown.length} cảnh cáo gần nhất)_\n\n` + desc;
      desc = desc.slice(0, 4000);
      return ctx.reply({ embeds: [Embed.custom(Embed.colors.warning, `⚠️ Cảnh cáo của ${member.user.username} (${list.length})`, desc)] });
    }

    // --- Xóa toàn bộ cảnh cáo ---
    if (firstWord === 'clear' || firstWord === 'xoa') {
      // Chặn mod tự gột sạch hồ sơ cảnh cáo của chính mình.
      const gClear = guardTarget(ctx, member, 'clearwarn');
      if (!gClear.ok) return ctx.reply({ embeds: [gClear.embed] });
      db.clearWarns(ctx.guild.id, member.id);
      return ctx.reply({ embeds: [Embed.success('Đã xóa cảnh cáo', `Đã xóa toàn bộ cảnh cáo của ${member.user.tag}.`)] });
    }

    // --- Thêm cảnh cáo mới ---
    // Cắt bớt lý do: mỗi field của embed chỉ chứa tối đa 1024 ký tự.
    // Lá chắn chung: không tự cảnh cáo mình, không cảnh cáo bot/chủ máy chủ/người cấp cao hơn.
    const guard = guardTarget(ctx, member, 'warn');
    if (!guard.ok) return ctx.reply({ embeds: [guard.embed] });

    const reason = (rest || 'Không có lý do').slice(0, 500);
    const list = db.addWarn(ctx.guild.id, member.id, { reason, by: ctx.author.tag, at: Date.now() });
    const embed = Embed.custom(Embed.colors.warning, '⚠️ Đã cảnh cáo')
      .addFields(
        { name: 'Thành viên', value: `${member.user.tag}`, inline: true },
        { name: 'Tổng cảnh cáo', value: `${list.length}`, inline: true },
        { name: 'Lý do', value: reason },
      );
    await ctx.reply({ embeds: [embed] });
    member.send({ embeds: [Embed.warn(`Bạn bị cảnh cáo tại ${ctx.guild.name}`, `Lý do: ${reason}`)] }).catch(() => {});
  },
};
