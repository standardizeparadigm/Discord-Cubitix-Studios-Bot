// =============================================================
//  giveawayStore - lưu trợ các đợt giveaway vào data/giveaways.json
//  Mục đích: giveaway KHÔNG bị mất khi bot khởi động lại.
//  Khóa lưu trụ = messageId của tin nhắn giveaway (duy nhất toàn cục).
// =============================================================
const db = require('./Database');
const rng = require('./secureRandom');

const store = new db.JsonStore('giveaways.json', {});

// Giữ lại 7 ngày sau khi kết thúc để còn quay lại (reroll) được.
const KEEP_AFTER_END = 7 * 24 * 60 * 60 * 1000;

// Chặn trưọng hợp mở quá nhiều đợt làm phình file và phình số timer.
const MAX_ACTIVE_PER_GUILD = 25;

/**
 * Cấu trúc một đợt giveaway:
 * {
 *   messageId, channelId, guildId, hostId,
 *   prize, description, winnerCount,
 *   endAt,                // mốc thời gian kết thúc (ms)
 *   requiredRoleId,       // null = ai cũng tham gia được
 *   minAccountDays,       // 0 = không yêu cầu tuổi tài khoản
 *   bonusRoleId,          // vai trò được cộng thêm lượt
 *   bonusEntries,         // số lượt cộng thêm cho vai trò trên
 *   hostCanJoin,          // chủ đợt có được tự tham gia không
 *   dmWinners,            // có nhắn riêng cho người thắng không
 *   pinned,               // đã ghim tin nhắn giveaway chưa
 *   entries: [userId],
 *   weights: { userId: soLuot },  // chốt lúc ghi danh, để sau này đổi vai trò
 *                                  // không làm thay đổi kết quả đã hứa
 *   ended, cancelled,
 *   winners: [userId],    // kết quả lần quay gần nhất
 *   pastWinners: [userId] // TẤT CẢ ai tứng thắng đợt này, để reroll
 *                         // không chọn trùng lại người cũ
 * }
 */

// Điền giá trị mặc định cho các bản ghi cũ (tương thích ngược khi nâng cấp bot).
function normalize(gw) {
  if (!gw || typeof gw !== 'object') return null;
  if (!Array.isArray(gw.entries)) gw.entries = [];
  if (!Array.isArray(gw.winners)) gw.winners = [];
  if (!Array.isArray(gw.pastWinners)) gw.pastWinners = [];
  if (!gw.weights || typeof gw.weights !== 'object') gw.weights = {};
  if (!Number.isFinite(gw.winnerCount) || gw.winnerCount < 1) gw.winnerCount = 1;
  if (!Number.isFinite(gw.minAccountDays) || gw.minAccountDays < 0) gw.minAccountDays = 0;
  if (!Number.isFinite(gw.bonusEntries) || gw.bonusEntries < 0) gw.bonusEntries = 0;
  if (gw.requiredRoleId === undefined) gw.requiredRoleId = null;
  if (gw.bonusRoleId === undefined) gw.bonusRoleId = null;
  if (typeof gw.hostCanJoin !== 'boolean') gw.hostCanJoin = false;
  if (typeof gw.dmWinners !== 'boolean') gw.dmWinners = true;
  if (typeof gw.pinned !== 'boolean') gw.pinned = false;
  if (typeof gw.ended !== 'boolean') gw.ended = false;
  if (typeof gw.cancelled !== 'boolean') gw.cancelled = false;
  // Quyền ping được chốt lúc tạo đợt, không đọc lại quyền hiện tại của người tổ chức
  // — đợt cũ không có các trường này thì mặc định là không ping gì.
  if (typeof gw.allowEveryone !== 'boolean') gw.allowEveryone = false;
  if (!Array.isArray(gw.pingUserIds)) gw.pingUserIds = [];
  if (!Array.isArray(gw.pingRoleIds)) gw.pingRoleIds = [];
  return gw;
}

function get(messageId) {
  return normalize(store.get(String(messageId), null));
}

function save(gw) {
  store.set(String(gw.messageId), gw);
  return gw;
}

function remove(messageId) {
  store.delete(String(messageId));
}

function all() {
  return Object.values(store.all() || {})
    .map(normalize)
    .filter(Boolean);
}

// Các đợt chưa kết thúc (dùng để hỏi lại giờ sau khi bot khởi động lại).
function pending() {
  return all().filter((g) => !g.ended);
}

// Các đợt đang diễn ra của một máy chủ, sắp xếp theo thời điểm kết thúc gần nhất.
function activeInGuild(guildId) {
  return pending()
    .filter((g) => String(g.guildId) === String(guildId))
    .sort((a, b) => (a.endAt || 0) - (b.endAt || 0));
}

// Các đợt đã kết thúc của một máy chủ, mới nhất trước.
function endedInGuild(guildId) {
  return all()
    .filter((g) => g.ended && String(g.guildId) === String(guildId))
    .sort((a, b) => (b.endAt || 0) - (a.endAt || 0));
}

// Dọn các đợt đã kết thúc quá lâu để file không phình vô hạn.
function prune(now = Date.now()) {
  let removed = 0;
  for (const g of all()) {
    if (g.ended && now - (g.endAt || 0) > KEEP_AFTER_END) {
      remove(g.messageId);
      removed++;
    }
  }
  return removed;
}

// Số lượt bốc thăm của một người (mặc định 1).
function ticketsOf(gw, id) {
  const n = Number((gw && gw.weights ? gw.weights : {})[id]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

// Tổng số lượt của cả đợt (hiển thị khi có lượt thưởng).
function totalTickets(gw) {
  return (gw.entries || []).reduce((sum, id) => sum + ticketsOf(gw, id), 0);
}

/**
 * Bốc người thắng bằng bộ sinh số ngẫu nhiên an toàn (CSPRNG).
 * Không dùng Math.random để đảm bảo công bằng, không đoán trước được.
 * @param {string[]} entries danh sách userId tham gia
 * @param {number} count số người thắng mong muốn
 * @param {string[]} exclude những ai bị loại (dùng khi quay lại)
 * @param {object|null} weights bản đị userId -> số lượt; bỏ trống = mọi người 1 lượt
 * @returns {string[]} danh sách userId thắng (có thể ít hơn count nếu thiếu người)
 */
function pickWinners(entries, count, exclude = [], weights = null) {
  const excluded = new Set(exclude || []);
  let pool = [...new Set(entries || [])].filter((id) => !excluded.has(id));
  if (pool.length === 0 || !Number.isFinite(count) || count <= 0) return [];
  if (pool.length <= count) return rng.shuffle(pool);

  // Không có lượt thưởng -> bốc đều, nhanh hơn.
  const hasBonus =
    weights && Object.keys(weights).some((id) => pool.includes(id) && Number(weights[id]) > 1);
  if (!hasBonus) return rng.sample(pool, count);

  // Có lượt thưởng -> bốc theo trọng số, mỗi người chỉ thắng tối đa một giải
  // (bốc xong lại bỏ người đó khỏi hủ - rút không hoàn lại).
  const chosen = [];
  while (chosen.length < count && pool.length) {
    const w = pool.map((id) => {
      const n = Number(weights[id]);
      return Number.isFinite(n) && n > 0 ? n : 1;
    });
    const picked = rng.weightedPick(pool, w);
    chosen.push(picked);
    pool = pool.filter((id) => id !== picked);
  }
  return chosen;
}

module.exports = {
  get,
  save,
  remove,
  all,
  pending,
  activeInGuild,
  endedInGuild,
  prune,
  ticketsOf,
  totalTickets,
  pickWinners,
  KEEP_AFTER_END,
  MAX_ACTIVE_PER_GUILD,
};
