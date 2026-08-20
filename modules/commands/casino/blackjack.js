// =============================================================
//  Lệnh: blackjack (xì dách) - đánh bài với nhà cái, có đặt cược
//  Tương tác bằng nút: Rút bài / Dừng
// =============================================================
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const Embed = require('../../core/EmbedFactory');
const { colors, emoji } = require('../../core/palette');
const db = require('../../core/Database');
const quests = require('../../core/questLogic');
const gambling = require('../../core/gambling');
const rng = require('../../core/secureRandom');

const SUITS = ['♠️', '♥️', '♦️', '♣️'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function newDeck() {
  const deck = [];
  for (const s of SUITS) for (const r of RANKS) deck.push({ r, s });
  // Trộn bài (Fisher-Yates)
  for (let i = deck.length - 1; i > 0; i--) {
    const j = rng.randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function handValue(cards) {
  let sum = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.r === 'A') { aces++; sum += 11; }
    else if (['J', 'Q', 'K'].includes(c.r)) sum += 10;
    else sum += Number(c.r);
  }
  while (sum > 21 && aces > 0) { sum -= 10; aces--; }
  return sum;
}

function showHand(cards, hideSecond = false) {
  if (hideSecond) return `${cards[0].r}${cards[0].s}  🂠`;
  return cards.map((c) => `${c.r}${c.s}`).join('  ');
}

function row(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('bj_hit').setLabel('Rút bài').setEmoji('🃏').setStyle(ButtonStyle.Primary).setDisabled(disabled),
    new ButtonBuilder().setCustomId('bj_stand').setLabel('Dừng').setEmoji('✋').setStyle(ButtonStyle.Success).setDisabled(disabled),
  );
}

module.exports = {
  name: 'blackjack',
  aliases: ['bj', 'xidach'],
  category: 'casino',
  description: 'Chơi xì dách (blackjack) với nhà cái, có đặt cược',
  usage: '<số xu cược | all>',
  cooldown: 8,
  guildOnly: true,
  slash: true,
  options: [{ name: 'tiền_cược', type: 'string', description: "Số xu đặt cược (hoặc 'all')", required: true, rest: true }],
  async run(ctx) {
    const wallet = db.getWallet(ctx.author.id);
    const r = gambling.resolveBet(ctx.getString('tiền_cược'), wallet.balance);
    if (!r.ok) {
      if (r.reason === 'over') return ctx.reply({ embeds: [Embed.error('Cược quá lớn', `Tối đa **${r.max.toLocaleString('vi-VN')}** xu mỗi ván.`)] });
      if (r.reason === 'insufficient') return ctx.reply({ embeds: [Embed.error('Không đủ xu', `Ví bạn chỉ có **${wallet.balance.toLocaleString('vi-VN')}** xu.`)] });
      return ctx.reply({ embeds: [Embed.error('Tiền cược không hợp lệ', "Hãy nhập số xu dương hoặc `all` (tối đa 250.000).")] });
    }
    const bet = r.bet;
    const cappedNote = r.capped ? '⚠️ Đã giới hạn cược ở mức tối đa **250.000** xu.' : '';

    // Trừ tiền cược ngay
    wallet.balance -= bet;
    db.saveWallet(ctx.author.id, wallet);

    const deck = newDeck();
    const player = [deck.pop(), deck.pop()];
    const dealer = [deck.pop(), deck.pop()];

    const settle = (outcome) => {
      // outcome: 'win' | 'lose' | 'push' | 'blackjack'
      const w = db.getWallet(ctx.author.id);
      let gain = 0;
      if (outcome === 'win') gain = bet * 2;
      else if (outcome === 'blackjack') gain = Math.floor(bet * 2.5);
      else if (outcome === 'push') gain = bet;
      w.balance += gain;
      quests.track(w, 'gamble', 1);
      quests.track(w, 'blackjackPlay', 1);
      quests.track(w, 'betAmount', bet);
      if (outcome === 'win' || outcome === 'blackjack') quests.track(w, 'gambleWin', 1);
      if (gain > bet) quests.track(w, 'gambleProfit', gain - bet);
      db.saveWallet(ctx.author.id, w);
      return { balance: w.balance, net: gain - bet };
    };

    const buildEmbed = (title, color, { reveal = false, note = '' } = {}) => {
      const pv = handValue(player);
      const dv = reveal ? handValue(dealer) : handValue([dealer[0]]);
      const e = Embed.custom(color, `🃏 ${title}`)
        .addFields(
          { name: `🧑 Bài của bạn (${pv})`, value: showHand(player), inline: false },
          { name: reveal ? `🏠 Nhà cái (${dv})` : '🏠 Nhà cái (?)', value: showHand(dealer, !reveal), inline: false },
        )
        .setFooter({ text: `Đặt cược: ${bet.toLocaleString('vi-VN')} xu` });
      if (note) e.setDescription(note);
      return e;
    };

    // Kiểm tra blackjack ngay khi chia bài
    const playerBJ = handValue(player) === 21;
    const dealerBJ = handValue(dealer) === 21;
    if (playerBJ || dealerBJ) {
      let outcome;
      let title;
      let color;
      if (playerBJ && dealerBJ) { outcome = 'push'; title = 'Hòa - cả hai Blackjack'; color = colors.warning; }
      else if (playerBJ) { outcome = 'blackjack'; title = 'BLACKJACK! Bạn thắng 🎉'; color = colors.gold; }
      else { outcome = 'lose'; title = 'Nhà cái Blackjack - bạn thua'; color = colors.error; }
      const { balance, net } = settle(outcome);
      const e = buildEmbed(title, color, { reveal: true, note: `**${net >= 0 ? '+' : ''}${net.toLocaleString('vi-VN')}** xu • Số dư: **${balance.toLocaleString('vi-VN')}** xu` });
      return ctx.reply({ embeds: [e], components: [row(true)] });
    }

    const msg = await ctx.reply({
      embeds: [buildEmbed('Xì dách', colors.primary, { note: `${cappedNote ? cappedNote + '\n' : ''}Rút thêm bài hay dừng lại?` })],
      components: [row(false)],
    });

    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 90000 });
    let finished = false;

    const finish = async (i, outcome, title, color) => {
      finished = true;
      const { balance, net } = settle(outcome);
      const e = buildEmbed(title, color, { reveal: true, note: `**${net >= 0 ? '+' : ''}${net.toLocaleString('vi-VN')}** xu • Số dư: **${balance.toLocaleString('vi-VN')}** xu` });
      await i.update({ embeds: [e], components: [row(true)] });
      collector.stop();
    };

    collector.on('collect', async (i) => {
      if (i.user.id !== ctx.author.id) {
        return i.reply({ content: `${emoji.error} Đây không phải ván của bạn!`, flags: MessageFlags.Ephemeral }).catch(() => {});
      }
      // Chống bấm nhanh 2 lần: nếu ván đã xử lý xong thì bỏ qua (tránh trả thưởng 2 lần → lạm phát xu).
      if (finished) return i.deferUpdate();

      if (i.customId === 'bj_hit') {
        player.push(deck.pop());
        const pv = handValue(player);
        if (pv > 21) return finish(i, 'lose', `Quát (${pv})! Bạn thua`, colors.error);
        // Đủ 21 điểm -> tự động dừng (rơi xuống phần nhà cái rút bài bên dưới)
        if (pv < 21) {
          return i.update({ embeds: [buildEmbed('Xì dách', colors.primary, { note: `Bạn đang có **${pv}** điểm. Rút tiếp hay dừng?` })], components: [row(false)] });
        }
      }

      // Dừng (hoặc vừa đủ 21): nhà cái rút tới khi >= 17
      while (handValue(dealer) < 17) dealer.push(deck.pop());
      const pv = handValue(player);
      const dv = handValue(dealer);
      if (dv > 21 || pv > dv) return finish(i, 'win', `Bạn THẮNG! (${pv} vs ${dv})`, colors.success);
      if (pv === dv) return finish(i, 'push', `HÒA (${pv} vs ${dv})`, colors.warning);
      return finish(i, 'lose', `Bạn THUA (${pv} vs ${dv})`, colors.error);
    });

    collector.on('end', async () => {
      if (finished) return;
      finished = true;
      // Hết giờ mà chưa hành động -> tự động DỪNG (nhà cái rút bài) và phân định thắng thua.
      // KHÔNG hoàn cược: nếu hoàn cược, người chơi có thể cố tình bỏ những ván xấu
      // để né thua (lỗ hổng gây lạm phát xu). Tự dừng là cách xử lý công bằng.
      while (handValue(dealer) < 17) dealer.push(deck.pop());
      const pv = handValue(player);
      const dv = handValue(dealer);
      let outcome; let title; let color;
      if (dv > 21 || pv > dv) { outcome = 'win'; title = `Hết giờ — tự dừng · Bạn THẮNG (${pv} vs ${dv})`; color = colors.success; }
      else if (pv === dv) { outcome = 'push'; title = `Hết giờ — tự dừng · HÒA (${pv} vs ${dv})`; color = colors.warning; }
      else { outcome = 'lose'; title = `Hết giờ — tự dừng · Bạn THUA (${pv} vs ${dv})`; color = colors.error; }
      const { balance, net } = settle(outcome);
      const e = buildEmbed(title, color, { reveal: true, note: `**${net >= 0 ? '+' : ''}${net.toLocaleString('vi-VN')}** xu • Số dư: **${balance.toLocaleString('vi-VN')}** xu` });
      msg.edit({ embeds: [e], components: [row(true)] }).catch(() => {});
    });
  },
};
