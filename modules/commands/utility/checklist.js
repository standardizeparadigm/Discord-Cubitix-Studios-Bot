// =============================================================
//  Lenh: checklist - danh sach viec can lam ca nhan
//  Cu phap: checklist | add <viec> | done <so> | xoa <so> | clear
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { colors, emoji } = require('../../core/palette');
const { progressBar } = require('../../core/Animator');
const store = require('../../core/checklistStore');

function listEmbed(userId, title) {
  const items = store.list(userId);
  if (!items.length) {
    return Embed.custom(colors.info, title || '\ud83d\udccb Checklist c\u1ee7a b\u1ea1n',
      'Danh s\u00e1ch tr\u1ed1ng. Th\u00eam vi\u1ec7c b\u1eb1ng `checklist add <n\u1ed9i dung>`.')
      .setFooter({ text: 'V\u00ed d\u1ee5: checklist add H\u1ecdc b\u00e0i l\u00fac 8h' });
  }
  const done = items.filter((it) => it.done).length;
  const pct = Math.round((done / items.length) * 100);
  const lines = items.map((it, idx) => `\`${String(idx + 1).padStart(2, ' ')}.\` ${it.done ? '\u2705 ~~' + it.text + '~~' : '\u2b1c ' + it.text}`);
  return Embed.custom(done === items.length ? colors.success : colors.info, title || '\ud83d\udccb Checklist c\u1ee7a b\u1ea1n',
    `${lines.join('\n')}\n\n${progressBar(pct)} \u2014 **${done}/${items.length}** ho\u00e0n th\u00e0nh`)
    .setFooter({ text: 'add <vi\u1ec7c> \u00b7 done <s\u1ed1> \u00b7 xoa <s\u1ed1> \u00b7 clear' });
}

module.exports = {
  name: 'checklist',
  aliases: ['todo', 'task', 'vieccanlam', 'cl'],
  category: 'utility',
  description: 'Quản lý danh sách việc cần làm cá nhân',
  usage: 'checklist | add <việc> | done <số> | xoa <số> | clear',
  cooldown: 3,
  slash: true,
  options: [
    { name: 'thao_tac', type: 'string', description: 'add <việc> | done <số> | xoa <số> | clear', required: false, rest: true },
  ],
  async run(ctx) {
    const userId = ctx.author.id;
    const raw = (ctx.getString('thao_tac') || '').trim();
    if (!raw) {
      return ctx.reply({ embeds: [listEmbed(userId)] });
    }
    const sp = raw.indexOf(' ');
    const action = (sp === -1 ? raw : raw.slice(0, sp)).toLowerCase();
    const rest = sp === -1 ? '' : raw.slice(sp + 1).trim();

    if (['add', 'them', 'themviec', '+'].includes(action)) {
      if (!rest) return ctx.reply({ embeds: [Embed.warn('Thi\u1ebfu n\u1ed9i dung', 'D\u00f9ng `checklist add <n\u1ed9i dung vi\u1ec7c>`.')] });
      const res = store.add(userId, rest);
      if (!res.ok) {
        if (res.reason === 'full') return ctx.reply({ embeds: [Embed.error('Danh s\u00e1ch \u0111\u1ea7y', `T\u1ed1i \u0111a **${res.max}** vi\u1ec7c. H\u00e3y xo\u00e1 b\u1edbt tr\u01b0\u1edbc.`)] });
        return ctx.reply({ embeds: [Embed.warn('N\u1ed9i dung tr\u1ed1ng', 'H\u00e3y nh\u1eadp n\u1ed9i dung vi\u1ec7c c\u1ea7n th\u00eam.')] });
      }
      return ctx.reply({ embeds: [listEmbed(userId, `${emoji.success} \u0110\u00e3 th\u00eam vi\u1ec7c m\u1edbi`)] });
    }

    if (['done', 'xong', 'check', 'tick'].includes(action)) {
      const n = parseInt(rest, 10);
      if (Number.isNaN(n)) return ctx.reply({ embeds: [Embed.warn('Thi\u1ebfu s\u1ed1 th\u1ee9 t\u1ef1', 'D\u00f9ng `checklist done <s\u1ed1>`.')] });
      const res = store.toggle(userId, n - 1);
      if (!res.ok) return ctx.reply({ embeds: [Embed.error('Sai s\u1ed1 th\u1ee9 t\u1ef1', 'Kh\u00f4ng c\u00f3 vi\u1ec7c \u1edf v\u1ecb tr\u00ed \u0111\u00f3.')] });
      const title = res.item.done ? `${emoji.success} \u0110\u00e3 \u0111\u00e1nh d\u1ea5u ho\u00e0n th\u00e0nh` : '\u21a9\ufe0f \u0110\u00e3 b\u1ecf \u0111\u00e1nh d\u1ea5u';
      return ctx.reply({ embeds: [listEmbed(userId, title)] });
    }

    if (['xoa', 'remove', 'del', 'delete', '-'].includes(action)) {
      const n = parseInt(rest, 10);
      if (Number.isNaN(n)) return ctx.reply({ embeds: [Embed.warn('Thi\u1ebfu s\u1ed1 th\u1ee9 t\u1ef1', 'D\u00f9ng `checklist xoa <s\u1ed1>`.')] });
      const res = store.remove(userId, n - 1);
      if (!res.ok) return ctx.reply({ embeds: [Embed.error('Sai s\u1ed1 th\u1ee9 t\u1ef1', 'Kh\u00f4ng c\u00f3 vi\u1ec7c \u1edf v\u1ecb tr\u00ed \u0111\u00f3.')] });
      return ctx.reply({ embeds: [listEmbed(userId, '\ud83d\uddd1\ufe0f \u0110\u00e3 xo\u00e1 vi\u1ec7c')] });
    }

    if (['clear', 'xoahet', 'reset'].includes(action)) {
      store.clear(userId);
      return ctx.reply({ embeds: [Embed.custom(colors.warning, '\ud83e\uddf9 \u0110\u00e3 xo\u00e1 to\u00e0n b\u1ed9', 'Checklist c\u1ee7a b\u1ea1n gi\u1edd tr\u1ed1ng tr\u01a1n.')] });
    }

    // Kh\u00f4ng r\u00f5 thao t\u00e1c \u2192 coi nh\u01b0 th\u00eam nhanh
    const res = store.add(userId, raw);
    if (!res.ok && res.reason === 'full') return ctx.reply({ embeds: [Embed.error('Danh s\u00e1ch \u0111\u1ea7y', `T\u1ed1i \u0111a **${res.max}** vi\u1ec7c.`)] });
    return ctx.reply({ embeds: [listEmbed(userId, `${emoji.success} \u0110\u00e3 th\u00eam vi\u1ec7c m\u1edbi`)] });
  },
};
