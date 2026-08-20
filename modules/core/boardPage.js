// =============================================================
//  boardPage - toàn bộ PHẦN TÍNH TOÁN của bảng xếp hạng chia trang.
//
//  File này CỐ TÍNH không require('discord.js'):
//    - Nạp được độc lập nên viết kiểm thử tự động rất dễ.
//    - Mọi lệnh có bảng xếp hạng dùng chung một bộ quy tắc đếm trang,
//      tránh cảnh mỗi lệnh chia trang một kiểu rồi lệch nhau.
// =============================================================

const PAGE_SIZE = 10;                      // Yêu cầu: mỗi trang tối đa 10 dòng
const MEDALS = ['🥇', '🥈', '🥉'];

// Định dạng số kiểu Việt Nam, an toàn với giá trị rác.
function num(v) {
  const n = Number(v);
  return (Number.isFinite(n) ? n : 0).toLocaleString('vi-VN');
}

function size(list) {
  return Array.isArray(list) ? list.length : 0;
}

// Luôn trả về ít nhất 1 trang: bảng rỗng vẫn là "trang 1/1" chứ không phải "1/0".
function pageCount(list) {
  return Math.max(1, Math.ceil(size(list) / PAGE_SIZE));
}

// Ghim trang vào khoảng hợp lệ. Chặn mọi đầu vào xấu: NaN, âm, số thập phân,
// chuỗi, Infinity… -> không bao giờ sinh ra trang trống.
//
// CHỈ chặn đúng NaN. Nếu chặn cả Infinity thì sẽ vô lý: số rất lớn (99) bị kẹp
// về trang cuối, nhưng số lớn vô hạn lại nhảy ngược về trang đầu.
// Để Math.min/Math.max tự xử lý: +Infinity -> trang cuối, -Infinity -> trang đầu.
function clampPage(page, list) {
  const max = pageCount(list) - 1;
  const p = Number(page);
  if (Number.isNaN(p)) return 0;
  return Math.min(Math.max(0, Math.trunc(p)), max);
}

// Cắt đúng 10 mục của một trang.
function slicePage(list, page) {
  if (!Array.isArray(list)) return [];
  const p = clampPage(page, list);
  return list.slice(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE);
}

// Vị trí thứ index (tính từ 0) nằm ở trang nào (tính từ 0).
function pageOf(index) {
  const i = Number(index);
  if (!Number.isFinite(i) || i < 0) return 0;
  return Math.floor(i / PAGE_SIZE);
}

// Huy chương cho top 3, còn lại là số thứ tự canh đều trong `code`.
function rankTag(rank) {
  const r = Number(rank);
  if (!Number.isFinite(r) || r < 1) return '`#??`';
  return MEDALS[r - 1] || '`#' + String(r).padStart(2, '0') + '`';
}

// Gắn số hạng 1..n cho danh sách ĐÃ sắp xếp.
function withRanks(list) {
  if (!Array.isArray(list)) return [];
  return list.map((item, i) => ({ ...item, rank: i + 1 }));
}

// Tìm vị trí của một người trong bảng (-1 nếu không có).
function indexOfUser(list, userId) {
  if (!Array.isArray(list) || !userId) return -1;
  const want = String(userId);
  return list.findIndex((e) => e && String(e.id) === want);
}

module.exports = {
  PAGE_SIZE,
  MEDALS,
  num,
  pageCount,
  clampPage,
  slicePage,
  pageOf,
  rankTag,
  withRanks,
  indexOfUser,
};
