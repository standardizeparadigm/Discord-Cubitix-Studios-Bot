// =============================================================
//  Lệnh: work - đi làm kiếm xu (10 phút/lần)
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { colors } = require('../../core/palette');
const db = require('../../core/Database');
const rng = require('../../core/secureRandom');
const quests = require('../../core/questLogic');

// Thời gian chờ giữa 2 lần đi làm: 10 phút.
const WORK_COOLDOWN = 10 * 60 * 1000;
// Tiền công mỗi lần: 40 → 119 xu (giảm so với bản cũ vì chu kỳ ngắn hơn nhiều).
const EARN_MIN = 40;
const EARN_RANGE = 80;
const JOBS = [
  'Bạn đi giao đồ ăn và nhận được',
  'Bạn code một con bot Discord và được trả',
  'Bạn bán trà sữa và kiếm',
  'Bạn live stream chơi game và nhận donate',
  'Bạn sửa máy tính cho hàng xóm và được',
  'Bạn vẽ tranh online và bán được',
  'Bạn làm gia sư và nhận',
];

module.exports = {
  name: 'work',
  aliases: ['lam', 'dilam'],
  category: 'economy',
  description: 'Đi làm để kiếm xu (10 phút/lần)',
  cooldown: 4,
  guildOnly: true,
  slash: true,
  async run(ctx) {
    const wallet = db.getWallet(ctx.author.id);
    const now = Date.now();
    const passed = now - (wallet.lastWork || 0);

    if (passed < WORK_COOLDOWN) {
      const left = WORK_COOLDOWN - passed;
      const m = Math.floor(left / 60000);
      const s = Math.floor((left % 60000) / 1000);
      const wait = m > 0 ? `**${m} phút ${s} giây**` : `**${s} giây**`;
      return ctx.reply({
        embeds: [Embed.warn('Bạn cần nghỉ ngơi!', `Hãy quay lại làm việc sau ${wait} nữa. (Mỗi 10 phút được đi làm 1 lần)`)],
      });
    }

    const earn = EARN_MIN + Math.floor(rng.randomFloat() * EARN_RANGE);
    wallet.balance += earn;
    wallet.lastWork = now;
    quests.track(wallet, 'work', 1);
    quests.track(wallet, 'workEarn', earn);
    quests.track(wallet, 'earn', earn);
    db.saveWallet(ctx.author.id, wallet);

    const job = JOBS[Math.floor(rng.randomFloat() * JOBS.length)];
    await ctx.reply({
      embeds: [Embed.custom(colors.success, '💼 Đi làm', `${job} **+${earn.toLocaleString('vi-VN')}** xu!\nSố dư ví: **${wallet.balance.toLocaleString('vi-VN')}** xu.`)],
    });
  },
};
