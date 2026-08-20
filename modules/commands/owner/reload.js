// =============================================================
//  Lệnh: reload - nạp lại một lệnh từ ổ đĩa mà không cần khởi động lại (CHỈ CHỦ BOT)
//  Lưu ý: chỉ nạp lại phần LOGIC (hàm run). Nếu đổi tên/mô tả/option của
//  slash command thì cần khởi động lại bot để đồng bộ lại với Discord.
// =============================================================
const path = require('path');
const Embed = require('../../core/EmbedFactory');
const { colors } = require('../../core/palette');

module.exports = {
  name: 'reload',
  aliases: ['rl', 'reloadcmd'],
  category: 'owner',
  description: 'Nạp lại một lệnh từ ổ đĩa (chỉ chủ bot)',
  usage: '<tên lệnh>',
  cooldown: 3,
  ownerOnly: true,
  slash: true,
  options: [{ name: 'lệnh', type: 'string', description: 'Tên lệnh cần nạp lại', required: true }],
  async run(ctx) {
    const client = ctx.client;
    const name = (ctx.getString('lệnh') || '').trim().toLowerCase();
    if (!name) {
      return ctx.reply({ embeds: [Embed.error('Thiếu tên lệnh', 'Hãy nhập tên lệnh cần nạp lại. Ví dụ: `reload ping`')] });
    }

    const target = client.commands.get(name) || client.commands.get(client.aliases.get(name));
    if (!target) {
      return ctx.reply({ embeds: [Embed.error('Không tìm thấy lệnh', `Không có lệnh tên \`${name}\`.`)] });
    }
    const file = target.__file;
    if (!file) {
      return ctx.reply({ embeds: [Embed.error('Không thể nạp lại', 'Không xác định được tệp nguồn của lệnh này.')] });
    }

    const oldAliases = target.aliases || [];
    let resolved;
    try {
      resolved = require.resolve(file);
    } catch {
      resolved = file;
    }
    delete require.cache[resolved];

    let fresh;
    try {
      fresh = require(file);
    } catch (err) {
      client.commands.set(target.name, target); // giữ lại bản cũ
      return ctx.reply({ embeds: [Embed.error('Nạp lại thất bại', `Lỗi trong tệp lệnh:\n\`\`\`\n${String(err.message).slice(0, 500)}\n\`\`\`\nĐã giữ lại phiên bản cũ.`)] });
    }

    if (!fresh || !fresh.name || typeof fresh.run !== 'function') {
      client.commands.set(target.name, target);
      return ctx.reply({ embeds: [Embed.error('Nạp lại thất bại', 'Tệp lệnh không hợp lệ (thiếu name hoặc run). Đã giữ lại phiên bản cũ.')] });
    }

    // Dọn alias cũ (chỉ những alias đang trỏ tới lệnh này)
    for (const a of oldAliases) {
      if (client.aliases.get(a) === target.name) client.aliases.delete(a);
    }
    client.commands.delete(target.name);

    fresh.category = fresh.category || path.basename(path.dirname(file));
    fresh.__file = file;
    client.commands.set(fresh.name, fresh);
    (fresh.aliases || []).forEach((a) => client.aliases.set(String(a).toLowerCase(), fresh.name));

    // Dựng lại bản mô tả slash trong bộ nhớ cho khớp với tệp vừa nạp,
    // tránh tình trạng client.slashData còn giữ mô tả cũ sau khi reload.
    try {
      const buildSlash = require('../../core/slashBuilder');
      const idx = client.slashData.findIndex((d) => d && d.name === target.name);
      if (fresh.slash !== false) {
        const json = buildSlash(fresh).toJSON();
        if (idx >= 0) client.slashData[idx] = json;
        else client.slashData.push(json);
      } else if (idx >= 0) {
        client.slashData.splice(idx, 1);
      }
    } catch (err) {
      client.logger?.warn?.('Không dựng lại được slash sau reload: ' + err.message);
    }

    const embed = Embed.custom(colors.success, '♻️ Đã nạp lại lệnh')
      .setDescription(`Lệnh \`${fresh.name}\` đã được nạp lại từ ổ đĩa.`)
      .setFooter({ text: 'Chỉ cập nhật logic; đổi option slash cần khởi động lại bot' });
    await ctx.reply({ embeds: [embed] });
  },
};
