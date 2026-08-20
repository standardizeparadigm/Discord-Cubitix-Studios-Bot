// =============================================================
//  Lệnh: fact - sự thật thú vị ngẫu nhiên
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { colors } = require('../../core/palette');
const rng = require('../../core/secureRandom');

const FACTS = [
  'Mật ong gần như không bao giờ hỏng — người ta từng tìm thấy mật ong 3000 năm tuổi vẫn ăn được.',
  'Bạch tuộc có ba trái tim và máu màu xanh.',
  'Một ngày trên sao Kim dài hơn một năm của nó.',
  'Cá heo đặt "tên" riêng cho nhau bằng tiếng huýt đặc trưng.',
  'Chuối thực ra là một loại quả mọng, còn dâu tây thì không phải.',
  'Tháp Eiffel có thể cao thêm ~15 cm vào mùa hè do kim loại giãn nở.',
  'Con người và chuối có chung khoảng 60% DNA.',
  'Sứa biển đã xuất hiện trước cả khủng long hàng trăm triệu năm.',
  'Nhóm ngôn ngữ: "con lười" tiêu hóa một bữa ăn có thể mất tới hai tuần.',
  'Sét đánh xuống Trái Đất khoảng 8 triệu lần mỗi ngày.',
  'Mắt đà điểu lớn hơn cả bộ não của nó.',
  'Nước nóng có thể đóng băng nhanh hơn nước lạnh trong một số điều kiện (hiệu ứng Mpemba).',
  'Có nhiều vì sao trong vũ trụ hơn số hạt cát trên mọi bãi biển của Trái Đất.',
  'Tôm bọ ngựa có thể nhìn thấy nhiều màu hơn con người rất nhiều.',
  'Vạn Lý Trường Thành KHÔNG thể nhìn thấy bằng mắt thường từ vũ trụ.',
];

module.exports = {
  name: 'fact',
  aliases: ['suthat', 'factvn', 'didyouknow'],
  category: 'fun',
  description: 'Một sự thật thú vị ngẫu nhiên',
  cooldown: 3,
  slash: true,
  async run(ctx) {
    const fact = FACTS[Math.floor(rng.randomFloat() * FACTS.length)];
    await ctx.reply({ embeds: [Embed.custom(colors.aqua, '💡 Có thể bạn chưa biết', fact)] });
  },
};
