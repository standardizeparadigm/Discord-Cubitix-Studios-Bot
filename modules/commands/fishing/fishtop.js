// =============================================================
//  Lệnh: fishtop - bảng xếp hạng cần thủ
//
//  BẢN NÂNG CẤP: chia trang 10 người/trang với nút ⏮️ ◀️ ▶️ ⏭️,
//  thêm 3 chế độ xếp hạng và nút nhảy tới hạng của mình.
//  Dùng chung modules/core/boardUI.js với lệnh top để hai bảng hoạt động giống hệt nhau.
// =============================================================
const { MessageFlags } = require('discord.js');
const Embed = require('../../core/EmbedFactory');
const { colors, emoji } = require('../../core/palette');
const db = require('../../core/Database');
const fishing = require('../../core/fishing');
const ui = require('../../core/boardUI');

const ID = 'ftop';
const PANEL_TIME = 180000;
const TOTAL_SPECIES = fishing.SPECIES.length;
const SPECIES_IDS = new Set(fishing.SPECIES.map((s) => s.id));

const MODES = [
  {
    key: 'species', label: 'Bộ sưu tập', emoji: '📖',
    desc: 'Xếp theo số loài cá đã sưu tầm',
    footer: 'Xếp theo số loài đã sưu tầm',
    value: (e) => e.collected,
    sort: (a, b) => b.collected - a.collected || b.best - a.best || b.caught - a.caught,
  },
  {
    key: 'caught', label: 'Số lượt câu', emoji: '🎣',
    desc: 'Xếp theo tổng số cá kéo được',
    footer: 'Xếp theo tổng số lượt câu',
    value: (e) => e.caught,
    sort: (a, b) => b.caught - a.caught || b.collected - a.collected || b.best - a.best,
  },
  {
    key: 'best', label: 'Cá giá trị nhất', emoji: '🌟',
    desc: 'Xếp theo con cá đắt nhất từng câu',
    footer: 'Xếp theo giá trị con cá đắt nhất',
    value: (e) => e.best,
    sort: (a, b) => b.best - a.best || b.collected - a.collected || b.caught - a.caught,
  },
];
const MODE_BY_KEY = Object.fromEntries(MODES.map((m) => [m.key, m]));

function countSpecies(discovered) {
  const d = discovered || {};
  let n = 0;
  for (const id of Object.keys(d)) if (SPECIES_IDS.has(id) && (d[id] || 0) > 0) n++;
  return n;
}

// Dựng TOÀN BỘ bảng theo chế độ đang chọn (bản cũ cắt cứng 10 người).
function buildBoard(mode) {
  const all = db.economy.all() || {};
  const rows = Object.entries(all)
    .map(([id, w]) => {
      const st = (w && w.fishStats) || {};
      return {
        id,
        collected: countSpecies(st.discovered),
        caught: Number(st.caught) || 0,
        best: Number(st.best && st.best.value) || 0,
        bestId: (st.best && st.best.id) || null,
      };
    })
    .filter((e) => e.caught > 0 || e.collected > 0)
    .filter((e) => mode.value(e) > 0)
    .sort((a, b) => mode.sort(a, b) || String(a.id).localeCompare(String(b.id)));
  return ui.withRanks(rows);
}

// Phần số liệu của một dòng, KHÔNG kèm hạng và tên.
// Tách riêng để chỗ "Vị trí của bạn" dùng lại được nguyên vẹn,
// thay vì cắt chuỗi bằng regex (rất dễ sai khi tên chứa ký tự lạ).
function statsFor(mode, e) {
  if (mode.key === 'caught') {
    return '🎣 ' + ui.num(e.caught) + ' lượt • ' + e.collected + '/' + TOTAL_SPECIES + ' loài';
  }
  if (mode.key === 'best') {
    const sp = e.bestId ? fishing.speciesById(e.bestId) : null;
    const what = sp ? (sp.emoji || '🐟') + ' ' + sp.name : '🐟 Cá';
    return what + ' · ' + ui.num(e.best) + ' xu';
  }
  const pct = TOTAL_SPECIES ? Math.round((e.collected / TOTAL_SPECIES) * 100) : 0;
  return e.collected + '/' + TOTAL_SPECIES + ' loài (' + pct + '%) • 🎣 ' + ui.num(e.caught) + ' lượt';
}

function lineFor(mode, e, name) {
  return ui.rankTag(e.rank) + ' **' + name + '** — ' + statsFor(mode, e);
}

async function renderEmbed(ctx, mode, board, current, nameCache) {
  const pages = ui.pageCount(board);
  const safe = ui.clampPage(current, board);
  const slice = ui.slicePage(board, safe);

  await ui.resolveNames(ctx.client, slice.map((e) => e.id), nameCache);

  const meId = String(ctx.author.id);
  const meIndex = ui.indexOfUser(board, meId);

  let desc;
  if (!board.length) {
    desc = '📭 Chưa ai đi câu cá. Dùng `fish` để trở thành cần thủ đầu tiên!';
  } else {
    desc = slice
      .map((e) => {
        const name = nameCache.get(e.id) || 'Người dùng ẩn';
        const line = lineFor(mode, e, name);
        return String(e.id) === meId ? '▸ ' + line : line;
      })
      .join('\n');
  }

  const e = Embed.custom(colors.gold, (emoji.trophy || '🏆') + ' Bảng xếp hạng cần thủ · ' + mode.emoji + ' ' + mode.label, desc);

  if (board.length) {
    const meText = meIndex >= 0
      ? ui.rankTag(meIndex + 1) + ' **Bạn** — ' + statsFor(mode, board[meIndex]) +
        '  ·  ở trang ' + (ui.pageOf(meIndex) + 1)
      : '_Bạn chưa có tên trong bảng này. Dùng `fish` để góp mặt nhé!_';
    e.addFields({ name: '🎯 Vị trí của bạn', value: meText, inline: false });
  }

  e.setFooter({
    text: 'Trang ' + (safe + 1) + '/' + pages + ' • ' + ui.num(board.length) + ' cần thủ • ' + mode.footer,
  });
  e.setTimestamp(new Date());
  return e;
}

function buildRows(mode, board, current, disabled = false) {
  return [
    ui.modeRow(ID, MODES, mode.key, '🎣 Chọn cách xếp hạng', disabled),
    ui.navRow(ID, current, board, disabled),
    ui.toolsRow(ID, disabled, board.length > 0),
  ];
}

module.exports = {
  name: 'fishtop',
  aliases: ['topca', 'topfish', 'bxhca'],
  category: 'fishing',
  description: 'Bảng xếp hạng cần thủ giỏi nhất (bộ sưu tập, số lượt câu, cá giá trị nhất)',
  usage: 'fishtop [trang]',
  cooldown: 5,
  guildOnly: true,
  slash: true,
  options: [
    { name: 'trang', type: 'integer', description: 'Mở thẳng tới trang số mấy', required: false, minValue: 1 },
  ],

  async run(ctx) {
    if (ctx.isSlash) await ctx.defer();

    let mode = MODES[0];
    let board = buildBoard(mode);

    const wantPage = ctx.getInteger('trang');
    let current = ui.clampPage(Number.isFinite(wantPage) && wantPage > 0 ? wantPage - 1 : 0, board);

    const nameCache = new Map();
    const embed = await renderEmbed(ctx, mode, board, current, nameCache);
    const msg = await ctx.reply({ embeds: [embed], components: buildRows(mode, board, current) });

    const collector = msg.createMessageComponentCollector({ time: PANEL_TIME });
    let ended = false;

    collector.on('collect', async (i) => {
      if (i.user.id !== ctx.author.id) {
        return i.reply({
          content: '❌ Đây không phải bảng bạn mở. Hãy tự gõ `fishtop` để có bảng riêng nhé!',
          flags: MessageFlags.Ephemeral,
        }).catch(() => {});
      }
      if (ended) return i.deferUpdate().catch(() => {});

      const id = i.customId;

      if (id === ID + ':close') {
        await i.deferUpdate().catch(() => {});
        collector.stop('closed');
        return undefined;
      }

      if (id === ID + ':mode') {
        const key = Array.isArray(i.values) ? i.values[0] : null;
        if (MODE_BY_KEY[key]) {
          mode = MODE_BY_KEY[key];
          board = buildBoard(mode);
          current = 0;
        }
      } else if (id === ID + ':first') {
        current = 0;
      } else if (id === ID + ':prev') {
        current = ui.clampPage(current - 1, board);
      } else if (id === ID + ':next') {
        current = ui.clampPage(current + 1, board);
      } else if (id === ID + ':last') {
        current = ui.pageCount(board) - 1;
      } else if (id === ID + ':me') {
        const idx = ui.indexOfUser(board, ctx.author.id);
        if (idx >= 0) current = ui.clampPage(ui.pageOf(idx), board);
      } else if (id === ID + ':refresh') {
        board = buildBoard(mode);
        current = ui.clampPage(current, board);
      } else {
        return i.deferUpdate().catch(() => {});
      }

      await i.deferUpdate().catch(() => {});
      const next = await renderEmbed(ctx, mode, board, current, nameCache);
      await msg.edit({ embeds: [next], components: buildRows(mode, board, current) }).catch(() => {});
      return undefined;
    });

    collector.on('end', () => {
      if (ended) return;
      ended = true;
      msg.edit({ components: buildRows(mode, board, current, true) }).catch(() => {});
    });
  },
};
