// =============================================================
//  shopItems - danh mục vật phẩm cho lệnh shop / buy
//  Một số vật phẩm có hiệu ứng đặc biệt (special):
//    - karma : cộng nghiệp (karma)
//  Các vật phẩm còn lại là đồ sưu tầm/khoe hồ sơ.
// =============================================================
const ITEMS = [
  { id: 'flower',  name: 'Hoa hồng',        emoji: '🌹', price: 200,   desc: 'Một đóa hồng xinh để khoe trên hồ sơ.' },
  { id: 'bait',    name: 'Mồi câu cao cấp',  emoji: '🪱', price: 500,   desc: 'Món đồ sưu tầm dành cho cần thủ.' },
  { id: 'charm',   name: 'Bùa may mắn',      emoji: '🍀', price: 3000,  desc: 'Cộng ngay +5 nghiệp (karma) mỗi cái.', special: 'karma', karma: 5 },
  { id: 'shield',  name: 'Khiên hộ mệnh',    emoji: '🛡️', price: 4000,  desc: 'Vật phẩm hộ mệnh quý hiếm để khoe trên hồ sơ.' },
  { id: 'rod',     name: 'Cần câu vàng',     emoji: '🎣', price: 8000,  desc: 'Biểu tượng của cần thủ chuyên nghiệp.' },
  { id: 'trophy',  name: 'Cúp vàng',         emoji: '🏆', price: 20000, desc: 'Khoe đẳng cấp đại gia của server.' },
  { id: 'crown',   name: 'Vương miện',       emoji: '👑', price: 50000, desc: 'Vật phẩm cao cấp bậc nhất Cubitix.' },
];

const byId = (id) => ITEMS.find((i) => i.id === String(id).toLowerCase()) || null;

// Tìm theo id trước, sau đó theo tên (khớp một phần, không phân biệt hoa thường).
function resolve(input) {
  if (!input) return null;
  const q = String(input).trim().toLowerCase();
  return (
    byId(q) ||
    ITEMS.find((i) => i.name.toLowerCase() === q) ||
    ITEMS.find((i) => i.name.toLowerCase().includes(q)) ||
    ITEMS.find((i) => i.id.includes(q)) ||
    null
  );
}

module.exports = { ITEMS, byId, resolve };
