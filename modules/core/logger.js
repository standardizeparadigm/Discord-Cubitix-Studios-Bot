// =============================================================
//  Logger - ghi log ra console với màu sắc và mốc thời gian
// =============================================================
const c = {
	reset: '\x1b[0m',
	gray: '\x1b[90m',
	red: '\x1b[31m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	magenta: '\x1b[35m',
	cyan: '\x1b[36m',
	white: '\x1b[37m',
	bold: '\x1b[1m',
};

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${c.gray}[${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}]${c.reset}`;
}

function log(color, tag, msg) {
  console.log(`${stamp()} ${color}${c.bold}${tag}${c.reset} ${msg}`);
}

module.exports = {
  info: (m) => log(c.cyan, 'INFO   ', m),
  success: (m) => log(c.green, 'OK     ', m),
  warn: (m) => log(c.yellow, 'CẢNH BÁO', m),
  error: (m) => log(c.red, 'LỖI    ', m),
  event: (m) => log(c.magenta, 'SỰ KIỆN', m),
  command: (m) => log(c.blue, 'LỆNH   ', m),
  banner: (brand) => {
    // Khung luôn cân đối dù tên thương hiệu dài hay ngắn.
    // (Trước đây dòng "All In One Discord Bot" bị lệch so với viền khung.)
    const WIDTH = 34;
    const line = (text) => {
      const t = String(text).slice(0, WIDTH - 2);
      const space = WIDTH - 2 - t.length;
      const left = Math.floor(space / 2);
      return '  \u2551 ' + ' '.repeat(left) + t + ' '.repeat(space - left) + ' \u2551';
    };
    console.log(`${c.magenta}${c.bold}`);
    console.log('  \u2554' + '\u2550'.repeat(WIDTH) + '\u2557');
    console.log(line(String(brand || 'Cubitix Studios').toUpperCase()));
    console.log(line('All In One Discord Bot'));
    console.log('  \u255a' + '\u2550'.repeat(WIDTH) + '\u255d');
    console.log(c.reset);
  },
};
