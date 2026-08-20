// =============================================================
//  Lệnh: calc - máy tính đơn giản (an toàn, không dùng eval)
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { colors } = require('../../core/palette');

// Bộ tính toán biểu thức an toàn (chỉ nhận số và + - * / ( ) . %)
function safeEval(expr) {
  const clean = expr.replace(/\s+/g, '');
  if (!/^[-+*/%().0-9]+$/.test(clean)) throw new Error('Biểu thức chứa ký tự không hợp lệ');

  let i = 0;
  const peek = () => clean[i];
  const next = () => clean[i++];

  function parseExpr() {
    let v = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = next();
      const r = parseTerm();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  function parseTerm() {
    let v = parseFactor();
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = next();
      const r = parseFactor();
      if ((op === '/' || op === '%') && r === 0) throw new Error('Không thể chia cho 0');
      v = op === '*' ? v * r : op === '/' ? v / r : v % r;
    }
    return v;
  }
  function parseFactor() {
    if (peek() === '(') {
      next();
      const v = parseExpr();
      if (next() !== ')') throw new Error('Thiếu dấu đóng ngoặc');
      return v;
    }
    if (peek() === '-') { next(); return -parseFactor(); }
    if (peek() === '+') { next(); return parseFactor(); }
    let num = '';
    while (peek() && /[0-9.]/.test(peek())) num += next();
    if (num === '') throw new Error('Biểu thức không hợp lệ');
    // Chỉ nhận số hợp lệ: trước đây "1.2.3" bị parseFloat làm tròn thành 1.2 (kết quả sai
    // mà không báo lỗi). Nay báo lỗi rõ ràng.
    if (!/^(\d+(\.\d+)?|\.\d+)$/.test(num)) throw new Error(`Số không hợp lệ: "${num}"`);
    return parseFloat(num);
  }

  const result = parseExpr();
  if (i < clean.length) throw new Error('Biểu thức không hợp lệ');
  if (!Number.isFinite(result)) throw new Error('Kết quả không hợp lệ (quá lớn hoặc chia cho 0)');
  return result;
}

module.exports = {
  name: 'calc',
  aliases: ['calculate', 'tinh', 'maytinh'],
  category: 'utility',
  description: 'Máy tính: cộng, trừ, nhân, chia, ngoặc đơn...',
  usage: '<biểu thức>  (ví dụ: (2+3)*4)',
  cooldown: 3,
  slash: true,
  options: [{ name: 'biểu_thức', type: 'string', description: 'Biểu thức cần tính, ví dụ (2+3)*4', required: true, rest: true }],
  async run(ctx) {
    const expr = ctx.getString('biểu_thức');
    if (!expr) return ctx.reply({ embeds: [Embed.error('Thiếu biểu thức', 'Ví dụ: `calc (2+3)*4`')] });
    try {
      const result = safeEval(expr);
      const embed = Embed.custom(colors.success, '🧮 Kết quả')
        .addFields(
          { name: 'Biểu thức', value: `\`${expr.length > 1000 ? expr.slice(0, 999) + '\u2026' : expr}\`` },
          { name: 'Kết quả', value: `\`${result}\`` },
        );
      await ctx.reply({ embeds: [embed] });
    } catch (e) {
      await ctx.reply({ embeds: [Embed.error('Không tính được', e.message)] });
    }
  },
};
