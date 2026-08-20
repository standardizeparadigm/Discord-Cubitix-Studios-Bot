// =============================================================
//  Lệnh: sellfish - bán cá trong bể cá để lấy xu
//  - Không tham số: mở bảng bán tương tác (chọn độ hiếm / bán tất cả)
//  - Có tham số: bán theo độ hiếm, theo loài (id hoặc tên), theo số lượng
//     Ví dụ:
//       sellfish all              -> bán tất cả
//       sellfish common           -> bán mọi cá thường
//       sellfish common 5         -> bán 5 con cá thường
//       sellfish ca_com           -> bán mọi con "Cá cơm" (theo id)
//       sellfish cá cơm 3         -> bán 3 con Cá cơm (theo tên)
//       sellfish clean            -> bán hết, giữ lại Epic trở lên
// =============================================================
const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const Embed = require('../../core/EmbedFactory');
const { colors, emoji } = require('../../core/palette');
const db = require('../../core/Database');
const fishing = require('../../core/fishing');
const quests = require('../../core/questLogic');

// Bỏ dấu tiếng Việt để so khớp tên loài / độ hiếm dễ hơn
function norm(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

const KEEP_EPIC_PLUS = new Set(['epic', 'mythic', 'legendary', 'fable', 'hidden']);

// Bản đồ từ khoá -> độ hiếm (chấp nhận cả tiếng Anh lẫn tiếng Việt không dấu)
const RARITY_ALIASES = {
  common: 'common', thuong: 'common',
  uncommon: 'uncommon', itgap: 'uncommon',
  rare: 'rare', hiem: 'rare',
  epic: 'epic', suthi: 'epic',
  mythic: 'mythic', thanthoai: 'mythic',
  legendary: 'legendary', huyenthoai: 'legendary',
  fable: 'fable', cotich: 'fable',
  hidden: 'hidden', angiau: 'hidden',
};

// Tính giá trị & số lượng theo độ hiếm
function stats(aquarium) {
  const byRarity = {};
  let totalValue = 0;
  for (const f of aquarium) {
    const sp = fishing.speciesById(f.id);
    const rk = sp ? sp.rarity : 'common';
    if (!byRarity[rk]) byRarity[rk] = { count: 0, value: 0 };
    const v = fishing.valueOf(f);
    byRarity[rk].count += 1;
    byRarity[rk].value += v;
    totalValue += v;
  }
  return { byRarity, totalValue };
}

function overviewEmbed(user, aquarium) {
  const { byRarity, totalValue } = stats(aquarium);
  const lines = Object.values(fishing.RARITIES)
    .sort((a, b) => a.order - b.order)
    .filter((r) => byRarity[r.key])
    .map((r) => `${r.badge} **${r.label}**: ${byRarity[r.key].count} con — ${byRarity[r.key].value.toLocaleString('vi-VN')} xu`);
  return Embed.custom(colors.gold, '🏪 Chợ cá — Bán cá', lines.join('\n') || 'Bể cá trống.')
    .setThumbnail(user.displayAvatarURL())
    .setFooter({ text: `Tổng ${aquarium.length} con • Toàn bộ trị giá ${totalValue.toLocaleString('vi-VN')} xu` });
}

function components(aquarium, disabled = false) {
  const { byRarity } = stats(aquarium);
  const present = Object.values(fishing.RARITIES)
    .sort((a, b) => a.order - b.order)
    .filter((r) => byRarity[r.key]);

  const menu = new StringSelectMenuBuilder()
    .setCustomId('sell_rarity')
    .setPlaceholder('💰 Chọn độ hiếm muốn bán...')
    .setDisabled(disabled || !present.length);
  if (present.length) {
    menu.addOptions(
      present.map((r) => ({
        label: `${r.label} (${byRarity[r.key].count} con)`,
        value: r.key,
        emoji: r.badge,
        description: `Thu ~${byRarity[r.key].value.toLocaleString('vi-VN')} xu`,
      })),
    );
  } else {
    menu.addOptions([{ label: 'Trống', value: 'none' }]);
  }

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('sell_all').setLabel('Bán tất cả').setEmoji('💸').setStyle(ButtonStyle.Success).setDisabled(disabled || !aquarium.length),
    new ButtonBuilder().setCustomId('sell_common').setLabel('Bán cá thường (giữ Epic+)').setEmoji('🧹').setStyle(ButtonStyle.Secondary).setDisabled(disabled || !aquarium.length),
  );
  return [new ActionRowBuilder().addComponents(menu), buttons];
}

// Bán theo bộ lọc, có thể giới hạn số lượng. Trả về { sold, gained, balance }
function sell(userId, filterFn, limit = null) {
  const wallet = db.getWallet(userId);
  const keep = [];
  let sold = 0;
  let gained = 0;
  for (const f of wallet.aquarium) {
    const sp = fishing.speciesById(f.id);
    const rk = sp ? sp.rarity : 'common';
    if ((limit == null || sold < limit) && filterFn(rk, f, sp)) {
      sold += 1;
      gained += fishing.valueOf(f);
    } else {
      keep.push(f);
    }
  }
  wallet.aquarium = keep;
  wallet.balance += gained;
  // Ghi nhận tổng thu nhập từ bán cá (thống kê trọn đời)
  const st = wallet.fishStats || (wallet.fishStats = db.emptyFishStats());
  st.earned = (st.earned || 0) + gained;
  if (gained > 0) quests.track(wallet, 'sellEarned', gained);
  if (sold > 0) quests.track(wallet, 'fishSold', sold);
  db.saveWallet(userId, wallet);
  return { sold, gained, balance: wallet.balance };
}

// Đếm số con khớp bộ lọc trong bể cá
function countMatching(aquarium, filterFn) {
  let n = 0;
  for (const f of aquarium) {
    const sp = fishing.speciesById(f.id);
    const rk = sp ? sp.rarity : 'common';
    if (filterFn(rk, f, sp)) n += 1;
  }
  return n;
}

// Phân tích mục tiêu bán từ chuỗi người dùng nhập
function resolveTarget(raw) {
  const q = norm(raw);
  if (!q) return { kind: 'empty' };
  if (['all', 'tatca', 'toanbo', 'het', '*'].includes(q)) return { kind: 'all' };
  if (['clean', 'dondep', 'giurac', 'rac', 'trash'].includes(q)) return { kind: 'clean' };
  if (RARITY_ALIASES[q]) return { kind: 'rarity', rarity: RARITY_ALIASES[q] };

  // Theo id chính xác
  const byId = fishing.speciesById(q);
  if (byId) return { kind: 'species', species: byId };

  // Theo tên (không dấu) - khớp chính xác trước
  const all = fishing.SPECIES;
  const exact = all.filter((s) => norm(s.name) === q);
  if (exact.length === 1) return { kind: 'species', species: exact[0] };
  if (exact.length > 1) return { kind: 'ambiguous', candidates: exact.slice(0, 12) };

  // Khớp một phần
  const partial = all.filter((s) => norm(s.name).includes(q) || s.id.includes(q));
  if (partial.length === 1) return { kind: 'species', species: partial[0] };
  if (partial.length > 1) return { kind: 'ambiguous', candidates: partial.slice(0, 12) };

  return { kind: 'none' };
}

function soldEmbed(result, extra) {
  return Embed.custom(
    colors.success,
    `${emoji.coin} Đã bán cá`,
    `${extra}\nBán **${result.sold}** con, thu **+${result.gained.toLocaleString('vi-VN')}** xu.\n` +
      `Ví hiện có: **${result.balance.toLocaleString('vi-VN')}** xu.`,
  );
}

module.exports = {
  name: 'sellfish',
  aliases: ['sell', 'banca', 'bancac'],
  category: 'fishing',
  description: 'Bán cá trong bể cá để lấy xu (theo độ hiếm, loài, id hoặc số lượng)',
  usage: '[all | clean | <độ hiếm> | <id/tên loài>] [số lượng]',
  cooldown: 5,
  guildOnly: true,
  slash: true,
  options: [
    { name: 'mục_tiêu', type: 'string', description: 'all, clean, độ hiếm (vd: common) hoặc id/tên loài cá', required: false },
    { name: 'số_lượng', type: 'integer', description: 'Số con muốn bán (bỏ trống = bán toàn bộ loại đã chọn)', required: false },
  ],
  async run(ctx) {
    const wallet = db.getWallet(ctx.author.id);
    if (!wallet.aquarium.length) {
      return ctx.reply({ embeds: [Embed.info('Bể cá trống', 'Bạn chưa có con cá nào để bán. Dùng `fish` để câu cá!')] });
    }

    // ----- Đọc tham số (hỗ trợ cả prefix lẫn slash) -----
    let targetRaw = null;
    let amount = null;
    if (ctx.isSlash) {
      targetRaw = ctx.getString('mục_tiêu');
      amount = ctx.getInteger('số_lượng');
    } else {
      const args = ctx.args.slice();
      if (args.length && /^\d+$/.test(args[args.length - 1])) {
        amount = parseInt(args.pop(), 10);
      }
      targetRaw = args.join(' ').trim() || null;
    }
    if (amount != null && (!Number.isFinite(amount) || amount <= 0)) {
      return ctx.reply({ embeds: [Embed.error('Số lượng không hợp lệ', 'Số lượng phải là một số nguyên dương.')] });
    }

    // ----- Chế độ có tham số: bán trực tiếp -----
    if (targetRaw) {
      const t = resolveTarget(targetRaw);

      if (t.kind === 'ambiguous') {
        const list = t.candidates.map((s) => `${s.emoji} **${s.name}** \`${s.id}\``).join('\n');
        return ctx.reply({
          embeds: [Embed.warn('Tên chưa rõ ràng', `Có nhiều loài khớp với "${targetRaw}". Hãy chọn cụ thể bằng id:\n${list}`)],
        });
      }
      if (t.kind === 'none') {
        return ctx.reply({
          embeds: [
            Embed.error(
              'Không nhận ra mục tiêu',
              `Không tìm thấy "${targetRaw}".\n\n**Cách dùng:**\n` +
                '• `sellfish all` — bán tất cả\n' +
                '• `sellfish clean` — bán hết, giữ lại Epic trở lên\n' +
                '• `sellfish common 5` — bán 5 con cá thường\n' +
                '• `sellfish ca_com` — bán theo id loài\n' +
                '• `sellfish cá cơm 3` — bán 3 con theo tên loài',
            ),
          ],
        });
      }

      let filterFn;
      let label;
      if (t.kind === 'all') {
        filterFn = () => true;
        label = 'Tất cả các loài';
      } else if (t.kind === 'clean') {
        filterFn = (rk) => !KEEP_EPIC_PLUS.has(rk);
        label = 'Cá Sử thi trở xuống (giữ lại Epic+)';
      } else if (t.kind === 'rarity') {
        const meta = fishing.rarityMeta(t.rarity);
        filterFn = (rk) => rk === t.rarity;
        label = `Độ hiếm: ${meta.badge} ${meta.label}`;
      } else {
        const sp = t.species;
        filterFn = (rk, f) => f.id === sp.id;
        label = `Loài: ${sp.emoji} ${sp.name}`;
      }

      const available = countMatching(wallet.aquarium, filterFn);
      if (available === 0) {
        return ctx.reply({ embeds: [Embed.info('Không có con nào phù hợp', `Bể cá của bạn không có con nào thuộc: ${label}.`)] });
      }

      const result = sell(ctx.author.id, filterFn, amount);
      const leftover = available - result.sold;
      const soldNote = amount != null && leftover > 0 ? ` (bán ${result.sold}/${available}, còn ${leftover} con)` : '';
      const w = db.getWallet(ctx.author.id);
      const embed = soldEmbed(result, `🎯 ${label}${soldNote}`).setFooter({ text: `Còn lại ${w.aquarium.length} con trong bể cá` });
      return ctx.reply({ embeds: [embed] });
    }

    // ----- Không tham số: mở bảng bán tương tác -----
    const msg = await ctx.reply({ embeds: [overviewEmbed(ctx.author, wallet.aquarium)], components: components(wallet.aquarium) });
    const collector = msg.createMessageComponentCollector({ time: 90000 });

    const refresh = async (i, result) => {
      const w = db.getWallet(ctx.author.id);
      const note = result
        ? Embed.custom(colors.success, `${emoji.coin} Đã bán cá`, `Bán **${result.sold}** con, thu **+${result.gained.toLocaleString('vi-VN')}** xu.\nVí hiện có: **${result.balance.toLocaleString('vi-VN')}** xu.`)
        : overviewEmbed(ctx.author, w.aquarium);
      if (result) note.setFooter({ text: `Còn lại ${w.aquarium.length} con trong bể cá` });
      await i.update({ embeds: [note], components: components(w.aquarium, w.aquarium.length === 0) });
    };

    collector.on('collect', async (i) => {
      if (i.user.id !== ctx.author.id) {
        return i.reply({ content: `${emoji.error} Đây không phải bể cá của bạn!`, flags: MessageFlags.Ephemeral }).catch(() => {});
      }
      if (i.componentType === ComponentType.StringSelect) {
        const rk = i.values[0];
        if (rk === 'none') return i.deferUpdate();
        const result = sell(ctx.author.id, (r) => r === rk);
        return refresh(i, result);
      }
      if (i.customId === 'sell_all') {
        const result = sell(ctx.author.id, () => true);
        return refresh(i, result);
      }
      if (i.customId === 'sell_common') {
        // Giữ lại epic trở lên (epic, mythic, legendary, fable, hidden)
        const result = sell(ctx.author.id, (r) => !KEEP_EPIC_PLUS.has(r));
        return refresh(i, result);
      }
    });

    collector.on('end', () => {
      const w = db.getWallet(ctx.author.id);
      msg.edit({ components: components(w.aquarium, true) }).catch(() => {});
    });
  },
};
