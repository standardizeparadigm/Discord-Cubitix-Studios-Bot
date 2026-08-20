// =============================================================
//  Sự kiện: inviteCreate - có lời mời mới được tạo
//  Ghi ngay vào bộ nhớ đệm để việc đếm lượt mời luôn chính xác.
// =============================================================
const inviteStore = require('../core/inviteStore');

module.exports = {
  name: 'inviteCreate',
  async execute(client, invite) {
    try {
      inviteStore.addInvite(invite);
    } catch (_) {
      /* không để lỗi nhỏ làm ảnh hưởng bot */
    }
  },
};
