// =============================================================
//  Lệnh: quest - nhiệm vụ hàng ngày (bản LTS có PHÂN LOẠI)
//  - Nhiệm vụ được chia theo nhóm: Câu cá / Sòng bài / Kinh tế / Trò chơi / Cộng đồng.
//  - Có menu lọc theo nhóm, nút nhận thưởng và nút làm mới.
//  - Mỗi ngày bốc ngẫu nhiên một bộ nhiệm vụ, làm mới lúc 00:00 (giờ VN).
// =============================================================
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ComponentType,
  MessageFlags,
} = require('discord.js');
const Embed = require('../../core/EmbedFactory');
const { colors, emoji } = require('../../core/palette');
const { progressBar } = require('../../core/Animator');
const db = require('../../core/Database');
const quests = require('../../core/questLogic');
const day = require('../../core/dayCycle');

const fmt = (n) => Number(n || 0).toLocaleString('vi-VN');

// Giới hạn an toàn cho phần mô tả embed của Discord (4096 ký tự).
const MAX_DESC = 3900;

function taskLine(wallet, t, now) {
  const p = quests.progressOf(wallet, t, now);
  const pct = t.target > 0 ? Math.min(100, Math.round((p.value / t.target) * 100)) : 0;
  const status = p.claimed
    ? '✅ Đã nhận'
    : p.done
      ? '🎁 Sẵn sàng nhận!'
      : `${fmt(p.value)}/${fmt(t.target)}`;
  return `${t.emoji} **${t.title}**\n \`${t.tierLabel}\` · ${emoji.coin} ${fmt(t.reward)} xu\n ${progressBar(pct)} — ${status}`;
}

function render(wallet, filter = null) {
  const now = Date.now();
  const groups = quests.categoryGroups(wallet, now);
  const shown = filter ? groups.filter((g) => g.key === filter) : groups;
  const allTasks = quests.tasksOf(wallet, now);
  const doneCount = allTasks.filter((t) => quests.progressOf(wallet, t, now).done).length;

  const blocks = [];
  for (const g of shown) {
    const head = `${g.emoji} —— **${g.label.toUpperCase()}** · ${g.doneCount}/${g.total}`;
    const bonusNote = !g.bonusEligible
      ? ''
      : g.bonusClaimed
        ? `\n ✅ Đã nhận thưởng nhóm (+${fmt(g.bonusAmount)} xu)`
        : g.allDone
          ? `\n 🎁 Xong cả nhóm — nhận thêm ${emoji.coin} **${fmt(g.bonusAmount)}** xu!`
          : `\n 💡 Xong cả nhóm để nhận thêm ${emoji.coin} **${fmt(g.bonusAmount)}** xu`;
    const body = g.tasks.map((t) => taskLine(wallet, t, now)).join('\n\n');
    blocks.push(`${head}${bonusNote}\n\n${body}`);
  }

  let desc = blocks.join('\n\n───────────────\n\n') || 'Không có nhiệm vụ nào ở nhóm này.';

  if (!filter) {
    const bonusLine = quests.bonusClaimed(wallet, now)
      ? `✅ Đã nhận thưởng hoàn thành toàn bộ (+${fmt(quests.ALL_DONE_BONUS)} xu)`
      : `🎊 Hoàn thành cả ${allTasks.length} nhiệm vụ để nhận thêm ${emoji.coin} **${fmt(quests.ALL_DONE_BONUS)}** xu`;
    desc += `\n\n───────────────\n${bonusLine}`;
  }

  if (desc.length > MAX_DESC) desc = desc.slice(0, MAX_DESC - 3) + '...';

  const title = filter
    ? `📜 Nhiệm vụ hôm nay · ${shown[0] ? `${shown[0].emoji} ${shown[0].label}` : 'Nhóm'}`
    : '📜 Nhiệm vụ hàng ngày';
  const color = filter && shown[0] ? shown[0].color : colors.info;

  return Embed.custom(color, title, desc).setFooter({
    text: `Đã xong ${doneCount}/${allTasks.length} · Làm mới lúc 00:00 (còn ${day.humanUntilMidnight(now)})`,
  });
}

function components(wallet, filter = null, disabled = false) {
  const now = Date.now();
  const groups = quests.categoryGroups(wallet, now);
  const claimable = quests.hasClaimable(wallet, now, filter);

  const menu = new StringSelectMenuBuilder()
    .setCustomId('q_filter')
    .setPlaceholder('🔎 Lọc nhiệm vụ theo nhóm...')
    .setDisabled(disabled);

  const options = [
    {
      label: 'Tất cả nhóm',
      value: '__all__',
      emoji: '📜',
      description: 'Xem toàn bộ nhiệm vụ hôm nay',
      default: !filter,
    },
  ];
  for (const g of groups) {
    options.push({
      label: `${g.label} (${g.doneCount}/${g.total})`,
      value: g.key,
      emoji: g.emoji,
      description: g.allDone ? 'Đã xong cả nhóm' : `Còn ${g.total - g.doneCount} nhiệm vụ chưa xong`,
      default: filter === g.key,
    });
  }
  menu.addOptions(options.slice(0, 25));

  const claimLabel = filter ? 'Nhận thưởng nhóm này' : 'Nhận thưởng';
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('q_claim')
      .setLabel(claimLabel)
      .setEmoji('🎁')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled || !claimable),
    new ButtonBuilder()
      .setCustomId('q_refresh')
      .setLabel('Làm mới')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
  );

  return [new ActionRowBuilder().addComponents(menu), buttons];
}

module.exports = {
  name: 'quest',
  aliases: ['quests', 'nhiemvu', 'dailyquest'],
  category: 'economy',
  description: 'Xem và nhận thưởng nhiệm vụ hàng ngày (có phân loại)',
  usage: 'quest',
  cooldown: 5,
  guildOnly: true,
  slash: true,
  async run(ctx) {
    const wallet = db.getWallet(ctx.author.id);
    quests.ensureQuestDay(wallet, Date.now());
    db.saveWallet(ctx.author.id, wallet);

    let filter = null;

    const msg = await ctx.reply({
      embeds: [render(wallet, filter)],
      components: components(wallet, filter),
    });

    // Không lấy được tin nhắn thật (hiếm gặp) thì vẫn hiển thị bảng nhiệm vụ,
    // chỉ không gắn được nút bấm — tuyệt đối không để văng lệnh.
    if (!msg || typeof msg.createMessageComponentCollector !== 'function') return;

    const collector = msg.createMessageComponentCollector({ time: 120000 });

    collector.on('collect', async (i) => {
      try {
        if (i.user.id !== ctx.author.id) {
          return await i.reply({
            content: `${emoji.error} Đây không phải nhiệm vụ của bạn!`,
            flags: MessageFlags.Ephemeral,
          });
        }

        const w = db.getWallet(ctx.author.id);

        // --- Chọn nhóm để lọc ---
        if (i.componentType === ComponentType.StringSelect) {
          const picked = i.values && i.values[0];
          filter = !picked || picked === '__all__' ? null : picked;
          return await i.update({ embeds: [render(w, filter)], components: components(w, filter) });
        }

        // --- Nhận thưởng ---
        if (i.customId === 'q_claim') {
          const res = quests.claimAll(w, Date.now(), filter);
          if (res.count > 0 || res.bonus > 0 || res.categories.length > 0) {
            db.saveWallet(ctx.author.id, w);
          } else {
            return await i.update({ embeds: [render(w, filter)], components: components(w, filter) });
          }

          const parts = [];
          if (res.count > 0) parts.push(`${res.count} nhiệm vụ`);
          if (res.categories.length > 0) parts.push(`${res.categories.length} thưởng nhóm`);
          if (res.bonus > 0) parts.push('thưởng hoàn thành toàn bộ');
          const title = `🎁 Nhận +${fmt(res.total)} xu từ ${parts.join(' + ')}!`;

          return await i.update({
            embeds: [render(w, filter).setTitle(title)],
            components: components(w, filter),
          });
        }

        // --- Làm mới ---
        return await i.update({ embeds: [render(w, filter)], components: components(w, filter) });
      } catch {
        return undefined; // tương tác hết hạn hoặc đã được xử lý
      }
    });

    collector.on('end', () => {
      if (typeof msg.edit !== 'function') return;
      const w = db.getWallet(ctx.author.id);
      msg.edit({ components: components(w, filter, true) }).catch(() => {});
    });
  },
};
