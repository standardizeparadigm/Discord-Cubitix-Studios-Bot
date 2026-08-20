// =============================================================
//  Animator - các tiện ích tạo hiệu ứng / animation cho lệnh
//  Bằng cách chỉnh sửa (edit) tin nhắn liên tục
// =============================================================
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Các khung spinner xoay
const spinners = ['⠉', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const dots = ['●○○', '○●○', '○○●', '○●○'];
const moon = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'];
const clock = ['🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚', '🕛'];

// Tạo thanh tiến trình dạng [████░░░░] 50%
function progressBar(percent, size = 18) {
  const p = Math.max(0, Math.min(100, percent));
  const filled = Math.round((p / 100) * size);
  const bar = '█'.repeat(filled) + '░'.repeat(size - filled);
  return `\`[${bar}]\` **${Math.round(p)}%**`;
}

// Chạy animation trên một tin nhắn có sẵn (message có thể .edit)
// frames: mảng các chuỗi hoặc hàm (i) => payload
async function play(message, frames, { delay = 700, embedFactory = null } = {}) {
  for (let i = 0; i < frames.length; i++) {
    const frame = typeof frames[i] === 'function' ? frames[i](i) : frames[i];
    try {
      if (typeof frame === 'string') {
        if (embedFactory) await message.edit({ embeds: [embedFactory(frame)], content: null });
        else await message.edit({ content: frame });
      } else {
        await message.edit(frame);
      }
    } catch {
      break; // tin nhắn có thể đã bị xóa
    }
    if (i < frames.length - 1) await sleep(delay);
  }
  return message;
}

// Hiệu ứng gõ chữ (typewriter)
function typewriterFrames(text, step = 3) {
  const frames = [];
  for (let i = step; i < text.length; i += step) {
    frames.push(text.slice(0, i) + '█');
  }
  frames.push(text);
  return frames;
}

module.exports = {
  sleep,
  spinners,
  dots,
  moon,
  clock,
  progressBar,
  play,
  typewriterFrames,
};
