// =============================================================
//  Su kien: threadCreate
//  Kenh luong (thread) KHONG nam trong guild.channels.fetch(), nen phai
//  bat rieng de o chon kenh thay luong vua tao ngay lap tuc.
// =============================================================
module.exports = {
  name: 'threadCreate',
  async execute(client, thread) {
    if (!thread || !thread.guild) return;
    // Tu tham gia de bot luon nhan duoc su kien cua luong nay ve sau.
    if (thread.joinable && !thread.joined) await thread.join().catch(() => {});
    // discord.js da tu them vao cache; chi ghi log cho de theo doi.
    client.logger?.info?.(`Luong moi: #${thread.name} (${thread.guild.name}).`);
  },
};
