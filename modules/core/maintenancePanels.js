// =============================================================
//  maintenancePanels - sổ theo dõi các bảng điều khiển bảo trì đang mở
//
//  VẤN ĐỀ CŨ: mở bảng điều khiển rồi dùng lệnh slash để đổi trạng thái
//  thì bảng cũ vẫn hiển thị số liệu cũ -> trông như "không hoạt động".
//  Nay mọi bảng đang mở đều được ghi danh vào đây, và sau MỖI thay đổi
//  (dù từ nút bấm, lệnh prefix hay lệnh slash) tất cả đều được vẽ lại.
// =============================================================

// Mỗi mục: { id, render, ended }
//  - id: id tin nhắn của bảng
//  - render(): hàm tự vẽ lại bảng đó (do maintenance.js cung cấp)
const panels = new Set();

function register(panel) {
  if (!panel || typeof panel.render !== 'function') return () => {};
  panels.add(panel);
  // Trả về hàm huỷ đăng ký để gọi khi bảng hết hạn / bị đóng.
  return () => panels.delete(panel);
}

function unregister(panel) {
  panels.delete(panel);
}

// Vẽ lại mọi bảng đang mở. `exceptId` dùng để bỏ qua bảng vừa được
// cập nhật trực tiếp bởi tưưng tác (tránh sửa 2 lần gây nhấp nháy).
function syncAll(exceptId) {
  for (const panel of Array.from(panels)) {
    if (panel.ended) {
      panels.delete(panel);
      continue;
    }
    if (exceptId && panel.id && String(panel.id) === String(exceptId)) continue;
    try {
      const out = panel.render();
      if (out && typeof out.catch === 'function') out.catch(() => {});
    } catch (_) {
      /* một bảng lỗi không được làm hỏng các bảng còn lại */
    }
  }
}

function count() {
  return panels.size;
}

function clear() {
  panels.clear();
}

module.exports = { register, unregister, syncAll, count, clear };
