// =============================================================
//  Lệnh: leaderboard / top - bảng xếp hạng NHIỀU hạng mục
//  Hạng mục:
//    💵 cash    - số xu trong ví
//    🐠 cá      - tổng số cá đã câu được
//    📖 loài cá - số loài cá đã sưu tầm
//    🍀 may mắn - điểm may mắn (pray / curse)
//    🔥 streak  - chuỗi điểm danh daily
//
//  BẢN NÂNG CẤP:
//    - Chia trang đúng 10 người/trang, nút ⏮️ ◀️ ▶️ ⏭️ giữ nguyên trang đang xem.
//    - Menu thả xuống để đổi hạng mục (gọn hơn 5 nút cũ, lại còn chỗ cho nút khác).
//    - Nút "Hạng của tôi" nhảy thẳng tới trang chứa mình.
//    - Nút làm mới (đọc lại dữ liệu) và nút đóng bảng.
//    - Luôn hiện hạng của người xem dù họ không nằm trong trang đang mở.
//    - Phần chia trang dùng chung modules/core/boardUI.js với lệnh fishtop.
// =============================================================
const { MessageFlags } = require('discord.js');
const Embed = require('../../core/EmbedFactory');
const { colors } = require('../../core/palette');
const db = require('../../core/Database');
const fishing = require('../../core/fishing');
const ui = require('../../core/boardUI');

const ID = 'top';              // tiền tố customId riêng của bảng này
const PANEL_TIME = 180000;     // 3 phút
const TOTAL_SPECIES = fishing.SPECIES.length;

// Tập ID loài cá hợp lệ. Nhờ nó, đếm số loài đã sưu tầm chỉ duyệt những loài
// người đó thật sự có, thay vì quét toàn bộ danh sách loài cho TỪNG người như bản cũ.
const SPECIES_IDS = new Set(fishing.SPECIES.map((s) => s.id));

// ---- Định nghĩa các hạng mục xếp hạng ----
const CATEGORIES = [
  {
    key: 'cash', label: 'Cash', emoji: '💵',
    desc: 'Ai nhiều xu nhất máy chủ',
    value: (w) => w.balance || 0,
    fmt: (v) => ui.num(v) + ' xu',
    footer: 'Xếp theo số xu trong ví',
  },
  {
    key: 'fish', label: 'Cá', emoji: '🐠',
    desc: 'Ai câu được nhiều cá nhất',
    value: (w) => (w.fishStats && w.fishStats.caught) || 0,
    fmt: (v) => ui.num(v) + ' con',
    footer: 'Xếp theo tổng số cá đã câu được',
  },
  {
    key: 'species', label: 'Loài cá', emoji: '📖',
    desc: 'Ai sưu tầm được nhiều loài nhất',
    value: (w) => {
      const d = (w.fishStats && w.fishStats.discovered) || {};
      let n = 0;
      for (const id of Object.keys(d)) if (SPECIES_IDS.has(id) && (d[id] || 0) > 0) n++;
      return n;
    },
    fmt: (v) => v + '/' + TOTAL_SPECIES + ' loài',
    footer: 'Xếp theo số loài cá đã sưu tầm',
  },
  {
    key: 'luck', label: 'May mắn', emoji: '🍀',
    desc: 'Điểm may mắn từ pray / curse',
    value: (w) => w.karma || 0,
    fmt: (v) => ui.num(v) + ' điểm',
    footer: 'Xếp theo điểm may mắn (pray / curse)',
    keepNegative: true,
  },
  {
    key: 'streak', label: 'Streak', emoji: '🔥',
    desc: 'Chuỗi điểm danh daily dài nhất',
    value: (w) => w.dailyStreak || 0,
    fmt: (v) => ui.num(v) + ' ngày',
    footer: 'Xếp theo chuỗi điểm danh daily',
  },
];
const CAT_BY_KEY = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));

// Chuẩn hóa chuỗi: bỏ dấu, bỏ ký tự đặc biệt, viết thường
function norm(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

// Đoán hạng mục từ input của người dùng
const ALIASES = {
  cash: ['cash', 'xu', 'tien', 'money', 'giau', 'vi'],
  fish: ['ca', 'fish', 'soca', 'cauca'],
  species: ['loaica', 'loai', 'species', 'dex', 'suutam', 'fishdex'],
  luck: ['mayman', 'may', 'luck', 'karma', 'mm', 'diemmayman'],
  streak: ['streak', 'daily', 'chuoi', 'diemdanh', 'chuoidiemdanh'],
};
function resolveCategory(input) {
  const q = norm(input);
  if (!q) return null;
  for (const [key, words] of Object.entries(ALIASES)) if (words.includes(q)) return key;
  for (const [key, words] of Object.entries(ALIASES)) if (words.some((w) => q.includes(w) || w.includes(q))) return key;
  return null;
}

// Dựng TOÀN BỘ bảng (bản cũ cắt cứng 10 người nên không thể chia trang).
function buildBoard(cat) {
  const all = db.economy.all() || {};
  const rows = Object.entries(all)
    .map(([id, w]) => ({ id, v: cat.value(w || {}) }))
    .filter((e) => Number.isFinite(e.v) && (cat.keepNegative ? e.v !== 0 : e.v > 0))
    // Thứ tự phụ theo id: hai người bằng điểm sẽ luôn đứng cố định,
    // không nhảy qua nhảy lại mỗi lần lật trang.
    .sort((a, b) => b.v - a.v || String(a.id).localeCompare(String(b.id)));
  return ui.withRanks(rows);
}

async function renderEmbed(ctx, cat, board, current, nameCache) {
  const pages = ui.pageCount(board);
  const safe = ui.clampPage(current, board);
  const slice = ui.slicePage(board, safe);

  await ui.resolveNames(ctx.client, slice.map((e) => e.id), nameCache);

  const meId = String(ctx.author.id);
  const meIndex = ui.indexOfUser(board, meId);

  let desc;
  if (!board.length) {
    desc =
      '📭 Chưa có dữ liệu cho hạng mục này.\n' +
      'Hãy dùng `daily`, `work`, `fish`… để trở thành người đầu tiên lên bảng!';
  } else {
    desc = slice
      .map((e) => {
        const name = nameCache.get(e.id) || 'Người dùng ẩn';
        const line = ui.rankTag(e.rank) + ' **' + name + '** — ' + cat.emoji + ' ' + cat.fmt(e.v);
        // Đánh dấu dòng của chính người đang xem cho dễ tìm.
        return String(e.id) === meId ? '▸ ' + line : line;
      })
      .join('\n');
  }

  const e = Embed.custom(colors.gold, '🏆 Bảng xếp hạng · ' + cat.emoji + ' ' + cat.label, desc);

  if (board.length) {
    // Luôn cho người xem biết mình đứng thứ mấy, kể cả khi không ở trang này.
    const meText = meIndex >= 0
      ? ui.rankTag(meIndex + 1) + ' **Bạn** — ' + cat.emoji + ' ' + cat.fmt(board[meIndex].v) +
        '  ·  ở trang ' + (ui.pageOf(meIndex) + 1)
      : '_Bạn chưa có tên trong hạng mục này._';
    e.addFields({ name: '🎯 Vị trí của bạn', value: meText, inline: false });
  }

  e.setFooter({
    text: 'Trang ' + (safe + 1) + '/' + pages + ' • ' + ui.num(board.length) + ' người chơi • ' + cat.footer,
  });
  e.setTimestamp(new Date());
  return e;
}

function buildRows(cat, board, current, disabled = false) {
  return [
    ui.modeRow(ID, CATEGORIES, cat.key, '📂 Chọn hạng mục xếp hạng', disabled),
    ui.navRow(ID, current, board, disabled),
    ui.toolsRow(ID, disabled, board.length > 0),
  ];
}

module.exports = {
  name: 'leaderboard',
  aliases: ['lb', 'top', 'bxh', 'bangxephang', 'rank'],
  category: 'economy',
  description: 'Bảng xếp hạng nhiều hạng mục: cash, cá, loài cá, may mắn, streak',
  usage: 'top [cash|ca|loaica|mayman|streak] [trang]',
  cooldown: 5,
  guildOnly: true,
  slash: true,
  options: [
    {
      name: 'hang_muc',
      type: 'string',
      description: 'Hạng mục muốn xem',
      required: false,
      choices: [
        { name: '💵 Cash - số xu', value: 'cash' },
        { name: '🐠 Cá - số cá đã câu', value: 'fish' },
        { name: '📖 Loài cá - bộ sưu tập', value: 'species' },
        { name: '🍀 May mắn - karma', value: 'luck' },
        { name: '🔥 Streak - chuỗi daily', value: 'streak' },
      ],
    },
    { name: 'trang', type: 'integer', description: 'Mở thẳng tới trang số mấy', required: false, minValue: 1 },
  ],

  async run(ctx) {
    // Phải tra tên nhiều người trước khi trả lời -> báo "đang xử lý" để không quá 3 giây.
    if (ctx.isSlash) await ctx.defer();

    let cat = CAT_BY_KEY[resolveCategory(ctx.getString('hang_muc')) || 'cash'];
    let board = buildBoard(cat);

    const wantPage = ctx.getInteger('trang');
    let current = ui.clampPage(Number.isFinite(wantPage) && wantPage > 0 ? wantPage - 1 : 0, board);

    const nameCache = new Map();
    const embed = await renderEmbed(ctx, cat, board, current, nameCache);
    const msg = await ctx.reply({ embeds: [embed], components: buildRows(cat, board, current) });

    // KHÔNG lọc componentType: bảng có cả nút bấm lẫn menu thả xuống.
    const collector = msg.createMessageComponentCollector({ time: PANEL_TIME });
    let ended = false;

    collector.on('collect', async (i) => {
      // Chỉ người mở bảng mới bấm được, tránh hai người tranh nhau lật trang.
      if (i.user.id !== ctx.author.id) {
        return i.reply({
          content: '❌ Đây không phải bảng xếp hạng bạn mở. Hãy tự gõ `top` để có bảng riêng nhé!',
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
        if (CAT_BY_KEY[key]) {
          cat = CAT_BY_KEY[key];
          board = buildBoard(cat);          // đổi hạng mục -> dựng lại bảng
          current = 0;                      // và quay về trang đầu
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
        board = buildBoard(cat);            // đọc lại dữ liệu mới nhất
        current = ui.clampPage(current, board);
      } else {
        return i.deferUpdate().catch(() => {});
      }

      await i.deferUpdate().catch(() => {});
      const next = await renderEmbed(ctx, cat, board, current, nameCache);
      await msg.edit({ embeds: [next], components: buildRows(cat, board, current) }).catch(() => {});
      return undefined;
    });

    collector.on('end', () => {
      if (ended) return;
      ended = true;
      // Tắt hết nút khi hết giờ để không ai bấm vào bảng đã chết.
      msg.edit({ components: buildRows(cat, board, current, true) }).catch(() => {});
    });
  },
};
