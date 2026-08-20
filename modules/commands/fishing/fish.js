// =============================================================
//  Lệnh: fish - đi câu cá (mất 5 xu mỗi lần)
//  - Cá câu được KHÔNG tự động bán, mà lưu vào bể cá (aquarium)
//  - Muốn câu lại phải gõ lại lệnh (có cooldown chống spam)
//  - legendary / fable / hidden có hiệu ứng "emoji động"
// =============================================================
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const Embed = require('../../core/EmbedFactory');
const { colors, emoji } = require('../../core/palette');
const { sleep, progressBar } = require('../../core/Animator');
const db = require('../../core/Database');
const fishing = require('../../core/fishing');
const quests = require('../../core/questLogic');

const { FISH_COST } = fishing;

// Độ hiếm tính là "cá hiếm" cho nhiệm vụ hàng ngày.
const RARE_KEYS = new Set(['rare', 'epic', 'mythic', 'legendary', 'fable', 'hidden']);
// Nhiệm vụ "Sử thi trở lên": chỉ tính từ bậc epic trở lên (khó hơn rareFish).
const EPIC_KEYS = new Set(['epic', 'mythic', 'legendary', 'fable', 'hidden']);

// Giới hạn số cá giữ trong bể. Bỏ trống giới hạn thì một người câu suốt nhiều tháng
// sẽ làm file dữ liệu phình to, mọi lệnh đối với ví đều chậm theo. 1000 con là rất rộng rãi;
// khi đầy thì chỉ cần bán bớt (không mất gì, cũng không bị trừ phí thả cần).
const MAX_AQUARIUM = 1000;

// Chỉ còn 1 nút: xem bể cá. Muốn câu lại thì gõ lại lệnh.
function tankRow(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('fish_tank').setLabel('Xem bể cá').setEmoji('🐠').setStyle(ButtonStyle.Primary).setDisabled(disabled),
  );
}

// Thực hiện một lần câu: trừ phí, bốc cá, lưu aquarium, diễn hoạt.
async function doCatch(userId, editFn) {
  let wallet = db.getWallet(userId);

  // Kiểm tra đủ xu trả phí thả cần
  if (wallet.balance < FISH_COST) {
    await editFn({
      embeds: [Embed.error('Không đủ xu thả cần', `Cần **${FISH_COST}** xu để câu một lần. Hãy dùng \`daily\`, \`work\` hoặc chơi cờ bạc để kiếm thêm.`)],
      components: [],
    });
    return false;
  }

  // Bể cá đầy: dừng trước khi trừ phí để người chơi không mất xu oan.
  if (Array.isArray(wallet.aquarium) && wallet.aquarium.length >= MAX_AQUARIUM) {
    await editFn({
      embeds: [
        Embed.error(
          'Bể cá đã đầy',
          `Bể của bạn đang có **${wallet.aquarium.length}** con (tối đa **${MAX_AQUARIUM}**).\n` +
            'Hãy dùng `sellfish` để bán bớt rồi câu tiếp. Bạn **không** bị trừ phí lần này.',
        ),
      ],
      components: [],
    });
    return false;
  }

  // Trừ phí câu
  wallet.balance -= FISH_COST;
  db.saveWallet(userId, wallet);

  // Hiệu ứng thả cần (thanh tiến trình + phao câu)
  const castFrames = [
    { p: 15, rod: '🎣〰️〰️〰️', note: 'Đang thả cần xuống nước...' },
    { p: 55, rod: '🎣〰️〰️🔴', note: 'Chờ cá cắn câu...' },
    { p: 90, rod: '🎣〰️〰️‼️', note: 'Có động tĩnh!' },
  ];
  for (const fr of castFrames) {
    await editFn({
      embeds: [Embed.custom(colors.info, '🎣 Đi câu cá', `${fr.rod}\n\n${fr.note}\n${progressBar(fr.p)}  \`-${FISH_COST} xu\``)],
      components: [],
    });
    await sleep(700);
  }

  // Bốc cá
  const c = fishing.pickCatch();
  // QUAN TRỌNG (chống nhân xu): phần hoạt ảnh phía trên mất ~2,1 giây.
  // Trong khoảng thời gian đó người chơi có thể đã tiêu hoặc nhận xu bằng lệnh khác.
  // Nếu ghi đè bằng đối tượng ví CŨ (đọc từ trước hoạt ảnh) thì mọi thay đổi đó
  // sẽ bị xoá — tiền thua cờ bạc sẽ được hoàn lại (lạm phát) và tiền được tặng sẽ biến mất.
  // Vì vậy bắt buộc phải ĐỌC LẠI ví ngay trước khi ghi.
  wallet = db.getWallet(userId);
  wallet.aquarium.push({ id: c.species.id, value: c.value, caughtAt: Date.now() });

  // Cập nhật thống kê câu cá trọn đời
  const st = wallet.fishStats || (wallet.fishStats = db.emptyFishStats());
  st.caught = (st.caught || 0) + 1;
  st.spent = (st.spent || 0) + FISH_COST;
  st.discovered[c.species.id] = (st.discovered[c.species.id] || 0) + 1;
  st.byRarity[c.rarityKey] = (st.byRarity[c.rarityKey] || 0) + 1;
  if (!st.best || c.value > (st.best.value || 0)) st.best = { id: c.species.id, value: c.value };
  const isNewSpecies = st.discovered[c.species.id] === 1;

  // Ghi nhận tiến độ nhiệm vụ hàng ngày
  quests.track(wallet, 'fish', 1);
  quests.track(wallet, 'fishValue', c.value);
  if (RARE_KEYS.has(c.rarityKey)) quests.track(wallet, 'rareFish', 1);
  if (EPIC_KEYS.has(c.rarityKey)) quests.track(wallet, 'epicFish', 1);
  if (isNewSpecies) quests.track(wallet, 'fishNew', 1);
  db.saveWallet(userId, wallet);

  // Khoảnh khắc "cắn câu!"
  await editFn({
    embeds: [Embed.custom(colors.warning, '🎣 CẮN CÂU!', `${emoji.sparkles} Một thứ gì đó đang kéo cần... kéo lên nào!`)],
    components: [],
  });
  await sleep(650);

  // Diễn hoạt "emoji động" cho cá cực hiếm
  const frames = fishing.animationFrames(c.species, c.rarityKey);
  if (frames) {
    for (const fr of frames) {
      await editFn({
        embeds: [Embed.custom(fr.color, '🎣 Có gì đó cắn câu...', fr.text)],
        components: [],
      });
      await sleep(650);
    }
  }

  // Kết quả cuối cùng
  const total = wallet.aquarium.length;
  const brag = c.rarity.order >= 6 ? `\n\n${emoji.sparkles} **Quá hiếm!** Xin chúc mừng chiến lợi phẩm cực hiếm này!` : '';
  const newTag = isNewSpecies ? `\n🆕 **Loài mới!** Đã thêm vào Fishdex của bạn.` : '';
  const line =
    `${c.rarity.badge} Bạn câu được ${c.species.emoji} **${c.species.name}**!\n` +
    `Độ hiếm: **${c.rarity.label}** • Giá bán: **${c.value.toLocaleString('vi-VN')}** xu\n\n` +
    `🐟 Cá đã được đưa vào **bể cá** (không tự động bán).\n` +
    `Dùng \`aquarium\` để xem, \`sellfish\` để bán cá.${brag}${newTag}`;
  const embed = Embed.custom(c.rarity.color, '🎣 Kết quả câu cá', line).setFooter({
    text: `Ví: ${wallet.balance.toLocaleString('vi-VN')} xu • Bể cá: ${total} con • Gõ fish để câu tiếp`,
  });
  await editFn({ embeds: [embed], components: [tankRow(false)] });
  return true;
}

module.exports = {
  name: 'fish',
  aliases: ['cauca', 'cau'],
  category: 'fishing',
  description: `Đi câu cá (mất ${FISH_COST} xu/lần, cá lưu vào bể cá)`,
  usage: '',
  cooldown: 8, // chống spam: 8 giây mỗi lần câu
  guildOnly: true,
  slash: true,
  async run(ctx) {
    const msg = await ctx.reply({
      embeds: [Embed.custom(colors.info, '🎣 Đi câu cá', `${emoji.loading} Chuẩn bị cần câu...`)],
      components: [],
    });
    const editFn = (p) => (ctx.isSlash ? ctx.interaction.editReply(p) : msg.edit(p));
    const caught = await doCatch(ctx.author.id, editFn);
    if (!caught) return; // không đủ xu -> không gắn nút

    // Nút duy nhất: xem bể cá (ephemeral). Muốn câu lại thì gõ lại lệnh.
    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 120000 });
    collector.on('collect', async (i) => {
      if (i.user.id !== ctx.author.id) {
        return i.reply({ content: `${emoji.error} Đây không phải bể cá của bạn!`, flags: MessageFlags.Ephemeral }).catch(() => {});
      }
      const wallet = db.getWallet(ctx.author.id);
      return i.reply({ embeds: [summarizeTank(wallet.aquarium)], flags: MessageFlags.Ephemeral }).catch(() => {});
    });
    collector.on('end', () => {
      editFn({ components: [tankRow(true)] }).catch(() => {});
    });
  },
};

// Tóm tắt nhanh bể cá (dùng cho nút "Xem bể cá")
function summarizeTank(aquarium) {
  if (!aquarium || !aquarium.length) {
    return Embed.info('Bể cá trống', 'Bạn chưa câu được con cá nào. Dùng `fish` để bắt đầu!');
  }
  const totalValue = aquarium.reduce((a, f) => a + fishing.valueOf(f), 0);
  // Đếm theo độ hiếm
  const byRarity = {};
  for (const f of aquarium) {
    const sp = fishing.speciesById(f.id);
    const rk = sp ? sp.rarity : 'common';
    byRarity[rk] = (byRarity[rk] || 0) + 1;
  }
  const lines = Object.values(fishing.RARITIES)
    .sort((a, b) => a.order - b.order)
    .filter((r) => byRarity[r.key])
    .map((r) => `${r.badge} **${r.label}**: ${byRarity[r.key]} con`);
  return Embed.custom(colors.aqua, '🐠 Bể cá của bạn', lines.join('\n')).setFooter({
    text: `Tổng ${aquarium.length} con • Giá trị ~${totalValue.toLocaleString('vi-VN')} xu • Dùng sellfish để bán`,
  });
}
