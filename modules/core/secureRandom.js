// =============================================================
//  secureRandom - bộ sinh số ngẫu nhiên an toàn (CSPRNG) - PHIÊN BẢN NÂNG CẤP
//  Dùng module 'crypto' của Node -> không thể đoán/tính toán trước,
//  thay cho Math.random (vốn có thể dự đoán được).
//
//  Nâng cấp so với bản cũ:
//   - randomFloat dùng 53-bit entropy (đủ độ phân giải của số double,
//     lấy trực tiếp từ crypto.randomBytes) thay vì 32-bit -> mịn & ít lệch hơn.
//   - randomInt không lệch với mọi khoảng (rejection sampling cho khoảng lớn).
//   - Thêm tiện ích toàn diện: randomBytes, randomHex, randomString, uuid,
//     sample (lấy nhiều không trùng), weightedPick (theo trọng số), bool.
//
//  Giữ nguyên 100% API cũ: randomInt, randomIntRange, randomFloat, pick, shuffle, chance.
//  Dùng cho các game cờ bạc: blackjack, slots, mines, highlow, coinflip và các lệnh khác.
// =============================================================
const crypto = require('crypto');

// Giới hạn max cho crypto.randomInt (theo Node là 2^48).
const RANDOMINT_LIMIT = 2 ** 48;
const POW53 = 9007199254740992; // 2^53

// n byte ngẫu nhiên (trả về Buffer).
function randomBytes(n) {
  if (!Number.isInteger(n) || n <= 0) throw new RangeError('randomBytes: n phải là số nguyên dương');
  return crypto.randomBytes(n);
}

// Số nguyên KHÔNG lệch trong [0, max).
//  - max <= 2^48: dùng crypto.randomInt (đã rejection sampling sẵn).
//  - max lớn hơn: tự rejection sampling trên byte (vẫn nằm trong số nguyên an toàn).
function randomInt(max) {
  if (!Number.isInteger(max) || max <= 0) throw new RangeError('randomInt: max phải là số nguyên dương');
  if (max === 1) return 0;
  if (max <= RANDOMINT_LIMIT) return crypto.randomInt(max);
  if (max > Number.MAX_SAFE_INTEGER) throw new RangeError('randomInt: max vượt quá số nguyên an toàn');
  // Khoảng lớn: rejection sampling bằng BigInt (bit-op 64-bit, KHÔNG tràn 32-bit).
  const maxB = BigInt(max);
  const bytes = Math.ceil(Math.log2(max) / 8);
  const spanB = 1n << BigInt(bytes * 8);
  const limitB = spanB - (spanB % maxB); // ngưỡng loại bỏ để không lệch
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const buf = crypto.randomBytes(bytes);
    let v = 0n;
    for (let i = 0; i < bytes; i++) v = (v << 8n) | BigInt(buf[i]);
    if (v < limitB) return Number(v % maxB);
  }
}

// Số nguyên trong [min, max] (bao gồm cả hai đầu).
function randomIntRange(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  if (max < min) throw new RangeError('randomIntRange: max phải >= min');
  return min + randomInt(max - min + 1);
}

// Số thực trong [0, 1) với 53-bit entropy (đầy đủ độ phân giải double).
// Ghép 8 byte thành số 64-bit bằng BigInt (readBigUInt64BE) rồi lấy 53 bit cao.
// Dùng BigInt nên KHÔNG dính lỗi tràn 32-bit của phép toán bit trên Number.
function randomFloat() {
  const v64 = crypto.randomBytes(8).readBigUInt64BE(0); // BigInt trong [0, 2^64)
  const top53 = v64 >> 11n; // lấy 53 bit cao -> [0, 2^53)
  return Number(top53) / POW53; // POW53 = 2^53
}

// Chọn ngẫu nhiên một phần tử trong mảng.
function pick(arr) {
  if (!Array.isArray(arr) || arr.length === 0) throw new RangeError('pick: mảng rỗng');
  return arr[randomInt(arr.length)];
}

// Lấy k phần tử KHÁC NHAU (không lặp) từ mảng, dùng Fisher-Yates từng phần.
function sample(arr, k) {
  if (!Array.isArray(arr)) throw new RangeError('sample: cần một mảng');
  if (!Number.isInteger(k) || k < 0) throw new RangeError('sample: k không hợp lệ');
  if (k > arr.length) throw new RangeError('sample: k lớn hơn kích thước mảng');
  const a = arr.slice();
  for (let i = 0; i < k; i++) {
    const j = i + randomInt(a.length - i);
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a.slice(0, k);
}

// Xáo trộn Fisher-Yates bằng CSPRNG (trả về mảng mới, không đổi mảng gốc).
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

// Trả về true với xác suất prob (0..1).
function chance(prob) {
  return randomFloat() < prob;
}

// Trả về true/false với xác suất 50/50 (không lệch).
function bool() {
  return crypto.randomInt(2) === 0;
}

// Chọn theo trọng số: items[i] có trọng số weights[i] (>= 0, tổng > 0).
function weightedPick(items, weights) {
  if (!Array.isArray(items) || !Array.isArray(weights) || items.length === 0 || items.length !== weights.length) {
    throw new RangeError('weightedPick: items và weights phải cùng độ dài và không rỗng');
  }
  let total = 0;
  for (const w of weights) {
    if (!(typeof w === 'number' && w >= 0 && Number.isFinite(w))) throw new RangeError('weightedPick: trọng số phải là số >= 0');
    total += w;
  }
  if (total <= 0) throw new RangeError('weightedPick: tổng trọng số phải > 0');
  let r = randomFloat() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}

// Chuỗi hex ngẫu nhiên từ nBytes byte (độ dài chuỗi = nBytes * 2).
function randomHex(nBytes) {
  return randomBytes(nBytes).toString('hex');
}

// Chuỗi ngẫu nhiên độ dài len từ bộ ký tự alphabet (mặc định: chữ + số).
function randomString(len, alphabet) {
  if (!Number.isInteger(len) || len < 0) throw new RangeError('randomString: len không hợp lệ');
  const chars = alphabet || 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  if (chars.length === 0) throw new RangeError('randomString: alphabet rỗng');
  let out = '';
  for (let i = 0; i < len; i++) out += chars[randomInt(chars.length)];
  return out;
}

// UUID v4 ngẫu nhiên an toàn.
function uuid() {
  return crypto.randomUUID();
}

module.exports = {
  randomBytes,
  randomInt,
  randomIntRange,
  randomFloat,
  pick,
  sample,
  shuffle,
  chance,
  bool,
  weightedPick,
  randomHex,
  randomString,
  uuid,
};
