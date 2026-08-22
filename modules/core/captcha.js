// =============================================================
//  captcha - XÁC MINH NGƯỜI THẬT bằng câu đố nhỏ  (nâng cấp LTS v3.1.4)
//
//  Khi hệ thống chống bot thấy dấu hiệu đáng nghi, ta KHÔNG cấm ngay
//  (dễ oan người chơi thật) mà yêu cầu giải một câu đố rất nhanh.
//  Người thật mất 2-5 giây là xong; macro thì không biết bấm gì.
//
//  Bảy lớp bảo vệ của câu đố (bản 3.1.4):
//   1) 12 kiểu câu đố khác nhau, nội dung sinh ngẫu nhiên mỗi lần
//      bằng bộ ngẫu nhiên an toàn (crypto) -> không học thuộc được.
//   2) Vị trí nút bấm tráo ngẫu nhiên (autoclicker bấm mù sẽ sai).
//   3) Số đáp án tăng theo độ khó (4 -> 8 nút, chia 2 hàng) nên tỷ lệ
//      bấm bừa mà đúng giảm từ 1/5 xuống còn 1/8.
//   4) Trả lời nhanh hơn sức người (mặc định dưới 0,45 giây) là trượt.
//   5) Bấm liên tiếp nhiều nút trong tích tắc (rải chuột) cũng là trượt.
//   6) Cho tối đa N lượt: sai lượt đầu thì ĐỔI CÂU MỚI chứ không cho
//      thử lại cùng một câu -> người thật ít bị oan, máy vẫn không lợi.
//   7) Sai liên tiếp quá nhiều lần thì bị KHOÁ RA CÂU ĐỐ một lúc, tránh
//      kẻ xấu ép bot gửi hàng loạt tin nhắn (chống rate limit Discord).
//
//  File này chỉ phụ thuộc discord.js ở phần gửi tin nhắn; toàn bộ phần
//  SINH CÂU ĐỐ là hàm thuần nên kiểm thử tự động rất dễ.
// =============================================================
'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const Embed = require('./EmbedFactory');
const { colors } = require('./palette');
const rng = require('./secureRandom');

// =============================================================
//  Thông số mặc định (mọi thông số đều có thể ghi đè khi gọi)
// =============================================================
const DEFAULTS = {
  timeoutMs: 50000, // thời gian cho MỖI câu đố
  minAnswerMs: 450, // nhanh hơn mức này = máy
  attempts: 2, // số lượt trả lời (mỗi lượt một câu MỚI)
  maxOptions: 6, // số nút đáp án tối đa (3..10)
  difficulty: 2, // 1 dễ - 2 thường - 3 khó
  multiClickMs: 260, // hai lần bấm gần nhau hơn mức này = rải chuột
  lockAfterFails: 4, // sai liên tiếp bao nhiêu lần thì khoá
  lockMs: 10 * 60 * 1000, // khoá bao lâu
  deleteAfterMs: 0, // 0 = không tự xoá tin nhắn câu đố
};

// Giới hạn cứng của Discord: 5 nút mỗi hàng, mỗi nhãn tối đa 80 ký tự.
const MAX_PER_ROW = 5;
const MAX_LABEL = 80;
const MAX_TRACKED = 5000; // số người được lưu lịch sử (chống phình bộ nhớ)

// =============================================================
//  Tiện ích ngẫu nhiên (dùng secureRandom nên không đoán trước được)
// =============================================================
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

function coin() {
  return randInt(2) === 0;
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

function pickMany(list, n) {
  return shuffled(list).slice(0, Math.max(0, Math.floor(Number(n) || 0)));
}

function clampNum(value, lo, hi, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

function clampInt(value, lo, hi, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, Math.trunc(n)));
}

// Đếm số chữ của một từ (an toàn với dấu tiếng Việt và ký tự nhiều byte).
function letterCount(word) {
  return Array.from(String(word || '').normalize('NFC')).length;
}

// Sinh đủ `count` đáp án SỐ khác nhau quanh giá trị đúng.
// Luôn trả về đủ số lượng khi khoảng giá trị cho phép (không bao giờ treo).
function numberOptions(value, count, spread, bounds = {}) {
  const min = Number.isFinite(bounds.min) ? bounds.min : -Infinity;
  const max = Number.isFinite(bounds.max) ? bounds.max : Infinity;
  const want = Math.max(2, Math.floor(Number(count) || 4));
  const set = new Set([String(value)]);

  // Bước 1: rải ngẫu nhiên cho tự nhiên.
  let guard = 0;
  while (set.size < want && guard++ < 300) {
    const delta = randBetween(1, Math.max(1, Math.floor(spread) || 1)) * (coin() ? 1 : -1);
    const fake = value + delta;
    if (fake === value || fake < min || fake > max) continue;
    set.add(String(fake));
  }
  // Bước 2: nếu khoảng quá hẹp thì mở rộng dần ra hai bên (chắc chắn đủ).
  for (let d = 1; set.size < want && d <= 600; d++) {
    const up = value + d;
    const down = value - d;
    if (up <= max) set.add(String(up));
    if (set.size < want && down >= min) set.add(String(down));
  }
  return shuffled(Array.from(set));
}

// =============================================================
//  Nguyên liệu cho câu đố
// =============================================================
const EMOJIS = [
  '🍎', '🍌', '🍇', '🍉', '🍓', '🍍', '⭐', '🔥', '🌟', '🎯',
  '🎲', '💎', '🍀', '🌙', '⚽', '🏀', '🎁', '🔑', '🔔', '🧩',
  '🐟', '🐢', '🦋', '🌵', '🍋', '🥕', '🌈', '☂️', '🧊', '🪙',
];

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
  '🐟': 'con cá',
  '🐢': 'con rùa',
  '🦋': 'con bướm',
  '🌵': 'cây xương rồng',
  '🍋': 'quả chanh',
  '🥕': 'củ cà rốt',
  '🌈': 'cầu vồng',
  '☂️': 'cái dù',
  '🧊': 'viên đá lạnh',
  '🪙': 'đồng xu',
};

// Nhóm từ để làm câu đố "chọn thứ khác loại" / "chọn thứ đúng nhóm".
// Các nhóm KHÔNG được có phần tử trùng nhau, nếu không câu đố sẽ mơ hồ.
const GROUPS = [
  { name: 'con vật', items: ['con mèo', 'con chó', 'con gà', 'con vịt', 'con cá', 'con bò', 'con dê', 'con ngựa'] },
  { name: 'trái cây', items: ['quả táo', 'quả chuối', 'quả xoài', 'quả cam', 'quả nho', 'quả dứa', 'quả ổi', 'quả mít'] },
  { name: 'màu sắc', items: ['màu đỏ', 'màu xanh', 'màu vàng', 'màu tím', 'màu đen', 'màu trắng', 'màu nâu', 'màu cam'] },
  { name: 'phương tiện', items: ['xe máy', 'xe đạp', 'xe buýt', 'tàu hoả', 'máy bay', 'xe tải', 'thuyền buồm', 'xe cứu thương'] },
  { name: 'đồ ăn', items: ['bánh mì', 'phở bò', 'cơm rang', 'bún chả', 'xôi gà', 'cháo gà', 'bánh cuốn', 'hủ tiếu'] },
  { name: 'nghề', items: ['bác sĩ', 'giáo viên', 'kỹ sư', 'ca sĩ', 'lái xe', 'đầu bếp', 'thợ điện', 'nông dân'] },
  { name: 'đồ dùng học tập', items: ['cái bút', 'quyển vở', 'cái thước', 'hộp bút', 'cục tẩy', 'quyển sách', 'cái compa', 'bút chì'] },
  { name: 'thời tiết', items: ['trời mưa', 'trời nắng', 'có sương', 'gió mùa', 'bão lớn', 'trời râm', 'mưa đá', 'nắng gắt'] },
];

// Từ đơn tiếng Việt dùng cho câu đố "từ nào nhiều/ít chữ nhất".
// Cần đủ nhiều độ dài khác nhau để câu trả lời luôn DUY NHẤT
// (bộ sinh tự nhóm theo số chữ nên chỉ cần mỗi nhóm có vài từ).
const WORDS = [
  // 2 chữ
  'xe', 'cá', 'tủ', 'bò', 'mì',
  // 3 chữ
  'mèo', 'hoa', 'bàn', 'ghế', 'mưa', 'bút', 'cửa', 'mây', 'núi', 'gió', 'nhà', 'lửa', 'đèn', 'cầu',
  // 4 chữ
  'nắng', 'sách', 'sông', 'bánh', 'vườn', 'quạt', 'chim', 'biển', 'kính', 'thóc',
  // 5 chữ
  'trăng', 'đường', 'chuối', 'khoai', 'chuột', 'thuốc', 'ruộng',
  // 6 chữ
  'giường', 'trường', 'thuyền', 'chuông', 'thưởng', 'khuyên',
  // 7 chữ
  'nghiêng', 'nghiệng'.slice(0, 7),
];

// =============================================================
//  12 bộ sinh câu đố
//  Mỗi bộ trả về: { type, question, hint, options:string[], answer:string }
//  Tham số: n = số đáp án mong muốn, d = độ khó (1..3)
// =============================================================

// 1) Bấm đúng biểu tượng được gọi tên
function makeEmojiPuzzle(n) {
  const pool = pickMany(EMOJIS, n);
  const answer = pickOne(pool);
  return {
    type: 'emoji',
    question: `Hãy bấm vào **${EMOJI_NAMES[answer] || 'biểu tượng'}** ${answer}`,
    hint: 'Chọn đúng biểu tượng được yêu cầu.',
    options: pool,
    answer,
  };
}

// 2) Phép tính
function makeMathPuzzle(n, d = 2) {
  const styles = d >= 3 ? [0, 1, 2, 3, 4] : d === 1 ? [0, 1] : [0, 1, 2, 3];
  const style = pickOne(styles);
  let text = '';
  let value = 0;

  if (style === 0) {
    const a = randBetween(d >= 3 ? 45 : 11, d >= 3 ? 199 : 49);
    const b = randBetween(d >= 3 ? 45 : 11, d >= 3 ? 199 : 49);
    value = a + b;
    text = `${a} + ${b}`;
  } else if (style === 1) {
    const a = randBetween(d >= 3 ? 120 : 30, d >= 3 ? 320 : 90);
    const b = randBetween(5, Math.max(6, Math.floor(a / 2)));
    value = a - b;
    text = `${a} − ${b}`;
  } else if (style === 2) {
    const a = randBetween(3, d >= 3 ? 19 : 9);
    const b = randBetween(3, d >= 3 ? 15 : 9);
    value = a * b;
    text = `${a} × ${b}`;
  } else if (style === 3) {
    const b = randBetween(2, 12);
    value = randBetween(2, 15);
    text = `${b * value} : ${b}`;
  } else {
    // Hai phép tính lồng nhau (chỉ ở mức khó)
    const a = randBetween(2, 9);
    const b = randBetween(2, 9);
    const c = randBetween(2, 30);
    value = a * b + c;
    text = `${a} × ${b} + ${c}`;
  }

  return {
    type: 'math',
    question: `**${text} = ?**`,
    hint: 'Chọn đúng kết quả phép tính.',
    options: numberOptions(value, n, Math.max(4, Math.round(Math.abs(value) * 0.2) + 3), { min: 0 }),
    answer: String(value),
  };
}

// 3) Dãy số
function makeSequencePuzzle(n, d = 2) {
  const kind = d >= 3 ? pickOne(['add', 'mul', 'grow']) : d === 1 ? 'add' : pickOne(['add', 'add', 'grow']);
  const items = [];
  let value = 0;

  if (kind === 'mul') {
    const start = randBetween(2, 5);
    const ratio = randBetween(2, 3);
    let cur = start;
    for (let i = 0; i < 4; i++) {
      items.push(cur);
      cur *= ratio;
    }
    value = cur;
  } else if (kind === 'grow') {
    // Bước tăng dần: +2, +3, +4...
    let cur = randBetween(1, 9);
    let step = randBetween(2, 4);
    for (let i = 0; i < 4; i++) {
      items.push(cur);
      cur += step;
      step += 1;
    }
    value = cur;
  } else {
    const start = randBetween(2, 15);
    const step = randBetween(2, 12);
    for (let i = 0; i < 4; i++) items.push(start + step * i);
    value = start + step * 4;
  }

  return {
    type: 'sequence',
    question: `Dãy số: **${items.join(', ')}, ?** — số tiếp theo là gì?`,
    hint: 'Tìm quy luật của dãy số.',
    options: numberOptions(value, n, Math.max(3, Math.round(value * 0.25)), { min: 1 }),
    answer: String(value),
  };
}

// 4) Đếm biểu tượng
function makeCountPuzzle(n, d = 2) {
  const target = pickOne(EMOJIS);
  const others = pickMany(EMOJIS.filter((e) => e !== target), 4);
  const count = randBetween(2, d >= 3 ? 9 : 6);
  const line = [];
  for (let i = 0; i < count; i++) line.push(target);
  const noise = randBetween(3, d >= 3 ? 11 : 7);
  for (let i = 0; i < noise; i++) line.push(pickOne(others));

  return {
    type: 'count',
    question: `Có bao nhiêu ${target} trong dãy sau?\n# ${shuffled(line).join(' ')}`,
    hint: 'Đếm số lần biểu tượng đó xuất hiện.',
    options: numberOptions(count, n, 3, { min: 1, max: count + noise }),
    answer: String(count),
  };
}

// 5) Chọn thứ KHÁC LOẠI
function makeOddOnePuzzle(n) {
  const groups = shuffled(GROUPS);
  const main = groups[0];
  const other = groups[1];
  const keep = Math.max(2, Math.min(main.items.length, n - 1));
  const items = pickMany(main.items, keep);
  const odd = pickOne(other.items);
  return {
    type: 'oddone',
    question: `Trong các lựa chọn dưới đây, **thứ nào KHÁC LOẠI** với những thứ còn lại?`,
    hint: `Những lựa chọn kia đều cùng nhóm "${main.name}".`,
    options: shuffled(items.concat([odd])),
    answer: odd,
  };
}

// 6) Biểu tượng ở vị trí thứ mấy (đếm từ trái hoặc từ phải)
function makePositionPuzzle(n, d = 2) {
  const len = Math.max(4, Math.min(9, (d >= 3 ? 7 : 5) + randBetween(0, 2)));
  const line = pickMany(EMOJIS, len); // EMOJIS không trùng nên dãy cũng không trùng
  const fromLeft = coin();
  const pos = randBetween(1, line.length);
  const answer = fromLeft ? line[pos - 1] : line[line.length - pos];
  // Đáp án nhiễu lấy từ chính dãy -> người chơi bắt buộc phải đếm thật.
  const others = shuffled(line.filter((e) => e !== answer)).slice(0, Math.max(2, n - 1));
  return {
    type: 'position',
    question: `Trong dãy sau, biểu tượng ở **vị trí thứ ${pos} tính từ ${
      fromLeft ? 'BÊN TRÁI' : 'BÊN PHẢI'
    }** là gì?\n# ${line.join(' ')}`,
    hint: 'Đếm theo đúng chiều được yêu cầu.',
    options: shuffled(others.concat([answer])),
    answer,
  };
}

// 7) So sánh: số lớn nhất / nhỏ nhất
function makeComparePuzzle(n, d = 2) {
  const wantMax = coin();
  const lo = d >= 3 ? 1000 : 100;
  const hi = d >= 3 ? 99999 : 9999;
  const set = new Set();
  let guard = 0;
  while (set.size < Math.max(3, n) && guard++ < 400) set.add(randBetween(lo, hi));
  const nums = Array.from(set);
  const answer = wantMax ? Math.max(...nums) : Math.min(...nums);
  return {
    type: 'compare',
    question: `Số nào dưới đây **${wantMax ? 'LỚN NHẤT' : 'NHỎ NHẤT'}**?`,
    hint: 'So sánh giá trị các số.',
    options: shuffled(nums.map(String)),
    answer: String(answer),
  };
}

// 8) Chọn số chẵn / số lẻ (chỉ có DUY NHẤT một đáp án đúng)
function makeParityPuzzle(n, d = 2) {
  const wantEven = coin();
  const lo = d >= 3 ? 1000 : 10;
  const hi = d >= 3 ? 9999 : 99;
  const isWanted = (v) => (v % 2 === 0) === wantEven;

  let answer = randBetween(lo, hi);
  if (!isWanted(answer)) answer = answer + 1 > hi ? answer - 1 : answer + 1;

  const set = new Set([String(answer)]);
  let guard = 0;
  while (set.size < Math.max(3, n) && guard++ < 500) {
    const v = randBetween(lo, hi);
    if (isWanted(v)) continue; // các đáp án còn lại PHẢI khác tính chẵn/lẻ
    set.add(String(v));
  }
  return {
    type: 'parity',
    question: `Số nào dưới đây là **số ${wantEven ? 'CHẴN' : 'LẺ'}**?`,
    hint: wantEven ? 'Số chẵn chia hết cho 2.' : 'Số lẻ không chia hết cho 2.',
    options: shuffled(Array.from(set)),
    answer: String(answer),
  };
}

// 9) Chọn thứ THUỘC một nhóm cho trước
function makeCategoryPuzzle(n) {
  const groups = shuffled(GROUPS);
  const main = groups[0];
  const answer = pickOne(main.items);
  const pool = [];
  for (const g of groups.slice(1)) pool.push(...g.items);
  const distract = pickMany(pool, Math.max(2, n - 1));
  return {
    type: 'category',
    question: `Lựa chọn nào dưới đây thuộc nhóm **"${main.name}"**?`,
    hint: 'Chỉ có duy nhất một đáp án đúng nhóm.',
    options: shuffled(distract.concat([answer])),
    answer,
  };
}

// 10) Toán bằng biểu tượng: 🍎 = 4, 🍌 = 7 -> 🍎 + 🍌 = ?
function makeEmojiMathPuzzle(n, d = 2) {
  const syms = pickMany(EMOJIS, d >= 3 ? 3 : 2);
  const vals = syms.map(() => randBetween(2, d >= 3 ? 15 : 9));
  let text = '';
  let value = 0;
  if (syms.length === 3) {
    text = `${syms[0]} + ${syms[1]} + ${syms[2]}`;
    value = vals[0] + vals[1] + vals[2];
  } else if (coin()) {
    text = `${syms[0]} + ${syms[1]}`;
    value = vals[0] + vals[1];
  } else {
    text = `${syms[0]} × ${syms[1]}`;
    value = vals[0] * vals[1];
  }
  const legend = syms.map((s, i) => `${s} = **${vals[i]}**`).join(' • ');
  return {
    type: 'emojimath',
    question: `Biết ${legend}\nVậy **${text} = ?**`,
    hint: 'Thay biểu tượng bằng số rồi tính.',
    options: numberOptions(value, n, Math.max(3, Math.round(value * 0.3)), { min: 0 }),
    answer: String(value),
  };
}

// 11) Từ nào nhiều chữ nhất / ít chữ nhất (đáp án luôn DUY NHẤT)
function makeWordPuzzle(n) {
  const wantLongest = coin();
  const byLen = new Map();
  for (const w of WORDS) {
    const L = letterCount(w);
    if (!byLen.has(L)) byLen.set(L, []);
    if (!byLen.get(L).includes(w)) byLen.get(L).push(w);
  }
  const lens = shuffled(Array.from(byLen.keys()));
  const want = Math.max(3, Math.min(n, lens.length));
  const chosenLens = lens.slice(0, want).sort((a, b) => a - b);
  if (chosenLens.length < 3) return makeCategoryPuzzle(n); // dữ liệu quá ít -> đổi kiểu
  const words = chosenLens.map((L) => pickOne(byLen.get(L)));
  const answer = wantLongest ? words[words.length - 1] : words[0];
  return {
    type: 'word',
    question: `Từ nào dưới đây có **${wantLongest ? 'NHIỀU' : 'ÍT'} chữ cái nhất**?`,
    hint: 'Đếm số chữ cái của từng từ (không tính dấu).',
    options: shuffled(words),
    answer,
  };
}

// 12) Đồng hồ: cộng thêm phút
function makeClockPuzzle(n, d = 2) {
  const pad = (v) => String(v).padStart(2, '0');
  const h = randBetween(0, 23);
  const m = pickOne([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50]);
  const add = pickOne(d >= 3 ? [35, 40, 50, 70, 85, 95, 110, 125] : [15, 20, 25, 30, 45, 60, 75, 90]);
  const total = h * 60 + m + add;
  const fmt = (mins) => {
    const x = ((mins % 1440) + 1440) % 1440;
    return `${pad(Math.floor(x / 60))}:${pad(x % 60)}`;
  };
  const answer = fmt(total);
  const set = new Set([answer]);
  let guard = 0;
  while (set.size < Math.max(3, n) && guard++ < 400) {
    const shift = pickOne([-70, -60, -45, -30, -20, -15, -10, 10, 15, 20, 30, 45, 60, 70]);
    set.add(fmt(total + shift));
  }
  return {
    type: 'clock',
    question: `Bây giờ là **${pad(h)}:${pad(m)}**. Sau **${add} phút** nữa là mấy giờ?`,
    hint: 'Cộng thêm số phút rồi đổi sang giờ:phút.',
    options: shuffled(Array.from(set)),
    answer,
  };
}

const GENERATORS = [
  makeEmojiPuzzle,
  makeMathPuzzle,
  makeSequencePuzzle,
  makeCountPuzzle,
  makeOddOnePuzzle,
  makePositionPuzzle,
  makeComparePuzzle,
  makeParityPuzzle,
  makeCategoryPuzzle,
  makeEmojiMathPuzzle,
  makeWordPuzzle,
  makeClockPuzzle,
];

const BY_TYPE = {
  emoji: makeEmojiPuzzle,
  math: makeMathPuzzle,
  sequence: makeSequencePuzzle,
  count: makeCountPuzzle,
  oddone: makeOddOnePuzzle,
  position: makePositionPuzzle,
  compare: makeComparePuzzle,
  parity: makeParityPuzzle,
  category: makeCategoryPuzzle,
  emojimath: makeEmojiMathPuzzle,
  word: makeWordPuzzle,
  clock: makeClockPuzzle,
};

const TYPES = Object.keys(BY_TYPE);

// Tên tiếng Việt của từng kiểu câu đố (dùng cho bảng thống kê).
const TYPE_LABELS = {
  emoji: 'Bấm đúng biểu tượng',
  math: 'Phép tính',
  sequence: 'Dãy số',
  count: 'Đếm biểu tượng',
  oddone: 'Chọn thứ khác loại',
  position: 'Vị trí trong dãy',
  compare: 'So sánh số',
  parity: 'Số chẵn / số lẻ',
  category: 'Chọn đúng nhóm',
  emojimath: 'Toán bằng biểu tượng',
  word: 'Đếm chữ trong từ',
  clock: 'Xem giờ',
};

// =============================================================
//  Chuẩn hoá câu đố: đáp án luôn nằm trong danh sách, không trùng,
//  không quá dài, không quá nhiều nút. Đây là chốt an toàn cuối cùng
//  để Discord KHÔNG BAO GIỜ từ chối tin nhắn câu đố.
// =============================================================
function normalizePuzzle(puzzle, maxOptions) {
  const answer = String(puzzle.answer);
  const seen = new Set([answer]);
  const options = [answer];
  for (const raw of Array.isArray(puzzle.options) ? puzzle.options : []) {
    const s = String(raw);
    if (!s.length || s.length > MAX_LABEL) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    options.push(s);
    if (options.length >= maxOptions) break;
  }
  puzzle.answer = answer;
  puzzle.options = shuffled(options);
  return puzzle;
}

/**
 * Tạo một câu đố ngẫu nhiên.
 * @param {object} opts
 *   - type       : chỉ định kiểu câu đố (xem TYPES)
 *   - maxOptions : số nút đáp án tối đa (3..10, mặc định 5)
 *   - difficulty : 1 dễ / 2 thường / 3 khó
 * @returns {{type:string, question:string, hint:string, options:string[], answer:string}}
 */
function makePuzzle(opts = {}) {
  const maxOptions = clampInt(opts.maxOptions, 3, 10, 5);
  const difficulty = clampInt(opts.difficulty, 1, 3, 2);
  const wanted = String(opts.type || '').toLowerCase();
  const gen = BY_TYPE[wanted] || pickOne(GENERATORS);

  let puzzle = null;
  try {
    puzzle = gen(maxOptions, difficulty);
  } catch {
    puzzle = null;
  }
  if (!puzzle || !puzzle.question || puzzle.answer == null) puzzle = makeMathPuzzle(maxOptions, difficulty);
  puzzle = normalizePuzzle(puzzle, maxOptions);

  // Câu đố phải có ít nhất 3 lựa chọn mới đủ khó -> nếu bộ sinh lỗi thì
  // đổi sang phép tính (luôn sinh được số lượng đáp án mong muốn).
  if (puzzle.options.length < 3) {
    puzzle = normalizePuzzle(makeMathPuzzle(maxOptions, difficulty), maxOptions);
  }
  puzzle.difficulty = difficulty;
  puzzle.label = TYPE_LABELS[puzzle.type] || 'Câu đố';
  return puzzle;
}

// =============================================================
//  Bộ nhớ tạm: phiên đang mở + lịch sử trả lời của từng người
// =============================================================
const sessions = new Map(); // userId -> { nonce, startedAt, expiresAt }
const history = new Map(); // userId -> { issued, passed, failed, streak, lastAt, lockedUntil }
const totals = { issued: 0, passed: 0, failed: 0, locked: 0, tooFast: 0, timeout: 0, wrong: 0, error: 0 };

function getHistory(userId, now = Date.now()) {
  const key = String(userId || '');
  if (!key) return { issued: 0, passed: 0, failed: 0, streak: 0, lastAt: 0, lockedUntil: 0 };
  let h = history.get(key);
  if (!h) {
    h = { issued: 0, passed: 0, failed: 0, streak: 0, lastAt: now, lockedUntil: 0 };
    history.set(key, h);
  }
  return h;
}

// Dọn bộ nhớ: bot chạy 24/7 nên phải chủ động thu gọn hai Map ở trên.
function prune(now = Date.now()) {
  let removed = 0;
  for (const [uid, s] of sessions) {
    if (!s || s.expiresAt < now - 60000) {
      sessions.delete(uid);
      removed++;
    }
  }
  for (const [, h] of history) {
    if (h.lockedUntil && h.lockedUntil <= now) h.lockedUntil = 0;
  }
  if (history.size > MAX_TRACKED) {
    const olds = Array.from(history.entries()).sort((a, b) => (a[1].lastAt || 0) - (b[1].lastAt || 0));
    const drop = olds.slice(0, history.size - MAX_TRACKED);
    for (const [uid] of drop) {
      history.delete(uid);
      removed++;
    }
  }
  return removed;
}

function lockInfo(userId, now = Date.now()) {
  const h = history.get(String(userId || ''));
  if (!h || !h.lockedUntil || h.lockedUntil <= now) return { locked: false, until: 0, remaining: 0 };
  return { locked: true, until: h.lockedUntil, remaining: h.lockedUntil - now };
}

function isLocked(userId, now = Date.now()) {
  return lockInfo(userId, now).locked;
}

function clearLock(userId) {
  const h = history.get(String(userId || ''));
  if (!h) return false;
  h.lockedUntil = 0;
  h.streak = 0;
  return true;
}

function hasActive(userId, now = Date.now()) {
  const s = sessions.get(String(userId || ''));
  return Boolean(s && s.expiresAt > now);
}

function reset(userId) {
  const key = String(userId || '');
  sessions.delete(key);
  return history.delete(key);
}

function stats() {
  return {
    ...totals,
    active: sessions.size,
    tracked: history.size,
    types: TYPES.length,
  };
}

// =============================================================
//  Dựng nút bấm: chia đều thành nhiều hàng (tối đa 5 nút / hàng)
// =============================================================
function buildRows(puzzle, nonce, disabled = false) {
  const opts = Array.isArray(puzzle.options) ? puzzle.options : [];
  const total = opts.length;
  // 1..5 nút -> 1 hàng; 6..10 nút -> 2 hàng chia đều cho cân đối.
  const perRow = total <= MAX_PER_ROW ? total : Math.ceil(total / 2);
  const rows = [];
  let row = new ActionRowBuilder();
  opts.forEach((opt, idx) => {
    if (row.components.length >= Math.min(MAX_PER_ROW, perRow)) {
      rows.push(row);
      row = new ActionRowBuilder();
    }
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`cap:${nonce}:${idx}`)
        .setLabel(String(opt).slice(0, 60) || '?')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(Boolean(disabled)),
    );
  });
  if (row.components.length) rows.push(row);
  return rows.slice(0, 5); // Discord: tối đa 5 hàng
}

// =============================================================
//  Dựng embed câu đố
// =============================================================
function buildEmbed(puzzle, o) {
  const lines = [];
  if (o.introText) {
    lines.push(String(o.introText));
  } else {
    lines.push('Hệ thống thấy cách **dùng lệnh** của bạn giống máy tự động.');
    lines.push('Hãy giải câu đố nhỏ này để chứng minh bạn là người thật.');
  }
  lines.push('', puzzle.question);

  const emb = Embed.custom(colors.warning, '🧩 Xác minh người thật', lines.join('\n')).addFields(
    { name: '⏳ Hết hạn', value: `<t:${Math.floor(o.expiresAt / 1000)}:R>`, inline: true },
    { name: '🔁 Lượt', value: `${o.attempt}/${o.attempts}`, inline: true },
    { name: '🧠 Dạng câu đố', value: puzzle.label || 'Câu đố', inline: true },
    { name: '💡 Gợi ý', value: puzzle.hint || 'Chọn đáp án đúng.', inline: false },
  );

  if (o.lastReason === 'wrong') {
    emb.addFields({
      name: '❗ Lượt trước sai',
      value: `Bạn chọn sai đáp án nên hệ thống đổi **câu đố mới**. Còn **${Math.max(
        0,
        o.attempts - o.attempt + 1,
      )}** lượt.`,
    });
  }
  if (o.reasonText) emb.addFields({ name: 'ℹ️ Dấu hiệu bị nghi', value: String(o.reasonText).slice(0, 1000) });
  emb.setFooter({
    text: 'Chỉ người được hỏi mới bấm được • Bấm nhanh hơn sức người cũng bị tính là trượt',
  });
  return emb;
}

// =============================================================
//  Hỏi MỘT lượt và chờ người chơi bấm
// =============================================================
function askRound(msg, puzzle, o) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const answerIndex = puzzle.options.indexOf(puzzle.answer);
    let settled = false;
    let collector = null;

    const finish = (out) => {
      if (settled) return;
      settled = true;
      try {
        if (collector) collector.stop('answered');
      } catch {
        /* bỏ qua */
      }
      resolve(out);
    };

    try {
      collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: o.timeoutMs });
    } catch {
      resolve({ ok: false, reason: 'error', ms: 0 });
      return;
    }

    collector.on('collect', async (i) => {
      try {
        const id = String(i.customId || '');
        if (!id.startsWith('cap:')) return;
        const parts = id.split(':');
        // cap : nonce : lượt : chỉ số đáp án
        if (`${parts[1]}:${parts[2]}` !== o.nonce) {
          // Nút của lượt trước (người chơi bấm chậm) -> bỏ qua, không tính.
          await i.deferUpdate().catch(() => {});
          return;
        }
        // Người khác bấm hộ thì không được tính.
        if (o.userId && String(i.user.id) !== o.userId) {
          await i
            .reply({ content: 'Câu đố này không dành cho bạn nhé.', flags: MessageFlags.Ephemeral })
            .catch(() => {});
          return;
        }
        await i.deferUpdate().catch(() => {});

        const now = Date.now();
        const ms = now - startedAt;

        // Rải chuột: bấm liên tiếp nhiều nút trong tích tắc -> chắc chắn là máy.
        const gap = o.state.lastClickAt ? now - o.state.lastClickAt : Infinity;
        o.state.lastClickAt = now;
        o.state.clicks += 1;
        if (gap < o.multiClickMs) return finish({ ok: false, reason: 'too_fast', ms, machine: 'rải chuột' });

        // Bấm nhanh hơn sức người đọc kịp câu hỏi -> là máy, dù bấm đúng.
        if (ms < o.minAnswerMs) return finish({ ok: false, reason: 'too_fast', ms, machine: 'bấm quá nhanh' });

        const picked = Number(parts[3]);
        if (Number.isInteger(picked) && picked === answerIndex) return finish({ ok: true, reason: 'passed', ms });
        return finish({ ok: false, reason: 'wrong', ms });
      } catch {
        return finish({ ok: false, reason: 'error', ms: Date.now() - startedAt });
      }
    });

    collector.on('end', (_collected, reason) => {
      if (settled) return;
      settled = true;
      // 'answered' là mã nội bộ khi đã có kết quả (không bao giờ tới đây).
      // 'time'/'idle' = hết giờ thật; các mã khác (tin nhắn/kênh bị xoá) = lỗi.
      const timedOut = reason === 'time' || reason === 'idle' || reason === 'limit' || reason === 'user';
      resolve({ ok: false, reason: timedOut ? 'timeout' : 'error', ms: Date.now() - startedAt });
    });
  });
}

// =============================================================
//  Embed kết quả cuối
// =============================================================
function buildResultEmbed(result, puzzle, o) {
  const outcome = {
    passed: {
      color: colors.success,
      title: '✅ Xác minh thành công',
      desc: 'Cảm ơn bạn! Bạn có thể tiếp tục chơi bình thường.',
    },
    wrong: {
      color: colors.error,
      title: '❌ Sai đáp án',
      desc: `Bạn đã dùng hết **${o.attempts}** lượt trả lời.\nĐáp án đúng của câu cuối là **${puzzle ? puzzle.answer : '?'}**.`,
    },
    too_fast: {
      color: colors.error,
      title: '❌ Trả lời quá nhanh',
      desc: 'Bạn bấm nhanh hơn mức con người đọc kịp câu hỏi nên lần này không được tính.',
    },
    timeout: { color: colors.error, title: '⏰ Hết thời gian', desc: 'Bạn không trả lời kịp câu đố.' },
    locked: {
      color: colors.error,
      title: '🔒 Tạm khoá xác minh',
      desc: 'Bạn đã trượt xác minh quá nhiều lần liên tiếp. Vui lòng thử lại sau.',
    },
    busy: {
      color: colors.warning,
      title: '⏳ Đang có câu đố khác',
      desc: 'Bạn đang có một câu đố chưa trả lời. Hãy hoàn thành câu đó trước.',
    },
    error: { color: colors.warning, title: '⚠️ Không xác minh được', desc: 'Có lỗi khi xác minh. Vui lòng thử lại.' },
  };
  const info = outcome[result.reason] || outcome.error;
  const emb = Embed.custom(info.color, info.title, info.desc).addFields(
    {
      name: '⏱️ Thời gian trả lời',
      value: result.ms > 0 ? `${(result.ms / 1000).toFixed(2)}s` : '—',
      inline: true,
    },
    { name: '🔁 Đã dùng', value: `${result.attempt || 0}/${o.attempts} lượt`, inline: true },
  );
  if (result.machine) emb.addFields({ name: '🤖 Dấu hiệu máy', value: String(result.machine), inline: true });
  return emb;
}

/**
 * Gửi câu đố và chờ người chơi trả lời.
 *
 * @param {object} ctx CommandContext (hoặc bất kỳ đối tượng có reply/author)
 * @param {object} opts
 *   - timeoutMs     : thời gian chờ MỖI câu (mặc định 50000)
 *   - minAnswerMs   : trả lời nhanh hơn mức này coi như máy (mặc định 450)
 *   - attempts      : số lượt trả lời, mỗi lượt một câu mới (mặc định 2)
 *   - maxOptions    : số nút đáp án (3..10)
 *   - difficulty    : 1 dễ / 2 thường / 3 khó
 *   - reasonText    : mô tả dấu hiệu bị nghi (hiện trong embed)
 *   - introText     : câu dẫn thay cho câu mặc định
 *   - deleteAfterMs : sau bao lâu thì xoá tin nhắn câu đố (0 = không xoá)
 *   - type          : chỉ định kiểu câu đố
 *   - userId        : ghi đè người phải trả lời
 * @returns {Promise<{ok:boolean, reason:string, ms:number, type:string, attempt:number,
 *                    attempts:number, message:object|null, lockedUntil?:number}>}
 *   reason: 'passed' | 'wrong' | 'too_fast' | 'timeout' | 'locked' | 'busy' | 'error'
 */
async function challenge(ctx, opts = {}) {
  const timeoutMs = clampNum(opts.timeoutMs, 8000, 300000, DEFAULTS.timeoutMs);
  const minAnswerMs = clampNum(opts.minAnswerMs, 0, 5000, DEFAULTS.minAnswerMs);
  const attempts = clampInt(opts.attempts, 1, 5, DEFAULTS.attempts);
  const difficulty = clampInt(opts.difficulty, 1, 3, DEFAULTS.difficulty);
  const maxOptions = clampInt(opts.maxOptions, 3, 10, difficulty >= 3 ? 8 : difficulty === 1 ? 4 : DEFAULTS.maxOptions);
  const multiClickMs = clampNum(opts.multiClickMs, 0, 3000, DEFAULTS.multiClickMs);
  const lockAfterFails = clampInt(opts.lockAfterFails, 2, 20, DEFAULTS.lockAfterFails);
  const lockMs = clampNum(opts.lockMs, 0, 24 * 60 * 60 * 1000, DEFAULTS.lockMs);
  const deleteAfterMs = Number(opts.deleteAfterMs);
  const userId = String((ctx && ctx.author && ctx.author.id) || opts.userId || '');

  const now = Date.now();
  prune(now);

  // --- Đang bị khoá vì trượt quá nhiều lần liên tiếp ---
  const lock = lockInfo(userId, now);
  if (lock.locked) {
    totals.locked += 1;
    return {
      ok: false,
      reason: 'locked',
      ms: 0,
      type: '',
      attempt: 0,
      attempts,
      message: null,
      lockedUntil: lock.until,
    };
  }

  // --- Đang có câu đố khác chưa trả lời -> không gửi thêm (chống spam) ---
  if (userId && hasActive(userId, now) && opts.allowParallel !== true) {
    return { ok: false, reason: 'busy', ms: 0, type: '', attempt: 0, attempts, message: null };
  }

  const nonceBase = rng.randomHex(8);
  if (userId) sessions.set(userId, { nonce: nonceBase, startedAt: now, expiresAt: now + timeoutMs * attempts + 5000 });

  const hist = getHistory(userId, now);
  hist.issued += 1;
  hist.lastAt = now;
  totals.issued += 1;

  const state = { lastClickAt: 0, clicks: 0 };
  let msg = null;
  let puzzle = null;
  let result = { ok: false, reason: 'error', ms: 0, attempt: 0 };

  try {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      puzzle = makePuzzle({ type: opts.type, maxOptions, difficulty });
      const nonce = `${nonceBase}:${attempt}`;
      const expiresAt = Date.now() + timeoutMs;
      const payload = {
        embeds: [
          buildEmbed(puzzle, {
            ...opts,
            timeoutMs,
            expiresAt,
            attempt,
            attempts,
            lastReason: attempt > 1 ? result.reason : '',
          }),
        ],
        components: buildRows(puzzle, nonce),
      };

      if (!msg) {
        try {
          msg = await ctx.reply({ content: userId ? `<@${userId}>` : undefined, ...payload });
        } catch {
          result = { ok: false, reason: 'error', ms: 0, attempt };
          break;
        }
        if (!msg || typeof msg.createMessageComponentCollector !== 'function') {
          result = { ok: false, reason: 'error', ms: 0, attempt };
          break;
        }
      } else {
        const edited = await Promise.resolve()
          .then(() => msg.edit(payload))
          .catch(() => null);
        if (!edited) {
          result = { ...result, attempt };
          break;
        }
      }

      const round = await askRound(msg, puzzle, {
        nonce,
        userId,
        timeoutMs,
        minAnswerMs,
        multiClickMs,
        state,
      });
      result = { ...round, attempt };

      if (round.ok) break;
      // Chỉ SAI ĐÁP ÁN mới được thử lại. Quá nhanh / hết giờ / lỗi thì dừng:
      // người thật không bấm nhanh hơn máy, cũng không bỏ mặc câu đố.
      if (round.reason !== 'wrong' || attempt >= attempts) break;
    }
  } finally {
    if (userId) sessions.delete(userId);
  }

  // --- Ghi lịch sử & khoá nếu trượt liên tiếp quá nhiều ---
  if (result.ok) {
    hist.passed += 1;
    hist.streak = 0;
    totals.passed += 1;
  } else {
    hist.failed += 1;
    hist.streak += 1;
    totals.failed += 1;
    if (result.reason === 'too_fast') totals.tooFast += 1;
    else if (result.reason === 'timeout') totals.timeout += 1;
    else if (result.reason === 'wrong') totals.wrong += 1;
    else totals.error += 1;
    // Lỗi kỹ thuật (không phải do người chơi) thì KHÔNG tính vào chuỗi trượt.
    if (result.reason === 'error') hist.streak = Math.max(0, hist.streak - 1);
    if (hist.streak >= lockAfterFails && lockMs > 0) {
      hist.lockedUntil = Date.now() + lockMs;
      hist.streak = 0;
    }
  }
  hist.lastAt = Date.now();

  // --- Cập nhật lại tin nhắn cho người chơi biết kết quả ---
  if (msg) {
    const finalEmbed = buildResultEmbed(result, puzzle, { attempts });
    await Promise.resolve()
      .then(() => msg.edit({ content: '', embeds: [finalEmbed], components: [] }))
      .catch(() => {});

    if (Number.isFinite(deleteAfterMs) && deleteAfterMs > 0) {
      const t = setTimeout(() => {
        Promise.resolve()
          .then(() => msg.delete())
          .catch(() => {});
      }, deleteAfterMs);
      if (t && typeof t.unref === 'function') t.unref();
    }
  }

  return {
    ok: Boolean(result.ok),
    reason: result.reason || 'error',
    ms: Number(result.ms) || 0,
    type: puzzle ? puzzle.type : '',
    attempt: Number(result.attempt) || 0,
    attempts,
    clicks: state.clicks,
    message: msg || null,
  };
}

module.exports = {
  challenge,
  makePuzzle,
  buildRows,
  buildEmbed,
  DEFAULTS,
  TYPES,
  TYPE_LABELS,
  EMOJIS,
  EMOJI_NAMES,
  GROUPS,
  WORDS,
  // Quản lý phiên & chống lạm dụng
  isLocked,
  lockInfo,
  clearLock,
  hasActive,
  reset,
  prune,
  stats,
  // xuất để kiểm thử
  _internals: { shuffled, pickOne, randBetween, letterCount, numberOptions, normalizePuzzle, GENERATORS, sessions, history },
};
