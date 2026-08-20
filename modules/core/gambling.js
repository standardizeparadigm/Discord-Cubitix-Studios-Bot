// =============================================================
//  gambling - tiện ích chung cho các lệnh cờ bạc (slots, blackjack, coinflip)
//  - Giới hạn cược tối đa thống nhất: 250.000 xu (áp dụng cả khi cược 'all')
// =============================================================

// Mức cược tối đa cho mọi lệnh cờ bạc
const MAX_BET = 250000;

// Các từ khóa nghĩa là "cược tất cả"
const ALL_WORDS = ['all', 'allin', 'max', 'tat', 'tatca', 'tatcah', 'het', 'tất', 'tấtcả', 'hết'];

function isAllWord(s) {
  return ALL_WORDS.includes(String(s).replace(/\s+/g, ''));
}

// Phân giải số tiền cược từ input người dùng.
// Trả về: { ok, bet, capped, reason, max }
//   - reason: 'invalid' | 'over' | 'insufficient' khi ok = false
//   - capped = true khi 'all' bị giới hạn xuống MAX_BET
function resolveBet(input, balance) {
  if (input === null || input === undefined) return { ok: false, reason: 'invalid', max: MAX_BET };
  const s = String(input).trim().toLowerCase();

  let bet;
  let all = false;
  if (isAllWord(s)) {
    all = true;
    bet = Math.min(balance, MAX_BET);
  } else {
    const digits = s.replace(/[.,\s]/g, '');
    // Phải là số nguyên thuần: trước đây parseInt('12abc') = 12 khiến người chơi
    // gõ sai vẫn bị trừ tiền theo một số họ không hề định cược.
    if (!/^\d+$/.test(digits)) return { ok: false, reason: 'invalid', max: MAX_BET };
    const n = parseInt(digits, 10);
    if (!Number.isSafeInteger(n)) return { ok: false, reason: 'invalid', max: MAX_BET };
    bet = n;
  }

  if (!Number.isFinite(bet) || bet <= 0) return { ok: false, reason: 'invalid', max: MAX_BET };
  if (!all && bet > MAX_BET) return { ok: false, reason: 'over', max: MAX_BET };
  if (balance < bet) return { ok: false, reason: 'insufficient', max: MAX_BET, balance };

  return { ok: true, bet, capped: all && balance > MAX_BET, max: MAX_BET };
}

module.exports = { MAX_BET, ALL_WORDS, isAllWord, resolveBet };
