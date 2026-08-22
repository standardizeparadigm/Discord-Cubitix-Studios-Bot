// =============================================================
//  aquariumView - dựng giao diện BỂ CÁ CHIA TRANG (mới ở LTS v3.1.4)
//
//  Tại sao cần file này?
//  Một embed của Discord chỉ chứa được tối đa 25 ô và 6000 ký tự. Người
//  chơi câu lâu có thể sở hữu hàng trăm loài khác nhau -> bản cũ phải
//  "rút gọn" danh sách và người chơi KHÔNG bao giờ xem được hết bể cá.
//  File này chia bể cá thành nhiều trang, kèm bộ lọc độ hiếm và kiểu sắp xếp.
//
//  Dùng chung cho lệnh `aquarium` và nút "Xem bể cá" của lệnh `fish`
//  để hai chỗ luôn hiển thị giống nhau.
// =============================================================
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const Embed = require('./EmbedFactory');
const { colors, emoji } = require('./palette');
const fishing = require('./fishing');
const page = require('./boardPage');
const ui = require('./boardUI');

// Mỗi trang hiển thị bao nhiêu LOÀI (dùng chung PAGE_SIZE với bảng xếp hạng).
const PAGE_SIZE = page.PAGE_SIZE;

// Các kiểu sắp xếp cho phép chọn trong menu thả xuống.
const SORTS = [
  { key: 'rarity', label: 'Độ hiếm (cao → thấp)', emoji: '🏅' },
  { key: 'count', label: 'Số lượng (nhiều → ít)', emoji: '🔢' },
  { key: 'value', label: 'Giá trị (cao → thấp)', emoji: '🪙' },
  { key: 'name', label: 'Tên loài (A → Z)', emoji: '🔤' },
];
const SORT_KEYS = SORTS.map((s) => s.key);

function num(v) {
  return Number(v || 0).toLocaleString('vi-VN');
}

// -------------------------------------------------------------
//  Gộp bể cá thành danh sách LOÀI (mỗi loài một dòng)
//  Trả về: [{ id, name, emoji, rarityKey, rarity, order, count, value, unit }]
// -------------------------------------------------------------
function groupFish(aquarium) {
  const list = Array.isArray(aquarium) ? aquarium : [];
  const map = new Map();
  for (const f of list) {
    if (!f || !f.id) continue;
    const sp = fishing.speciesById(f.id);
    const rarityKey = sp ? sp.rarity : 'common';
    const unit = fishing.valueOf(f);
    let entry = map.get(f.id);
    if (!entry) {
      const meta = fishing.rarityMeta(rarityKey);
      entry = {
        id: f.id,
        name: sp ? sp.name : 'Loài không rõ',
        emoji: sp ? sp.emoji : '❓',
        rarityKey,
        rarity: meta,
        order: meta ? meta.order : 0,
        count: 0,
        value: 0,
        unit,
      };
      map.set(f.id, entry);
    }
    entry.count += 1;
    entry.value += unit;
  }
  return Array.from(map.values());
}

// Tổng hợp theo độ hiếm (dùng cho phần tóm tắt và bộ lọc)
function rarityTotals(entries) {
  const out = {};
  for (const e of entries) {
    if (!out[e.rarityKey]) out[e.rarityKey] = { count: 0, species: 0, value: 0 };
    out[e.rarityKey].count += e.count;
    out[e.rarityKey].species += 1;
    out[e.rarityKey].value += e.value;
  }
  return out;
}

function filterEntries(entries, filter) {
  if (!filter || filter === 'all') return entries.slice();
  return entries.filter((e) => e.rarityKey === filter);
}

function sortEntries(entries, sortKey) {
  const arr = entries.slice();
  const byName = (a, b) => String(a.name).localeCompare(String(b.name), 'vi');
  if (sortKey === 'count') arr.sort((a, b) => b.count - a.count || b.order - a.order || byName(a, b));
  else if (sortKey === 'value') arr.sort((a, b) => b.value - a.value || b.count - a.count || byName(a, b));
  else if (sortKey === 'name') arr.sort(byName);
  else arr.sort((a, b) => b.order - a.order || b.value - a.value || byName(a, b));
  return arr;
}

function safeFilter(filter) {
  const f = String(filter || 'all');
  if (f === 'all') return 'all';
  return fishing.RARITIES[f] ? f : 'all';
}

function safeSort(sortKey) {
  const s = String(sortKey || 'rarity');
  return SORT_KEYS.includes(s) ? s : 'rarity';
}

// -------------------------------------------------------------
//  Một dòng trong danh sách
// -------------------------------------------------------------
function lineOf(entry, index) {
  const badge = entry.rarity ? entry.rarity.badge : '';
  return (
    `\`${String(index).padStart(3, ' ')}.\` ${entry.emoji} **${entry.name}** ${badge}\n` +
    `  × **${num(entry.count)}** con • ${num(entry.value)} xu`
  );
}

// -------------------------------------------------------------
//  Embed tóm tắt nhanh (dùng cho nút "Xem bể cá" của lệnh fish)
// -------------------------------------------------------------
function summaryEmbed(aquarium, opts = {}) {
  const list = Array.isArray(aquarium) ? aquarium : [];
  if (!list.length) {
    return Embed.info('Bể cá trống', 'Bạn chưa câu được con cá nào. Dùng `fish` để bắt đầu!');
  }
  const entries = groupFish(list);
  const totals = rarityTotals(entries);
  const totalValue = entries.reduce((a, e) => a + e.value, 0);
  const lines = Object.values(fishing.RARITIES)
    .sort((a, b) => b.order - a.order)
    .filter((r) => totals[r.key])
    .map((r) => `${r.badge} **${r.label}**: ${num(totals[r.key].count)} con • ${num(totals[r.key].species)} loài`);
  return Embed.custom(colors.aqua, `🐠 Bể cá của ${opts.name || 'bạn'}`, lines.join('\n')).setFooter({
    text:
      `Tổng ${num(list.length)} con • ${num(entries.length)} loài • Giá trị ~${num(totalValue)} xu\n` +
      `Dùng ${opts.prefix || ''}aquarium để xem chi tiết theo trang • sellfish để bán`,
  });
}

// -------------------------------------------------------------
//  Hàng chọn ĐỘ HIẾM
// -------------------------------------------------------------
function filterRow(prefix, entries, filter, disabled = false) {
  const totals = rarityTotals(entries);
  const totalCount = entries.reduce((a, e) => a + e.count, 0);
  const options = [
    {
      label: `Tất cả độ hiếm`.slice(0, 100),
      value: 'all',
      description: `${num(totalCount)} con • ${num(entries.length)} loài`.slice(0, 100),
      emoji: '🌍',
      default: filter === 'all',
    },
  ];
  for (const r of Object.values(fishing.RARITIES).sort((a, b) => b.order - a.order)) {
    const t = totals[r.key];
    if (!t) continue;
    options.push({
      label: String(r.label).slice(0, 100),
      value: r.key,
      description: `${num(t.count)} con • ${num(t.species)} loài • ${num(t.value)} xu`.slice(0, 100),
      default: filter === r.key,
    });
  }
  const select = new StringSelectMenuBuilder()
    .setCustomId(`${prefix}:filter`)
    .setPlaceholder('Lọc theo độ hiếm')
    .setDisabled(Boolean(disabled) || options.length <= 1)
    .addOptions(options.slice(0, 25));
  return new ActionRowBuilder().addComponents(select);
}

// -------------------------------------------------------------
//  Hàng chọn KIỂU SẮP XẾP
// -------------------------------------------------------------
function sortRow(prefix, sortKey, disabled = false) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`${prefix}:sort`)
    .setPlaceholder('Sắp xếp theo...')
    .setDisabled(Boolean(disabled))
    .addOptions(
      SORTS.map((s) => ({
        label: s.label.slice(0, 100),
        value: s.key,
        emoji: s.emoji,
        default: s.key === sortKey,
      })),
    );
  return new ActionRowBuilder().addComponents(select);
}

// -------------------------------------------------------------
//  Hàng tiện ích: làm mới · đóng
// -------------------------------------------------------------
function toolsRow(prefix, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${prefix}:refresh`)
      .setLabel('Làm mới')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(Boolean(disabled)),
    new ButtonBuilder()
      .setCustomId(`${prefix}:close`)
      .setLabel('Đóng')
      .setEmoji('✖️')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(Boolean(disabled)),
  );
}

// -------------------------------------------------------------
//  Dựng TOÀN BỘ màn hình bể cá (embed + các hàng nút)
//
//  opts:
//   - aquarium : mảng cá trong ví
//   - name     : tên người sở hữu (hiển thị)
//   - avatar   : ảnh đại diện (tùy chọn)
//   - prefix   : tiền tố customId (mặc định 'aq')
//   - current  : trang đang xem (0-based)
//   - filter   : 'all' hoặc một rarity key
//   - sortKey  : 'rarity' | 'count' | 'value' | 'name'
//   - disabled : tắt hết nút (khi hết thời gian)
//   - cmdPrefix: tiền tố lệnh của server (để gợi ý trong chân embed)
// -------------------------------------------------------------
function buildView(opts = {}) {
  const prefix = opts.prefix || 'aq';
  const aquarium = Array.isArray(opts.aquarium) ? opts.aquarium : [];
  const filter = safeFilter(opts.filter);
  const sortKey = safeSort(opts.sortKey);
  const disabled = Boolean(opts.disabled);
  const cmdPrefix = opts.cmdPrefix || '';

  const allEntries = groupFish(aquarium);
  const totalCount = aquarium.length;
  const totalValue = allEntries.reduce((a, e) => a + e.value, 0);

  // Bể trống -> không cần nút bấm nào.
  if (!allEntries.length) {
    return {
      embeds: [
        Embed.info(
          'Bể cá trống',
          `${opts.self === false ? `**${opts.name}** chưa có con cá nào.` : 'Bạn chưa có con cá nào.'}\n` +
            `Hãy dùng \`${cmdPrefix}fish\` để bắt đầu đi câu!`,
        ),
      ],
      components: [],
      pages: 1,
      page: 0,
      entries: [],
      totalCount: 0,
      totalValue: 0,
    };
  }

  const shown = sortEntries(filterEntries(allEntries, filter), sortKey);
  const pages = page.pageCount(shown);
  const current = page.clampPage(opts.current, shown);
  const slice = page.slicePage(shown, current);
  const startIndex = current * PAGE_SIZE;

  const shownCount = shown.reduce((a, e) => a + e.count, 0);
  const shownValue = shown.reduce((a, e) => a + e.value, 0);
  const filterMeta = filter === 'all' ? null : fishing.rarityMeta(filter);
  const sortMeta = SORTS.find((s) => s.key === sortKey) || SORTS[0];

  const head = [
    `🐟 Tổng: **${num(totalCount)}** con • **${num(allEntries.length)}** loài • ~**${num(totalValue)}** xu`,
  ];
  if (filter !== 'all' && filterMeta) {
    head.push(`🔍 Đang lọc: ${filterMeta.badge} **${filterMeta.label}** — ${num(shownCount)} con • ~${num(shownValue)} xu`);
  }
  head.push(`🔃 Sắp xếp: **${sortMeta.label}**`);

  const body = slice.length
    ? slice.map((e, i) => lineOf(e, startIndex + i + 1)).join('\n')
    : '_Không có loài nào khớp bộ lọc này._';

  const embed = Embed.custom(
    filterMeta ? filterMeta.color : colors.aqua,
    `🐠 Bể cá của ${opts.name || 'bạn'}`,
    `${head.join('\n')}\n\n${body}`,
  ).setFooter({
    text:
      `Trang ${current + 1}/${pages} • ${num(shown.length)} loài trong danh sách • ` +
      `${emoji.coin} ${cmdPrefix}sellfish để bán cá`,
  });
  if (opts.avatar) embed.setThumbnail(opts.avatar);

  const components = [
    ui.navRow(prefix, current, shown, disabled),
    filterRow(prefix, allEntries, filter, disabled),
    sortRow(prefix, sortKey, disabled),
    toolsRow(prefix, disabled),
  ];

  return { embeds: [embed], components, pages, page: current, entries: shown, totalCount, totalValue };
}

module.exports = {
  PAGE_SIZE,
  SORTS,
  SORT_KEYS,
  groupFish,
  rarityTotals,
  filterEntries,
  sortEntries,
  safeFilter,
  safeSort,
  lineOf,
  summaryEmbed,
  buildView,
  filterRow,
  sortRow,
  toolsRow,
};
