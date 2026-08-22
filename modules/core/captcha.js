'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const Embed = require('./EmbedFactory');
const { colors } = require('./palette');
const rng = require('./secureRandom');

// ---------- Tiện ích ngẫu nhiên (chỉ dùng randomInt để luôn an toàn) ----------
function randInt(maxExclusive) {
  const n = Math.max(1, Math.floor(Number(maxExclusive) || 1));
  return rng.randomInt(n);
}

function randBetween(min, max) {
  const lo = Math.floor(Number(min) || 0);
  const hi = Math.floor(Number(max) || 0);
  if (hi <= lo) return lo;
  return lo + randInt(hi - lo + 1);
}

function pickOne(list) {
  const arr = Array.isArray(list) ? list : [];
  if (!arr.length) return undefined;
  return arr[randInt(arr.length)];
}

// Tráo mảng (Fisher-Yates) trên một bản copy.
function shuffled(list) {
  const arr = Array.isArray(list) ? list.slice() : [];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

// ---------- Nguyên liệu cho câu đố ----------
const EMOJIS = ['🍎', '🍌', '🍇', '🍉', '🍓', '🍍', '⭐', '🔥', '🌟', '🎯', '🎲', '💎', '🍀', '🌙', '⚽', '🏀', '🎁', '🔑', '🔔', '🧩'];

const EMOJI_NAMES = {
  '🍎': 'quả táo',
  '🍌': 'quả chuối',
  '🍇': 'chùm nho',
  '🍉': 'quả dưa hấu',
  '🍓': 'quả dâu',
  '🍍': 'quả dứa',
  '⭐': 'ngôi sao',
  '🔥': 'ngọn lửa',
  '🌟': 'sao lấp lánh',
  '🎯': 'bảng đích',
  '🎲': 'con xúc xắc',
  '💎': 'viên kim cương',
  '🍀': 'lá cỏ bốn lá',
  '🌙': 'vầng trăng',
  '⚽': 'quả bóng đá',
  '🏀': 'quả bóng rổ',
  '🎁': 'hộp quà',
  '🔑': 'chìa khoá',
  '🔔': 'cái chuông',
  '🧩': 'mảnh ghép',
};

// Nhóm từ để làm câu đố "chọn thứ khác loại" (máy rất khó đoán).
const GROUPS = [
  { name: 'con vật', items: ['con mèo', 'con chó', 'con gà', 'con vịt', 'con cá', 'con bò'] },
  { name: 'trái cây', items: ['quả táo', 'quả chuối', 'quả xoài', 'quả cam', 'quả nho', 'quả dứa'] },
  { name: 'màu sắc', items: ['màu đỏ', 'màu xanh', 'màu vàng', 'màu tím', 'màu đen', 'màu trắng'] },
  { name: 'phương tiện', items: ['xe máy', 'xe đạp', 'xe buýt', 'tàu hoả', 'máy bay', 'xe tải'] },
  { name: 'đồ ăn', items: ['bánh mì', 'phở bò', 'cơm rang', 'bún chả', 'xôi gà', 'cháo gà'] },
  { name: 'nghề', items: ['bác sĩ', 'giáo viên', 'kỹ sư', 'ca sĩ', 'lái xe', 'đầu bếp'] },
];

// =============================================================
//  Sinh câu đố
//  Mỗi bộ sinh trả về: { type, question, hint, options:string[], answer:string }
// =============================================================

function makeEmojiPuzzle() {
  const pool = shuffled(EMOJIS).slice(0, 5);
  const answer = pickOne(pool);
  return {
    type: 'emoji',
    question: `Hãy bấm vào **${EMOJI_NAMES[answer] || 'biểu tượng'}** ${answer}`,
    hint: 'Chọn đúng biểu tượng được yêu cầu.',
    options: pool,
    answer,
  };
}

function makeMathPuzzle() {
  const style = randInt(3);
  let a;
  let b;
  let text;
  let value;
  if (style === 0) {
    a = randBetween(11, 49);
    b = randBetween(11, 49);
    value = a + b;
    text = `${a} + ${b}`;
  } else if (style === 1) {
    a = randBetween(30, 90);
    b = randBetween(5, 25);
    value = a - b;
    text = `${a} − ${b}`;
  } else {
    a = randBetween(3, 9);
    b = randBetween(3, 9);
    value = a * b;
    text = `${a} × ${b}`;
  }

  const opts = new Set([String(value)]);
  let guard = 0;
  while (opts.size < 4 && guard++ < 60) {
    const delta = randBetween(1, 12) * (randInt(2) ? 1 : -1);
    const fake = value + delta;
    if (fake >= 0 && fake !== value) opts.add(String(fake));
  }
  return {
    type: 'math',
    question: `**${text} = ?**`,
    hint: 'Chọn đúng kết quả phép tính.',
    options: shuffled(Array.from(opts)),
    answer: String(value),
  };
}

function makeSequencePuzzle() {
  const start = randBetween(2, 12);
  const step = randBetween(2, 9);
  const items = [];
  for (let i = 0; i < 4; i++) items.push(start + step * i);
  const value = start + step * 4;

  const opts = new Set([String(value)]);
  let guard = 0;
  while (opts.size < 4 && guard++ < 60) {
    const fake = value + randBetween(1, step + 3) * (randInt(2) ? 1 : -1);
    if (fake > 0 && fake !== value) opts.add(String(fake));
  }
  return {
    type: 'sequence',
    question: `Dãy số: **${items.join(', ')}, ?** — số tiếp theo là gì?`,
    hint: 'Tìm quy luật của dãy số.',
    options: shuffled(Array.from(opts)),
    answer: String(value),
  };
}

function makeCountPuzzle() {
  const target = pickOne(EMOJIS);
  const others = shuffled(EMOJIS.filter((e) => e !== target)).slice(0, 3);
  const count = randBetween(2, 6);
  const line = [];
  for (let i = 0; i < count; i++) line.push(target);
  const noise = randBetween(3, 7);
  for (let i = 0; i < noise; i++) line.push(pickOne(others));

  const opts = new Set([String(count)]);
  let guard = 0;
  while (opts.size < 4 && guard++ < 60) {
    const fake = count + randBetween(1, 3) * (randInt(2) ? 1 : -1);
    if (fake >= 1 && fake <= 12 && fake !== count) opts.add(String(fake));
  }
  return {
    type: 'count',
    question: `Có bao nhiêu ${target} trong dãy sau?\n# ${shuffled(line).join(' ')}`,
    hint: 'Đếm số lần biểu tượng đó xuất hiện.',
    options: shuffled(Array.from(opts)),
    answer: String(count),
  };
}

function makeOddOnePuzzle() {
  const groups = shuffled(GROUPS);
  const main = groups[0];
  const other = groups[1];
  const items = shuffled(main.items).slice(0, 3);
  const odd = pickOne(other.items);
  return {
    type: 'oddone',
    question: `Trong 4 lựa chọn dưới đây, **thứ nào KHÁC LOẠI** với ba thứ còn lại?`,
    hint: `Ba lựa chọn cùng nhóm "${main.name}".`,
    options: shuffled(items.concat([odd])),
    answer: odd,
  };
}

const GENERATORS = [makeEmojiPuzzle, makeMathPuzzle, makeSequencePuzzle, makeCountPuzzle, makeOddOnePuzzle];

// Tạo một câu đố ngẫu nhiên. Có thể chỉ định loại qua opts.type.
function makePuzzle(opts = {}) {
  const wanted = String(opts.type || '').toLowerCase();
  const byType = {
    emoji: makeEmojiPuzzle,
    math: makeMathPuzzle,
    sequence: makeSequencePuzzle,
    count: makeCountPuzzle,
    oddone: makeOddOnePuzzle,
  };
  const gen = byType[wanted] || pickOne(GENERATORS);
  const puzzle = gen();
  // Phòng xa: luôn đảm bảo đáp án nằm trong danh sách lựa chọn.
  if (!puzzle.options.includes(puzzle.answer)) puzzle.options = shuffled(puzzle.options.concat([puzzle.answer]));
  puzzle.options = puzzle.options.slice(0, 5);
  if (!puzzle.options.includes(puzzle.answer)) puzzle.options[puzzle.options.length - 1] = puzzle.answer;
  return puzzle;
}

// =============================================================
//  Hỏi người chơi
// =============================================================
function buildRows(puzzle, nonce) {
  const row = new ActionRowBuilder();
  puzzle.options.forEach((opt, idx) => {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`cap:${nonce}:${idx}`)
        .setLabel(String(opt).slice(0, 60))
        .setStyle(ButtonStyle.Secondary),
    );
  });
  return [row];
}

function buildEmbed(puzzle, opts) {
  const seconds = Math.round((opts.timeoutMs || 45000) / 1000);
  const lines = [
    'Hệ thống phát hiện cách dùng lệnh của bạn **giống máy tự động**.',
    'Hãy giải câu đố nhỏ này để chứng minh bạn là người thật.',
    '',
    puzzle.question,
  ];
  if (opts.reasonText) lines.push('', `ℹ️ **Dấu hiệu:** ${opts.reasonText}`);
  const emb = Embed.custom(colors.warning, '🧩 Xác minh người thật', lines.join('\n')).addFields(
    { name: '⏱️ Thời gian', value: `${seconds} giây`, inline: true },
    { name: '💡 Gợi ý', value: puzzle.hint || 'Chọn đáp án đúng.', inline: true },
  );
  if (opts.attemptsLeft != null) {
    emb.addFields({ name: '🔁 Lượt còn lại', value: String(opts.attemptsLeft), inline: true });
  }
  return emb;
}

/**
 * Gửi câu đố và chờ người chơi trả lời.
 *
 * @param {object} ctx CommandContext (hoặc bất kỳ đối tượng có reply/author)
 * @param {object} opts
 *   - timeoutMs    : thời gian chờ (mặc định 45000)
 *   - minAnswerMs  : trả lời nhanh hơn mức này coi như máy (mặc định 400)
 *   - reasonText   : mô tả dấu hiệu bị nghi (hiện trong embed)
 *   - deleteAfterMs: sau bao lâu thì xoá tin nhắn câu đố (0 = không xoá)
 *   - type         : chỉ định loại câu đố
 * @returns {Promise<{ok:boolean, reason:string, ms:number, type:string, message:object|null}>}
 *   reason: 'passed' | 'wrong' | 'too_fast' | 'timeout' | 'error'
 */
async function challenge(ctx, opts = {}) {
  const timeoutMs = Math.max(8000, Math.min(300000, Number(opts.timeoutMs) || 45000));
  const minAnswerMs = Math.max(0, Math.min(5000, Number(opts.minAnswerMs) == null ? 400 : Number(opts.minAnswerMs)));
  const deleteAfterMs = Number(opts.deleteAfterMs);
  const puzzle = makePuzzle(opts);
  const nonce = `${Date.now().toString(36)}${randInt(1e6).toString(36)}`;
  const userId = String(ctx && ctx.author ? ctx.author.id : opts.userId || '');

  let msg = null;
  try {
    msg = await ctx.reply({
      content: userId ? `<@${userId}>` : undefined,
      embeds: [buildEmbed(puzzle, { ...opts, timeoutMs })],
      components: buildRows(puzzle, nonce),
    });
  } catch {
    return { ok: false, reason: 'error', ms: 0, type: puzzle.type, message: null };
  }
  if (!msg || typeof msg.createMessageComponentCollector !== 'function') {
    return { ok: false, reason: 'error', ms: 0, type: puzzle.type, message: msg || null };
  }

  const startedAt = Date.now();
  const answerIndex = puzzle.options.indexOf(puzzle.answer);

  const result = await new Promise((resolve) => {
    let settled = false;
    const finish = (out) => {
      if (settled) return;
      settled = true;
      try {
        collector.stop('done');
      } catch {
        /* bỏ qua */
      }
      resolve(out);
    };

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: timeoutMs,
    });

    collector.on('collect', async (i) => {
      try {
        // Người khác bấm hộ thì không được tính.
        if (userId && i.user.id !== userId) {
          await i
            .reply({ content: 'Câu đố này không dành cho bạn nhé.', flags: MessageFlags.Ephemeral })
            .catch(() => {});
          return;
        }
        const parts = String(i.customId || '').split(':');
        if (parts[0] !== 'cap' || parts[1] !== nonce) return;
        await i.deferUpdate().catch(() => {});

        const ms = Date.now() - startedAt;
        const picked = Number(parts[2]);
        // Bấm nhanh hơn sức người -> chắc chắn là máy, dù bấm đúng.
        if (ms < minAnswerMs) return finish({ ok: false, reason: 'too_fast', ms });
        if (picked === answerIndex) return finish({ ok: true, reason: 'passed', ms });
        return finish({ ok: false, reason: 'wrong', ms });
      } catch {
        return finish({ ok: false, reason: 'error', ms: Date.now() - startedAt });
      }
    });

    collector.on('end', (_c, reason) => {
      if (settled) return;
      settled = true;
      resolve({ ok: false, reason: reason === 'done' ? 'error' : 'timeout', ms: Date.now() - startedAt });
    });
  });

  // Cập nhật lại tin nhắn cho người chơi biết kết quả.
  const outcome = {
    passed: { color: colors.success, title: '✅ Xác minh thành công', desc: 'Cảm ơn bạn! Bạn có thể tiếp tục chơi bình thường.' },
    wrong: { color: colors.error, title: '❌ Sai đáp án', desc: `Đáp án đúng là **${puzzle.answer}**.` },
    too_fast: {
      color: colors.error,
      title: '❌ Trả lời quá nhanh',
      desc: 'Bạn bấm nhanh hơn mức con người đọc kịp câu hỏi nên lần này không được tính.',
    },
    timeout: { color: colors.error, title: '⏰ Hết thời gian', desc: 'Bạn không trả lời kịp câu đố.' },
    error: { color: colors.warning, title: '⚠️ Không xác minh được', desc: 'Có lỗi khi xác minh. Vui lòng thử lại.' },
  };
  const info = outcome[result.reason] || outcome.error;
  const finalEmbed = Embed.custom(info.color, info.title, info.desc).addFields({
    name: '⏱️ Thời gian trả lời',
    value: result.ms > 0 ? `${(result.ms / 1000).toFixed(2)}s` : '—',
    inline: true,
  });
  await Promise.resolve()
    .then(() => msg.edit({ content: '', embeds: [finalEmbed], components: [] }))
    .catch(() => {});

  if (Number.isFinite(deleteAfterMs) && deleteAfterMs > 0) {
    const t = setTimeout(() => {
      Promise.resolve()
        .then(() => msg.delete())
        .catch(() => {});
    }, deleteAfterMs);
    if (typeof t.unref === 'function') t.unref();
  }

  return { ...result, type: puzzle.type, message: msg };
}

module.exports = {
  challenge,
  makePuzzle,
  EMOJIS,
  EMOJI_NAMES,
  GROUPS,
  // xuất để kiểm thử
  _internals: { shuffled, pickOne, randBetween, GENERATORS },
};
