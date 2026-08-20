// =============================================================
//  Lệnh: tictactoe - cờ caro 3x3 với bot (nút bấm)
// =============================================================
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const Embed = require('../../core/EmbedFactory');
const { colors } = require('../../core/palette');
const rng = require('../../core/secureRandom');
const db = require('../../core/Database');
const quests = require('../../core/questLogic');

const EMPTY = 0, PLAYER = 1, BOT = 2;

// Ghi nhận tiến độ nhiệm vụ một cách an toàn (không bao giờ làm văng ván cờ).
function trackQuest(userId, counters) {
  try {
    const w = db.getWallet(userId);
    for (const [key, value] of Object.entries(counters)) quests.track(w, key, value);
    db.saveWallet(userId, w);
  } catch { /* bỏ qua */ }
}

function winner(b) {
  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (const [a, c, d] of lines) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  return b.every((x) => x !== EMPTY) ? 'draw' : null;
}

function botMove(b) {
  // Thắng nếu có thể
  for (let i = 0; i < 9; i++) if (b[i] === EMPTY) { b[i] = BOT; if (winner(b) === BOT) return; b[i] = EMPTY; }
  // Chặn người chơi
  for (let i = 0; i < 9; i++) if (b[i] === EMPTY) { b[i] = PLAYER; if (winner(b) === PLAYER) { b[i] = BOT; return; } b[i] = EMPTY; }
  // Ưu tiên trung tâm
  if (b[4] === EMPTY) { b[4] = BOT; return; }
  const free = b.map((v, i) => (v === EMPTY ? i : -1)).filter((i) => i >= 0);
  if (free.length) b[free[rng.randomInt(free.length)]] = BOT;
}

function render(b, disabled = false) {
  const rows = [];
  for (let r = 0; r < 3; r++) {
    const row = new ActionRowBuilder();
    for (let c = 0; c < 3; c++) {
      const i = r * 3 + c;
      const val = b[i];
      const btn = new ButtonBuilder()
        .setCustomId('ttt_' + i)
        .setStyle(val === PLAYER ? ButtonStyle.Success : val === BOT ? ButtonStyle.Danger : ButtonStyle.Secondary)
        .setDisabled(disabled || val !== EMPTY)
        .setLabel(val === PLAYER ? 'X' : val === BOT ? 'O' : '\u200b');
      row.addComponents(btn);
    }
    rows.push(row);
  }
  return rows;
}

module.exports = {
  name: 'tictactoe',
  aliases: ['ttt', 'cocaro', 'caro'],
  category: 'games',
  description: 'Chơi cờ caro (X-O) 3x3 với bot',
  cooldown: 10,
  guildOnly: true,
  slash: true,
  async run(ctx) {
    const board = new Array(9).fill(EMPTY);
    // Ghi nhận nhiệm vụ: đã chơi một ván cờ caro
    trackQuest(ctx.author.id, { game: 1, tttPlay: 1 });
    const msg = await ctx.reply({
      embeds: [Embed.custom(colors.primary, '❌⭕ Cờ Caro', `${ctx.author}, bạn là **X**. Nhấn ô để đánh!`)],
      components: render(board),
    });

    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 120000 });

    collector.on('collect', async (i) => {
      if (i.user.id !== ctx.author.id) {
        return i.reply({ content: 'Đây không phải ván cờ của bạn!', flags: MessageFlags.Ephemeral }).catch(() => {});
      }
      const idx = parseInt(i.customId.split('_')[1], 10);
      if (!Number.isInteger(idx) || idx < 0 || idx >= board.length) return i.deferUpdate().catch(() => {});
      if (board[idx] !== EMPTY) return i.deferUpdate().catch(() => {});
      board[idx] = PLAYER;

      let result = winner(board);
      if (!result) { botMove(board); result = winner(board); }

      if (result) {
        if (result === PLAYER) trackQuest(ctx.author.id, { tttWin: 1 });
        const text = result === PLAYER ? '🎉 Bạn THẮNG!' : result === BOT ? '🤖 Bot THẮNG!' : '🤝 HÒA!';
        const color = result === PLAYER ? colors.success : result === BOT ? colors.error : colors.warning;
        const donePayload = { embeds: [Embed.custom(color, '❌⭕ Cờ Caro', text)], components: render(board, true) };
        await i.update(donePayload).catch(() => msg.edit(donePayload).catch(() => {}));
        return collector.stop();
      }
      const nextPayload = { embeds: [Embed.custom(colors.primary, '❌⭕ Cờ Caro', `${ctx.author}, đến lượt bạn (X)!`)], components: render(board) };
      await i.update(nextPayload).catch(() => msg.edit(nextPayload).catch(() => {}));
    });

    collector.on('end', (_c, reason) => {
      if (reason === 'time') msg.edit({ components: render(board, true) }).catch(() => {});
    });
  },
};
