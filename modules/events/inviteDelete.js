// =============================================================
//  Sự kiện: inviteDelete - một lời mời bị xoá / hết hạn
//  Xoá khỏi bộ nhớ đệm để không ghi nhầm lượt mời cho người khác.
// =============================================================
const inviteStore = require('../core/inviteStore');

module.exports = {
  name: 'inviteDelete',
  async execute(client, invite) {
    try {
      inviteStore.removeInvite(invite);
    } catch (_) {
      /* không để lỗi nhỏ làm ảnh hưởng bot */
    }
  },
};
