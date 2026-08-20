// =============================================================
//  questLogic - nhiệm vụ hàng ngày (hàm thuần, không dùng discord.js)
//
//  Bản LTS:
//   - Kho nhiệm vụ lớn, chia theo NHÓM (phân loại): câu cá, sòng bài,
//     kinh tế, trò chơi, cộng đồng.
//   - Mỗi ngày bốc ngẫu nhiên (CSPRNG) một bộ nhiệm vụ, ưu tiên trải đều
//     các nhóm để người chơi luôn có việc để làm ở nhiều mảng khác nhau.
//   - Tiến độ được GHI TRỰC TIẾP khi người chơi hành động (quests.track).
//   - Ngày được tính theo giờ Việt Nam, làm mới đúng 00:00.
//   - Thưởng thêm khi hoàn thành trọn một NHÓM, và thưởng lớn khi xong TẤT CẢ.
//
//  TƯƠNG THÍCH NGƯỢC: mọi id nhiệm vụ cũ đều được giữ nguyên nên dữ liệu
//  người chơi cũ (wallet.quest) vẫn hợp lệ, không ai bị mất tiến độ.
// =============================================================
const rng = require('./secureRandom');
const day = require('./dayCycle');

// Số nhiệm vụ mỗi ngày và tiền thưởng khi hoàn thành TOÀN BỘ.
const DAILY_COUNT = 6;
const ALL_DONE_BONUS = 2000;
const ALL_DONE_KEY = '__all__';

// Thưởng khi hoàn thành trọn vẹn một nhóm (chỉ tính nhóm có từ 2 nhiệm vụ trở lên).
const CATEGORY_BONUS = 400;
const CATEGORY_KEY_PREFIX = '__cat:';
const CATEGORY_MIN_TASKS = 2;

const fmt = (n) => Number(n || 0).toLocaleString('vi-VN');

// ---------------------------------------------------------------
//  Phân loại nhiệm vụ
// ---------------------------------------------------------------
const CATEGORIES = {
  fishing: { key: 'fishing', emoji: '🎣', label: 'Câu cá', color: 0x1abc9c, order: 1 },
  casino: { key: 'casino', emoji: '🎰', label: 'Sòng bài', color: 0xffd700, order: 2 },
  economy: { key: 'economy', emoji: '💰', label: 'Kinh tế', color: 0x2ecc71, order: 3 },
  games: { key: 'games', emoji: '🎮', label: 'Trò chơi', color: 0x9b59b6, order: 4 },
  social: { key: 'social', emoji: '🤝', label: 'Cộng đồng', color: 0xeb459e, order: 5 },
};

const CATEGORY_LIST = Object.values(CATEGORIES).sort((a, b) => a.order - b.order);

function categoryMeta(key) {
  return CATEGORIES[key] || CATEGORIES.economy;
}

// Nhãn độ khó theo bậc (tier) của nhiệm vụ.
// Mức độ khó chỉ còn tầm trung bình → hơi khó (bỏ hẳn bậc "Cực khó").
// Vẫn giữ 4 nhãn để dữ liệu lưu cũ (từng có tier = 3) không bị lệch nhãn.
const TIER_LABELS = ['Vừa', 'Hơi khó', 'Khó', 'Khó'];
function tierLabel(index) {
  return TIER_LABELS[Math.max(0, Math.min(TIER_LABELS.length - 1, index))];
}

// ---------------------------------------------------------------
//  Kho nhiệm vụ. Mỗi nhiệm vụ có nhiều mức độ khó (tiers);
//  mỗi ngày bốc ngẫu nhiên 1 mức — thưởng tương ứng độ khó.
//  counter: khoá bộ đếm được cộng qua quests.track(...)
// ---------------------------------------------------------------
const POOL = [
  // ================= CÂU CÁ =================
  {
    id: 'fish', category: 'fishing', emoji: '🎣', counter: 'fish',
    title: (t) => `Đi câu cá ${t} lần`,
    tiers: [{ target: 3, reward: 450 }, { target: 5, reward: 750 }, { target: 7, reward: 1050 }],
  },
  {
    id: 'fishValue', category: 'fishing', emoji: '🐟', counter: 'fishValue',
    title: (t) => `Câu được số cá trị giá ${fmt(t)} xu`,
    tiers: [{ target: 250, reward: 500 }, { target: 600, reward: 850 }, { target: 1000, reward: 1250 }],
  },
  {
    id: 'rareFish', category: 'fishing', emoji: '✨', counter: 'rareFish',
    title: (t) => (t === 1 ? 'Câu được 1 con cá hiếm trở lên' : `Câu được ${t} con cá hiếm trở lên`),
    tiers: [{ target: 1, reward: 600 }, { target: 2, reward: 1050 }],
  },
  {
    id: 'sell', category: 'fishing', emoji: '💰', counter: 'sellEarned',
    title: (t) => `Bán cá thu về ${fmt(t)} xu`,
    tiers: [{ target: 50, reward: 450 }, { target: 120, reward: 800 }, { target: 250, reward: 1200 }],
  },
  {
    id: 'fishNew', category: 'fishing', emoji: '🆕', counter: 'fishNew',
    title: (t) => (t === 1 ? 'Khám phá 1 loài cá mới' : `Khám phá ${t} loài cá mới`),
    tiers: [{ target: 1, reward: 550 }, { target: 2, reward: 950 }],
  },
  {
    id: 'epicFish', category: 'fishing', emoji: '🟣', counter: 'epicFish',
    title: (t) => (t === 1 ? 'Câu được 1 con Sử thi trở lên' : `Câu được ${t} con Sử thi trở lên`),
    tiers: [{ target: 1, reward: 900 }],
  },
  {
    id: 'fishSold', category: 'fishing', emoji: '🏪', counter: 'fishSold',
    title: (t) => `Bán ${fmt(t)} con cá ở chợ cá`,
    tiers: [{ target: 3, reward: 400 }, { target: 8, reward: 750 }, { target: 15, reward: 1150 }],
  },

  // ================= SÒNG BÀI =================
  {
    id: 'gamble', category: 'casino', emoji: '🎲', counter: 'gamble',
    title: (t) => `Chơi ${t} ván ở sòng bài`,
    tiers: [{ target: 3, reward: 400 }, { target: 5, reward: 700 }, { target: 8, reward: 1050 }],
  },
  {
    id: 'gambleWin', category: 'casino', emoji: '🏆', counter: 'gambleWin',
    title: (t) => `Thắng ${t} ván ở sòng bài`,
    tiers: [{ target: 1, reward: 500 }, { target: 2, reward: 900 }],
  },
  {
    id: 'slotsPlay', category: 'casino', emoji: '🎰', counter: 'slotsPlay',
    title: (t) => `Quay máy may mắn ${t} lần`,
    tiers: [{ target: 3, reward: 450 }, { target: 5, reward: 800 }],
  },
  {
    id: 'coinflipPlay', category: 'casino', emoji: '🪙', counter: 'coinflipPlay',
    title: (t) => `Cược tung đồng xu ${t} lần`,
    tiers: [{ target: 3, reward: 450 }, { target: 5, reward: 800 }],
  },
  {
    id: 'blackjackPlay', category: 'casino', emoji: '🃏', counter: 'blackjackPlay',
    title: (t) => `Chơi ${t} ván Blackjack`,
    tiers: [{ target: 2, reward: 500 }, { target: 3, reward: 800 }],
  },
  {
    id: 'minesPlay', category: 'casino', emoji: '💣', counter: 'minesPlay',
    title: (t) => `Chơi ${t} ván Dò mìn`,
    tiers: [{ target: 2, reward: 500 }, { target: 3, reward: 800 }],
  },
  {
    id: 'highlowPlay', category: 'casino', emoji: '🔼', counter: 'highlowPlay',
    title: (t) => `Chơi ${t} ván Cao/Thấp`,
    tiers: [{ target: 2, reward: 500 }, { target: 3, reward: 800 }],
  },
  {
    id: 'betAmount', category: 'casino', emoji: '🎯', counter: 'betAmount',
    title: (t) => `Đặt cược tổng cộng ${fmt(t)} xu`,
    tiers: [{ target: 1200, reward: 500 }, { target: 3500, reward: 900 }, { target: 8000, reward: 1300 }],
  },
  {
    id: 'gambleProfit', category: 'casino', emoji: '📈', counter: 'gambleProfit',
    title: (t) => `Thắng tổng cộng ${fmt(t)} xu tiền lãi ở sòng bài`,
    tiers: [{ target: 600, reward: 600 }, { target: 2000, reward: 1050 }],
  },

  // ================= KINH TẾ =================
  {
    id: 'daily', category: 'economy', emoji: '📅', counter: 'daily',
    title: () => 'Điểm danh hôm nay',
    tiers: [{ target: 1, reward: 500 }],
  },
  {
    id: 'work', category: 'economy', emoji: '💼', counter: 'work',
    title: (t) => `Đi làm ${t} lần`,
    tiers: [{ target: 1, reward: 350 }, { target: 2, reward: 650 }, { target: 3, reward: 1000 }],
  },
  {
    id: 'spend', category: 'economy', emoji: '🛒', counter: 'spend',
    title: (t) => `Mua sắm ${fmt(t)} xu ở cửa hàng`,
    tiers: [{ target: 200, reward: 400 }, { target: 700, reward: 800 }],
  },
  {
    id: 'buyItem', category: 'economy', emoji: '🎁', counter: 'buyItem',
    title: (t) => (t === 1 ? 'Mua 1 vật phẩm ở cửa hàng' : `Mua ${t} vật phẩm ở cửa hàng`),
    tiers: [{ target: 1, reward: 400 }, { target: 2, reward: 750 }],
  },
  {
    id: 'workEarn', category: 'economy', emoji: '🧾', counter: 'workEarn',
    title: (t) => `Kiếm ${fmt(t)} xu từ việc đi làm`,
    tiers: [{ target: 200, reward: 450 }, { target: 500, reward: 800 }],
  },
  {
    id: 'earn', category: 'economy', emoji: '🪙', counter: 'earn',
    title: (t) => `Kiếm tổng cộng ${fmt(t)} xu (điểm danh + đi làm)`,
    tiers: [{ target: 350, reward: 450 }, { target: 900, reward: 850 }],
  },

  // ================= TRÒ CHƠI =================
  {
    id: 'game', category: 'games', emoji: '🎮', counter: 'game',
    title: (t) => `Chơi ${t} ván trò chơi (đố vui / đoán số / cờ caro)`,
    tiers: [{ target: 2, reward: 400 }, { target: 3, reward: 700 }, { target: 5, reward: 1050 }],
  },
  {
    id: 'trivia', category: 'games', emoji: '🧠', counter: 'triviaCorrect',
    title: (t) => `Trả lời đúng ${t} câu đố vui`,
    tiers: [{ target: 1, reward: 400 }, { target: 2, reward: 800 }],
  },
  {
    id: 'tttPlay', category: 'games', emoji: '❌', counter: 'tttPlay',
    title: (t) => `Chơi ${t} ván cờ caro`,
    tiers: [{ target: 1, reward: 350 }, { target: 2, reward: 700 }],
  },
  {
    id: 'tttWin', category: 'games', emoji: '⭕', counter: 'tttWin',
    title: (t) => (t === 1 ? 'Thắng bot 1 ván cờ caro' : `Thắng bot ${t} ván cờ caro`),
    tiers: [{ target: 1, reward: 700 }],
  },
  {
    id: 'guessWin', category: 'games', emoji: '🎯', counter: 'guessWin',
    title: (t) => (t === 1 ? 'Đoán trúng số bí mật 1 lần' : `Đoán trúng số bí mật ${t} lần`),
    tiers: [{ target: 1, reward: 650 }, { target: 2, reward: 1150 }],
  },

  // ================= CỘNG ĐỒNG =================
  {
    id: 'give', category: 'social', emoji: '🤝', counter: 'give',
    title: (t) => `Tặng ${fmt(t)} xu cho người khác`,
    tiers: [{ target: 150, reward: 400 }, { target: 500, reward: 800 }, { target: 1200, reward: 1200 }],
  },
  {
    id: 'giveCount', category: 'social', emoji: '💌', counter: 'giveCount',
    title: (t) => (t === 1 ? 'Tặng xu cho người khác 1 lần' : `Tặng xu cho người khác ${t} lần`),
    tiers: [{ target: 1, reward: 400 }, { target: 2, reward: 700 }],
  },
];

const byId = new Map(POOL.map((q) => [q.id, q]));

// Nhóm nhiệm vụ theo phân loại (dùng khi bốc nhiệm vụ mỗi ngày).
function poolByCategory() {
  const map = new Map();
  for (const q of POOL) {
    if (!map.has(q.category)) map.set(q.category, []);
    map.get(q.category).push(q);
  }
  return map;
}

// ---------------------------------------------------------------
//  Bốc bộ nhiệm vụ cho một ngày.
//  Ưu tiên trải đều các NHÓM: mỗi nhóm góp 1 nhiệm vụ trước,
//  sau đó mới bốc thêm cho đủ số lượng. Không bao giờ trùng bộ đếm.
// ---------------------------------------------------------------
function rollTasks() {
  const count = Math.min(DAILY_COUNT, POOL.length);
  const chosen = [];
  const usedIds = new Set();
  const usedCounters = new Set();

  const take = (quest) => {
    if (!quest) return false;
    if (usedIds.has(quest.id) || usedCounters.has(quest.counter)) return false;
    usedIds.add(quest.id);
    usedCounters.add(quest.counter);
    const tierIndex = rng.randomInt(quest.tiers.length);
    const tier = quest.tiers[tierIndex];
    chosen.push({ id: quest.id, target: tier.target, reward: tier.reward, tier: tierIndex });
    return true;
  };

  // Vòng 1: mỗi nhóm một nhiệm vụ (thứ tự nhóm ngẫu nhiên).
  const groups = poolByCategory();
  for (const catKey of rng.shuffle([...groups.keys()])) {
    if (chosen.length >= count) break;
    const list = groups.get(catKey) || [];
    if (!list.length) continue;
    take(rng.pick(list));
  }

  // Vòng 2: bốc thêm ngẫu nhiên cho đủ số lượng.
  for (const quest of rng.shuffle(POOL)) {
    if (chosen.length >= count) break;
    take(quest);
  }

  return rng.shuffle(chosen);
}

function freshQuestDay(dayStr) {
  return { day: dayStr, tasks: rollTasks(), progress: {}, claimed: {} };
}

// Đảm bảo ví có bộ nhiệm vụ hợp lệ của NGÀY HÔM NAY.
// Tự di trú dữ liệu cũ sang cấu trúc mới.
function ensureQuestDay(wallet, now) {
  const today = day.dayKey(now);
  const q = wallet.quest;
  const valid = q
    && typeof q === 'object'
    && q.day === today
    && Array.isArray(q.tasks)
    && q.tasks.length > 0
    && q.tasks.every((t) => t && byId.has(t.id) && typeof t.target === 'number' && typeof t.reward === 'number');
  if (!valid) {
    wallet.quest = freshQuestDay(today);
    return wallet.quest;
  }
  if (!q.progress || typeof q.progress !== 'object') q.progress = {};
  if (!q.claimed || typeof q.claimed !== 'object') q.claimed = {};
  return q;
}

// Suy ra bậc độ khó của một nhiệm vụ đã lưu (dữ liệu cũ không có trường `tier`).
function tierIndexOf(spec, task) {
  if (task && typeof task.tier === 'number' && spec.tiers[task.tier]) return task.tier;
  const found = spec.tiers.findIndex((t) => t.target === task.target && t.reward === task.reward);
  return found >= 0 ? found : 0;
}

// Danh sách nhiệm vụ hôm nay kèm thông tin hiển thị.
function tasksOf(wallet, now) {
  const q = ensureQuestDay(wallet, now);
  return q.tasks.map((t) => {
    const spec = byId.get(t.id);
    const tIndex = tierIndexOf(spec, t);
    const cat = categoryMeta(spec.category);
    return {
      id: t.id,
      emoji: spec.emoji,
      title: spec.title(t.target),
      counter: spec.counter,
      target: t.target,
      reward: t.reward,
      tier: tIndex,
      tierLabel: tierLabel(tIndex),
      category: cat.key,
      categoryLabel: cat.label,
      categoryEmoji: cat.emoji,
      categoryColor: cat.color,
      categoryOrder: cat.order,
    };
  });
}

function progressOf(wallet, task, now) {
  const q = ensureQuestDay(wallet, now);
  const spec = byId.get(task.id);
  if (!spec) return { value: 0, rawValue: 0, target: task.target || 1, done: false, claimed: false };
  const raw = q.progress[spec.counter];
  const value = typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : 0;
  const target = task.target;
  return {
    value: Math.min(value, target),
    rawValue: value,
    target,
    done: value >= target,
    claimed: Boolean(q.claimed[task.id]),
  };
}

// Cộng tiến độ cho một bộ đếm. Gọi TRƯỚC db.saveWallet(...) trên cùng một ví.
// An toàn tuyệt đối: mọi lỗi đều bị nuốt để không bao giờ làm hỏng lệnh gọi nó.
function track(wallet, counter, amount = 1) {
  try {
    if (!wallet || typeof wallet !== 'object' || !counter) return;
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return;
    const q = ensureQuestDay(wallet, Date.now());
    const cur = typeof q.progress[counter] === 'number' && Number.isFinite(q.progress[counter]) ? q.progress[counter] : 0;
    q.progress[counter] = cur + n;
  } catch {
    /* không để việc ghi nhận nhiệm vụ làm hỏng luồng chính */
  }
}

// Cộng nhiều bộ đếm một lần: track.many(wallet, { gamble: 1, betAmount: 500 })
function trackMany(wallet, counters) {
  if (!counters || typeof counters !== 'object') return;
  for (const [key, value] of Object.entries(counters)) track(wallet, key, value);
}

// ---------------------------------------------------------------
//  Nhóm nhiệm vụ hôm nay theo phân loại (dùng cho giao diện `quest`).
// ---------------------------------------------------------------
function categoryGroups(wallet, now) {
  const tasks = tasksOf(wallet, now);
  const q = ensureQuestDay(wallet, now);
  const map = new Map();
  for (const t of tasks) {
    if (!map.has(t.category)) map.set(t.category, []);
    map.get(t.category).push(t);
  }
  const groups = [];
  for (const [key, list] of map.entries()) {
    const meta = categoryMeta(key);
    const doneCount = list.filter((t) => progressOf(wallet, t, now).done).length;
    const eligible = list.length >= CATEGORY_MIN_TASKS;
    groups.push({
      key,
      label: meta.label,
      emoji: meta.emoji,
      color: meta.color,
      order: meta.order,
      tasks: list,
      total: list.length,
      doneCount,
      allDone: doneCount === list.length,
      bonusEligible: eligible,
      bonusAmount: eligible ? CATEGORY_BONUS : 0,
      bonusClaimed: Boolean(q.claimed[CATEGORY_KEY_PREFIX + key]),
    });
  }
  return groups.sort((a, b) => a.order - b.order);
}

function allDone(wallet, now) {
  const list = tasksOf(wallet, now);
  return list.length > 0 && list.every((t) => progressOf(wallet, t, now).done);
}

function bonusClaimed(wallet, now) {
  const q = ensureQuestDay(wallet, now);
  return Boolean(q.claimed[ALL_DONE_KEY]);
}

// Nhận tất cả phần thưởng đang sẵn sàng.
// Trả về { count, total, bonus, categories: [{ key, label, amount }] }.
// `only` (tuỳ chọn): chỉ nhận thưởng của một nhóm nhất định.
function claimAll(wallet, now, only = null) {
  const q = ensureQuestDay(wallet, now);
  let count = 0;
  let total = 0;

  for (const task of tasksOf(wallet, now)) {
    if (only && task.category !== only) continue;
    const p = progressOf(wallet, task, now);
    if (p.done && !p.claimed) {
      wallet.balance = (wallet.balance || 0) + task.reward;
      q.claimed[task.id] = true;
      count += 1;
      total += task.reward;
    }
  }

  // Thưởng theo nhóm
  const categories = [];
  for (const g of categoryGroups(wallet, now)) {
    if (only && g.key !== only) continue;
    if (!g.bonusEligible || !g.allDone) continue;
    const key = CATEGORY_KEY_PREFIX + g.key;
    if (q.claimed[key]) continue;
    wallet.balance = (wallet.balance || 0) + g.bonusAmount;
    q.claimed[key] = true;
    total += g.bonusAmount;
    categories.push({ key: g.key, label: g.label, emoji: g.emoji, amount: g.bonusAmount });
  }

  // Thưởng hoàn thành toàn bộ (chỉ khi nhận thưởng tổng, không lọc nhóm)
  let bonus = 0;
  if (!only && allDone(wallet, now) && !q.claimed[ALL_DONE_KEY]) {
    wallet.balance = (wallet.balance || 0) + ALL_DONE_BONUS;
    q.claimed[ALL_DONE_KEY] = true;
    bonus = ALL_DONE_BONUS;
    total += ALL_DONE_BONUS;
  }

  return { count, total, bonus, categories };
}

function hasClaimable(wallet, now, only = null) {
  const list = tasksOf(wallet, now);
  const hasTask = list.some((t) => {
    if (only && t.category !== only) return false;
    const p = progressOf(wallet, t, now);
    return p.done && !p.claimed;
  });
  if (hasTask) return true;

  const hasCategoryBonus = categoryGroups(wallet, now).some(
    (g) => (!only || g.key === only) && g.bonusEligible && g.allDone && !g.bonusClaimed,
  );
  if (hasCategoryBonus) return true;

  if (only) return false;
  return allDone(wallet, now) && !bonusClaimed(wallet, now);
}

module.exports = {
  POOL,
  CATEGORIES,
  CATEGORY_LIST,
  CATEGORY_BONUS,
  CATEGORY_KEY_PREFIX,
  CATEGORY_MIN_TASKS,
  DAILY_COUNT,
  ALL_DONE_BONUS,
  ALL_DONE_KEY,
  TIER_LABELS,
  tierLabel,
  categoryMeta,
  ensureQuestDay,
  tasksOf,
  categoryGroups,
  progressOf,
  track,
  trackMany,
  claimAll,
  hasClaimable,
  allDone,
  bonusClaimed,
  dayKey: day.dayKey,
};