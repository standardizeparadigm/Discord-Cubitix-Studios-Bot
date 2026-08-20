// =============================================================
//  Lệnh: say - bot nói lại lời của bạn (BẢN LTS NÂNG CAO)
//
//  Hỗ trợ gần như TOÀN BỘ định dạng của Discord:
//    • Markdown: **đậm** *nghiêng* __gạch chân__ ~~gạch ngang~~ `mã` ||spoiler||
//    • Tiêu đề:  # H1  ## H2  ### H3   •  Chú thích nhỏ: -# subtext
//    • Danh sách, trích dẫn (>), khối mã ```lang, link ẩn [chữ](url)
//    • Embed đầy đủ: tiêu đề, mô tả, màu, ảnh, ảnh nhỏ, tác giả, chân trang,
//      liên kết, nhiều trường (field), dấu thời gian
//    • Tin nhắn thường (tự chia nhỏ nếu > 2000 ký tự)
//    • Trả lời (reply) một tin nhắn, gửi im lặng (@silent), đọc to (TTS)
//    • Gửi ẩn danh qua webhook (mang tên & avatar của bạn)
//    • Đính kèm lại file bạn gửi cùng lệnh
//
//  VÍ DỤ NHANH (prefix):
//    say Xin chào **mọi người**
//    say --plain Tin nhắn thường, không embed
//    say --title "Thông báo" --color đỏ Nội dung ở đây
//    say --code js console.log("hi")
//    say --quote Câu trích dẫn
//    say --spoiler Nội dung bí mật
//    say --h1 Tiêu đề to
//    say --field "Tên | Giá trị" --field "Tên 2 | Giá trị 2" Nội dung
//    say --image <url> --thumb <url> --footer "Ghi chú" Nội dung
//    say --channel #thông-báo Nội dung
//    say --reply <id hoặc link tin nhắn> Nội dung
//    say --anon Nội dung        (gửi qua webhook mang tên bạn)
//    say --silent Nội dung      (không báo tiếng cho ai)
//    say --help                 (xem hướng dẫn đầy đủ)
//
//  AN TOÀN (ping theo ĐÚNG quyền của người gọi lệnh):
//   - Ai có quyền "Nhắc đến @everyone" ở kênh đích thì hò được @everyone/@here
//     và tag được mọi vai trò (kể cả vai trò khóa nhắc).
//   - Người thường vẫn tag được người khác và các vai trò cho phép nhắc tự do.
//   - Bot không bao giờ cho ai ping vượt quyền của chính họ.
//   - Muốn im hoàn toàn: --noping (hoặc cho_ping: false ở lệnh slash).
//   - Chỉ người có quyền "Quản lý tin nhắn" mới được --channel, --anon.
// =============================================================
const { ChannelType, PermissionsBitField, EmbedBuilder } = require('discord.js');
const rng = require('../../core/secureRandom');
const Embed = require('../../core/EmbedFactory');
const chanUtil = require('../../core/channelResolver');
const { colors } = require('../../core/palette');

// ---- Giới hạn của Discord ----
const LIMIT = {
  plain: 2000,
  desc: 4096,
  title: 256,
  footer: 2048,
  author: 256,
  fieldName: 256,
  fieldValue: 1024,
  fields: 25,
  total: 6000,
};
const MAX_CHUNKS = 5; // tối đa 5 tin nhắn khi nội dung thường quá dài

// Không cho ping bất cứ thứ gì (mặc định an toàn tuyệt đối).
const NO_MENTIONS = { parse: [], users: [], roles: [], repliedUser: false };
// Khi người dùng có quyền và bật --ping
const ALLOW_MENTIONS = { parse: ['users', 'roles', 'everyone'], repliedUser: false };

// Cờ tin nhắn im lặng (SuppressNotifications = 1 << 12)
const SILENT_FLAG = 4096;

// ---- Bảng màu gọi theo tên cho dễ nhớ ----
const COLOR_WORDS = {
  do: colors.error, 'đỏ': colors.error, red: colors.error,
  xanh: colors.info, blue: colors.info, duong: colors.info, 'xanhdương': colors.info,
  luc: colors.success, green: colors.success, xanhla: colors.success, 'xanhlá': colors.success,
  vang: colors.warning, 'vàng': colors.warning, yellow: colors.warning,
  gold: colors.gold, kim: colors.gold, 'hoàngkim': colors.gold,
  tim: colors.purple, 'tím': colors.purple, purple: colors.purple,
  hong: colors.pink, 'hồng': colors.pink, pink: colors.pink,
  cam: colors.orange, orange: colors.orange,
  den: colors.dark, 'đen': colors.dark, dark: colors.dark, black: colors.dark,
  aqua: colors.aqua, ngoc: colors.aqua, blurple: colors.blurple,
  trang: 0xffffff, 'trắng': 0xffffff, white: 0xffffff,
  xam: 0x99aab5, 'xám': 0x99aab5, gray: 0x99aab5, grey: 0x99aab5,
};

// Chuyển chuỗi màu người dùng nhập -> số màu; null nếu không hợp lệ.
function parseColor(input) {
  if (input === null || input === undefined) return null;
  const s = String(input).trim().toLowerCase();
  if (!s) return null;
  if (s === 'random' || s === 'ngaunhien' || s === 'ngẫunhiên') {
    // Dùng CSPRNG chung thay cho Math.random (đồng bộ toàn bộ bot).
    return rng.randomInt(0x1000000);
  }
  if (/^#?[0-9a-f]{6}$/.test(s)) return parseInt(s.replace('#', ''), 16);
  if (/^#?[0-9a-f]{3}$/.test(s)) {
    const h = s.replace('#', '');
    return parseInt(h[0] + h[0] + h[1] + h[1] + h[2] + h[2], 16);
  }
  if (/^\d+$/.test(s)) {
    const n = parseInt(s, 10);
    if (n >= 0 && n <= 0xffffff) return n;
  }
  const key = s.replace(/\s+/g, '');
  return Object.prototype.hasOwnProperty.call(COLOR_WORDS, key) ? COLOR_WORDS[key] : null;
}

// Cho phép gõ \n, \t, \\ để tạo xuống dòng / thụt lề thật.
function applyEscapes(text) {
  return String(text)
    .replace(/\\r\\n|\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\\\/g, '\\');
}

// Thay các biến động {user} {server} {channel} {members} {time} {date}
function applyVariables(text, ctx) {
  if (!text || text.indexOf('{') === -1) return text;
  const now = Math.floor(Date.now() / 1000);
  const map = {
    user: ctx.author.username,
    tag: ctx.author.tag || ctx.author.username,
    id: ctx.author.id,
    server: ctx.guild ? ctx.guild.name : 'Tin nhắn riêng',
    channel: ctx.channel && ctx.channel.name ? '#' + ctx.channel.name : 'kênh này',
    members: ctx.guild ? String(ctx.guild.memberCount || 0) : '0',
    time: `<t:${now}:t>`,
    date: `<t:${now}:D>`,
    now: `<t:${now}:F>`,
    rel: `<t:${now}:R>`,
  };
  return text.replace(/\{(user|tag|id|server|channel|members|time|date|now|rel)\}/g, (m, k) => map[k]);
}

// Cắt an toàn theo giới hạn ký tự (thêm dấu … khi bị cắt).
function cut(text, max) {
  if (text === null || text === undefined) return null;
  const s = String(text);
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

// -------------------------------------------------------------
//  Bộ phân tích cờ (--flag). Chạy từ ĐẦU chuỗi, dừng khi gặp
//  một từ không phải cờ hợp lệ hoặc gặp dấu "--" đứng riêng.
//  Hỗ trợ: --flag, --flag giá_trị, --flag=giá_trị, --flag "giá trị dài"
// -------------------------------------------------------------
const ALIASES = {
  // kiểu hiển thị
  plain: 'plain', text: 'plain', thuong: 'plain', tho: 'plain', 'thường': 'plain',
  embed: 'embed', khung: 'embed',
  code: 'code', ma: 'code', 'mã': 'code', khoima: 'code',
  quote: 'quote', trichdan: 'quote', 'tríchdẫn': 'quote',
  spoiler: 'spoiler', an: 'spoiler', 'ẩn': 'spoiler', bimat: 'spoiler',
  h1: 'h1', header: 'h1', tieudeto: 'h1',
  h2: 'h2', h3: 'h3',
  subtext: 'subtext', chuthich: 'subtext', 'chúthích': 'subtext', nho: 'subtext',
  bold: 'bold', dam: 'bold', 'đậm': 'bold',
  italic: 'italic', nghieng: 'italic', 'nghiêng': 'italic',
  // nội dung embed
  title: 'title', tieude: 'title', 'tiêuđề': 'title', 'tiêu_đề': 'title',
  color: 'color', mau: 'color', 'màu': 'color',
  footer: 'footer', chantrang: 'footer', 'chântrang': 'footer',
  author: 'author', tacgia: 'author', 'tácgiả': 'author',
  image: 'image', anh: 'image', 'ảnh': 'image', img: 'image',
  thumb: 'thumb', thumbnail: 'thumb', anhnho: 'thumb', 'ảnhnhỏ': 'thumb',
  url: 'url', link: 'url', lienket: 'url',
  field: 'field', truong: 'field', 'trường': 'field', muc: 'field',
  notime: 'notime', khongthoigian: 'notime',
  // gửi đi
  channel: 'channel', kenh: 'channel', 'kênh': 'channel',
  reply: 'reply', traloi: 'reply', 'trảlời': 'reply', rep: 'reply',
  tts: 'tts', doc: 'tts', 'đọc': 'tts', docto: 'tts',
  silent: 'silent', imlang: 'silent', 'imlặng': 'silent',
  anon: 'anon', anonymous: 'anon', webhook: 'anon', andanh: 'anon', 'ẩndanh': 'anon',
  ping: 'ping', tag: 'ping', mention: 'ping',
  noping: 'noping', khongping: 'noping', 'khôngping': 'noping', im: 'noping',
  keep: 'keep', giulai: 'keep', 'giữlại': 'keep',
  help: 'help', huongdan: 'help', 'hướngdẫn': 'help', tro: 'help',
};

// Cờ dạng bật/tắt (không cần giá trị)
const BOOL_FLAGS = new Set([
  'plain', 'embed', 'quote', 'spoiler', 'h1', 'h2', 'h3', 'subtext',
  'bold', 'italic', 'notime', 'tts', 'silent', 'anon', 'ping', 'noping', 'keep', 'help',
]);
// Cờ nhận giá trị "dài" (tới dấu | hoặc trong dấu nháy)
const LONG_FLAGS = new Set(['title', 'footer', 'author', 'field']);
// Cờ nhận đúng 1 từ
const TOKEN_FLAGS = new Set(['color', 'image', 'thumb', 'url', 'channel', 'reply']);

// Đọc giá trị trong dấu nháy " " hoặc ' ' nếu có.
function readQuoted(str) {
  const m = str.match(/^(?:"([^"]*)"|'([^']*)')\s*/);
  if (!m) return null;
  return { value: (m[1] !== undefined ? m[1] : m[2]).trim(), length: m[0].length };
}

function parseFlags(raw) {
  const flags = { fields: [] };
  let rest = String(raw).trim();

  for (let guard = 0; guard < 40; guard++) {
    // "--" đứng riêng => dừng phân tích cờ, phần còn lại là nội dung
    const stop = rest.match(/^--(\s+|$)/);
    if (stop) {
      rest = rest.slice(stop[0].length);
      break;
    }
    const m = rest.match(/^--([\p{L}\p{N}][\p{L}\p{N}_-]*)(=?)/u);
    if (!m) break;

    const key = ALIASES[m[1].toLowerCase()];
    if (!key) break; // cờ lạ -> coi như nội dung bình thường

    let after = rest.slice(m[0].length);
    const hasEquals = m[2] === '=';
    if (!hasEquals) after = after.replace(/^[ \t]+/, '');

    // --- Cờ bật/tắt ---
    if (BOOL_FLAGS.has(key)) {
      flags[key] = true;
      rest = after;
      continue;
    }

    // --- --code [ngôn ngữ] : ngôn ngữ là tùy chọn ---
    if (key === 'code') {
      const tok = after.match(/^([A-Za-z0-9+#._-]{1,16})(\s+|$)/);
      if (tok && !tok[1].includes('`')) {
        flags.code = tok[1].toLowerCase();
        rest = after.slice(tok[0].length);
      } else {
        flags.code = true;
        rest = after;
      }
      continue;
    }

    // --- Cờ nhận giá trị dài ---
    if (LONG_FLAGS.has(key)) {
      const q = readQuoted(after);
      let value;
      if (q) {
        value = q.value;
        rest = after.slice(q.length);
      } else if (after.includes('|')) {
        const idx = after.indexOf('|');
        value = after.slice(0, idx).trim();
        rest = after.slice(idx + 1).replace(/^\s+/, '');
      } else {
        // Không có nháy và không có "|": lấy tối đa 6 từ đầu (giữ tương thích bản cũ)
        const words = after.split(/\s+/).filter(Boolean);
        value = words.slice(0, 6).join(' ');
        rest = words.slice(6).join(' ');
      }
      if (key === 'field') {
        // --field "Tên | Giá trị"  hoặc  --field Tên=Giá trị
        const sep = value.indexOf('|') !== -1 ? '|' : (value.indexOf('=') !== -1 ? '=' : null);
        if (sep) {
          const p = value.indexOf(sep);
          flags.fields.push({ name: value.slice(0, p).trim(), value: value.slice(p + 1).trim() });
        } else {
          flags.fields.push({ name: value.trim(), value: '\u200b' });
        }
      } else {
        flags[key] = value;
      }
      continue;
    }

    // --- Cờ nhận đúng 1 từ ---
    if (TOKEN_FLAGS.has(key)) {
      const q = readQuoted(after);
      if (q) {
        flags[key] = q.value;
        rest = after.slice(q.length);
      } else {
        const tok = after.match(/^(\S+)\s*/);
        if (!tok) {
          flags[key] = null;
          rest = '';
          break;
        }
        flags[key] = tok[1];
        rest = after.slice(tok[0].length);
      }
      continue;
    }

    break;
  }

  return { text: rest.trim(), flags };
}

// -------------------------------------------------------------
//  Bọc nội dung theo kiểu định dạng đã chọn.
// -------------------------------------------------------------
function formatBody(text, flags) {
  let out = String(text);

  if (flags.code) {
    const lang = typeof flags.code === 'string' ? flags.code : '';
    // Vô hiệu hoá dấu ``` bên trong để không phá khối mã
    const safe = out.replace(/```/g, '`\u200b`\u200b`');
    return '```' + lang + '\n' + safe + '\n```';
  }

  if (flags.bold) out = out.split('\n').map((l) => (l.trim() ? '**' + l + '**' : l)).join('\n');
  if (flags.italic) out = out.split('\n').map((l) => (l.trim() ? '*' + l + '*' : l)).join('\n');

  if (flags.h1) out = out.split('\n').map((l) => (l.trim() ? '# ' + l : l)).join('\n');
  else if (flags.h2) out = out.split('\n').map((l) => (l.trim() ? '## ' + l : l)).join('\n');
  else if (flags.h3) out = out.split('\n').map((l) => (l.trim() ? '### ' + l : l)).join('\n');
  else if (flags.subtext) out = out.split('\n').map((l) => (l.trim() ? '-# ' + l : l)).join('\n');

  if (flags.quote) out = out.split('\n').map((l) => '> ' + l).join('\n');

  if (flags.spoiler) {
    // Không lồng spoiler vào spoiler đã có sẵn
    out = '||' + out.replace(/\|\|/g, '\u200b|\u200b|') + '||';
  }

  return out;
}

// Chia nội dung thường thành nhiều phần <= 2000 ký tự, cắt theo dòng khi có thể.
function splitPlain(text, size = LIMIT.plain) {
  const chunks = [];
  let remain = String(text);
  while (remain.length > size && chunks.length < MAX_CHUNKS - 1) {
    let cutAt = remain.lastIndexOf('\n', size);
    if (cutAt < size * 0.5) cutAt = remain.lastIndexOf(' ', size);
    if (cutAt < size * 0.5) cutAt = size;
    chunks.push(remain.slice(0, cutAt));
    remain = remain.slice(cutAt).replace(/^\n/, '');
  }
  chunks.push(remain.length > size ? remain.slice(0, size - 1) + '…' : remain);
  return chunks.filter((c) => c.length > 0);
}

// Kiểm tra URL http/https hợp lệ (Discord chỉ chấp nhận http/https trong embed).
function isHttpUrl(value) {
  if (!value) return false;
  try {
    const u = new URL(String(value).replace(/^<|>$/g, ''));
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
function cleanUrl(value) {
  return String(value).replace(/^<|>$/g, '');
}

// Lấy ID tin nhắn từ ID thuần hoặc từ link tin nhắn Discord.
function parseMessageRef(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (/^\d{15,25}$/.test(s)) return s;
  const m = s.match(/channels\/(?:\d+|@me)\/(\d+)\/(\d+)/);
  return m ? m[2] : null;
}

// Embed hướng dẫn đầy đủ
function helpEmbed(prefix) {
  return Embed.custom(colors.info, '💬 Hướng dẫn lệnh say',
    'Bot nói lại lời của bạn với gần như **mọi định dạng của Discord**.')
    .addFields(
      {
        name: '🎨 Kiểu hiển thị',
        value:
          '`--plain` văn bản thường · `--embed` khung (mặc định)\n' +
          '`--code [ngôn ngữ]` khối mã · `--quote` trích dẫn\n' +
          '`--spoiler` che nội dung · `--bold` · `--italic`\n' +
          '`--h1` `--h2` `--h3` tiêu đề · `--subtext` chú thích nhỏ',
      },
      {
        name: '🖼️ Tuỳ chỉnh embed',
        value:
          '`--title "Tiêu đề"` · `--color đỏ|#ff0000|random`\n' +
          '`--footer "Chân trang"` · `--author "Tác giả"`\n' +
          '`--image <url>` · `--thumb <url>` · `--url <url>`\n' +
          '`--field "Tên | Giá trị"` (lặp tối đa 25 lần) · `--notime`',
      },
      {
        name: '📤 Cách gửi',
        value:
          '`--channel #kênh` gửi sang kênh khác\n' +
          '`--reply <id/link>` trả lời một tin nhắn\n' +
          '`--anon` gửi qua webhook mang tên bạn\n' +
          '`--silent` không báo tiếng · `--tts` đọc to\n' +
          '`--noping` chặn mọi ping · `--keep` giữ lại tin lệnh\n' +
          'Ping theo đúng quyền của bạn: có quyền **Nhắc đến @everyone** thì hò được cả máy chủ.',
      },
      {
        name: '✨ Mẹo',
        value:
          'Dùng `\\n` để xuống dòng, `\\t` để thụt lề.\n' +
          'Biến động: `{user}` `{tag}` `{server}` `{channel}` `{members}` `{time}` `{date}` `{now}` `{rel}`\n' +
          'Gõ `--` để dừng đọc cờ nếu nội dung của bạn bắt đầu bằng `--`.',
      },
      {
        name: '📌 Ví dụ',
        value:
          '```\n' +
          `${prefix}say Xin chào **mọi người**\n` +
          `${prefix}say --plain Tin nhắn thường\n` +
          `${prefix}say --title "Thông báo" --color đỏ Nội dung\n` +
          `${prefix}say --code js console.log("hi")\n` +
          `${prefix}say --field "Ngày | Hôm nay" --image <url> Nội dung\n` +
          '```',
      },
    )
    .setFooter({ text: 'say • Cubitix Studios' });
}

module.exports = {
  name: 'say',
  aliases: ['echo', 'noi', 'nhaclai'],
  category: 'fun',
  description: 'Bot nói lại lời bạn — hỗ trợ embed, khối mã, trích dẫn, spoiler, tiêu đề, webhook…',
  usage: '[--plain|--code <lang>|--quote|--spoiler|--h1] [--title "…"] [--color …] [--image url] [--field "a | b"] [--channel #kênh] [--reply id] <nội dung>  ·  say --help',
  cooldown: 3,
  slash: true,
  // LƯU Ý: 'nội_dung' phải là option ĐẦU TIÊN và rest=true để chế độ prefix
  // gộp toàn bộ phần còn lại của tin nhắn thành nội dung.
  options: [
    { name: 'nội_dung', type: 'string', description: 'Nội dung bot sẽ nói (hỗ trợ markdown, \\n để xuống dòng)', required: true, rest: true },
    { name: 'kiểu', type: 'string', description: 'embed | plain | quote | spoiler | code | code:js | h1 | h2 | h3 | subtext', required: false },
    { name: 'tiêu_đề', type: 'string', description: 'Tiêu đề của embed', required: false },
    { name: 'màu', type: 'string', description: 'Màu embed: #ff0000, đỏ, xanh, vàng, tím, random…', required: false },
    { name: 'chân_trang', type: 'string', description: 'Chữ ở chân embed', required: false },
    { name: 'tác_giả', type: 'string', description: 'Dòng tác giả ở đầu embed', required: false },
    { name: 'ảnh', type: 'string', description: 'Link ảnh lớn hiển thị trong embed', required: false },
    { name: 'ảnh_nhỏ', type: 'string', description: 'Link ảnh nhỏ (thumbnail) góc phải embed', required: false },
    { name: 'liên_kết', type: 'string', description: 'Link gắn vào tiêu đề embed', required: false },
    { name: 'trường', type: 'string', description: 'Các trường, dạng: Tên | Giá trị ;; Tên 2 | Giá trị 2', required: false },
    // Dùng ô gợi ý (autocomplete) thay cho ô chọn kênh mặc định của Discord.
    // Lý do: ô mặc định chỉ liệt kê kênh mà BOT nhìn thấy và hay bị thiếu kênh mới tạo.
    // Ô gợi ý này lấy danh sách MỚI trực tiếp từ Discord mỗi lần gõ -> luôn đầy đủ.
    { name: 'kênh', type: 'string', channelPicker: true, autocomplete: true, description: 'Kênh nhận tin nhắn (gõ để tìm, mặc định: kênh hiện tại)', required: false, channelFilter: chanUtil.TEXT_LIKE },
    { name: 'trả_lời', type: 'string', description: 'ID hoặc link tin nhắn muốn trả lời', required: false },
    { name: 'ẩn_danh', type: 'boolean', description: 'Gửi qua webhook mang tên & avatar của bạn', required: false },
    { name: 'im_lặng', type: 'boolean', description: 'Gửi im lặng, không báo tiếng cho ai', required: false },
    { name: 'đọc_to', type: 'boolean', description: 'Bật giọng đọc (TTS)', required: false },
    { name: 'cho_ping', type: 'boolean', description: 'Mặc định ping theo quyền của bạn; chọn Không để chặn mọi ping', required: false },
  ],

  async run(ctx) {
    // KHÔNG defer ở đây!
    // Ở nhánh slash thông thường, chính câu trả lời của interaction MÀ là tin nhắn cần nói.
    // Nếu defer dạng ẩn thì tin nhắn đó trở thành "Only you can see this" — chỉ mình thấy.
    // Chỉ defer ở những nhánh gửi tin bằng channel.send/webhook (xem bên dưới).
    const prefix = (ctx.client.config && ctx.client.config.prefix) || '!';
    const rawInput = ctx.getString('nội_dung');

    // ---------- Phân tích cờ ----------
    const parsed = parseFlags(rawInput || '');
    const flags = parsed.flags;
    let text = parsed.text;

    // ---------- Gộp thêm option của slash ----------
    if (ctx.isSlash) {
      const style = (ctx.getString('kiểu') || '').trim().toLowerCase();
      if (style) {
        if (['plain', 'text', 'thuong', 'thường'].includes(style)) flags.plain = true;
        else if (['quote', 'trichdan'].includes(style)) flags.quote = true;
        else if (['spoiler', 'an', 'ẩn'].includes(style)) flags.spoiler = true;
        else if (['h1', 'header'].includes(style)) flags.h1 = true;
        else if (style === 'h2') flags.h2 = true;
        else if (style === 'h3') flags.h3 = true;
        else if (['subtext', 'chuthich'].includes(style)) flags.subtext = true;
        else if (style === 'code' || style.startsWith('code:') || style.startsWith('code ')) {
          const lang = style.slice(4).replace(/^[:\s]+/, '').trim();
          flags.code = lang || true;
        }
      }
      const pick = (opt, key) => {
        const v = ctx.getString(opt);
        if (v) flags[key] = v;
      };
      pick('tiêu_đề', 'title');
      pick('màu', 'color');
      pick('chân_trang', 'footer');
      pick('tác_giả', 'author');
      pick('ảnh', 'image');
      pick('ảnh_nhỏ', 'thumb');
      pick('liên_kết', 'url');
      pick('trả_lời', 'reply');

      // trường: "Tên | Giá trị ;; Tên 2 | Giá trị 2"
      const rawFields = ctx.getString('trường');
      if (rawFields) {
        for (const part of rawFields.split(';;')) {
          const piece = part.trim();
          if (!piece) continue;
          const p = piece.indexOf('|');
          if (p === -1) flags.fields.push({ name: piece, value: '\u200b' });
          else flags.fields.push({ name: piece.slice(0, p).trim(), value: piece.slice(p + 1).trim() });
        }
      }

      if (ctx.getBoolean('ẩn_danh')) flags.anon = true;
      if (ctx.getBoolean('im_lặng')) flags.silent = true;
      if (ctx.getBoolean('đọc_to')) flags.tts = true;
      // Không chọn gì (null) = ping theo quyền của người dùng.
      // Chọn rõ "Không" mới chặn sạch ping.
      if (ctx.getBoolean('cho_ping') === false) flags.noping = true;

      const slashChannel = await ctx.getChannelAsync('kênh');
      if (slashChannel) flags.channelObj = slashChannel;
    }

    // ---------- Hướng dẫn ----------
    if (flags.help || /^(help|\?|huongdan|hướng dẫn)$/i.test((rawInput || '').trim())) {
      return ctx.reply({ embeds: [helpEmbed(prefix)] });
    }

    // ---------- Xử lý escape & biến ----------
    text = applyVariables(applyEscapes(text), ctx);
    for (const k of ['title', 'footer', 'author']) {
      if (typeof flags[k] === 'string') flags[k] = applyVariables(applyEscapes(flags[k]), ctx);
    }
    flags.fields = (flags.fields || []).map((f) => ({
      name: applyVariables(applyEscapes(f.name || '\u200b'), ctx),
      value: applyVariables(applyEscapes(f.value || '\u200b'), ctx),
    }));

    // ---------- Tệp đính kèm (chế độ prefix) ----------
    const files = [];
    if (!ctx.isSlash && ctx.message && ctx.message.attachments && ctx.message.attachments.size) {
      for (const att of ctx.message.attachments.values()) {
        if (files.length >= 10) break;
        files.push({ attachment: att.url, name: att.name || 'file' });
      }
    }

    // ---------- Có gì để gửi không? ----------
    const hasEmbedExtras =
      Boolean(flags.title || flags.footer || flags.author || flags.image || flags.thumb) ||
      flags.fields.length > 0;
    if (!text && !files.length && !hasEmbedExtras) {
      return ctx.reply({
        embeds: [
          Embed.error(
            'Thiếu nội dung',
            'Hãy nhập nội dung muốn bot nói.\n\n' +
              '**Ví dụ:**\n' +
              `\`${prefix}say Xin chào **mọi người**\`\n` +
              `\`${prefix}say --plain Tin nhắn không có embed\`\n` +
              `\`${prefix}say --title "Thông báo" Nội dung ở đây\`\n` +
              `\`${prefix}say --color #ff0000 Chữ trong embed đỏ\`\n` +
              `\`${prefix}say --code js console.log("hi")\`\n` +
              `\`${prefix}say --spoiler Nội dung bí mật\`\n\n` +
              `Xem đầy đủ: \`${prefix}say --help\``,
          ),
        ],
      });
    }

    // ---------- Quyền của người dùng ----------
    const canManage = Boolean(
      ctx.member && ctx.member.permissions && ctx.member.permissions.has(PermissionsBitField.Flags.ManageMessages),
    );

    // ---------- Kênh đích ----------
    let target = ctx.channel;
    let redirected = false;
    const channelRef = flags.channelObj || flags.channel;
    if (channelRef) {
      let ch = flags.channelObj || null;
      if (!ch && ctx.message && ctx.message.mentions.channels.size) {
        ch = ctx.message.mentions.channels.first();
      }
      if (!ch && typeof channelRef === 'string') {
        // Tìm theo ID / <#id> / tên kênh, CÓ làm mới danh sách từ Discord
        // nên kênh vừa tạo xong cũng dùng được ngay.
        ch = await chanUtil.resolveChannel(ctx.guild, channelRef);
      }
      if (!ch) {
        return ctx.reply({ embeds: [Embed.error('Không tìm thấy kênh', `Hãy nhắc tên kênh, ví dụ: \`${prefix}say --channel #thông-báo Nội dung\``)] });
      }
      if (typeof ch.isTextBased !== 'function' || !ch.isTextBased() || ch.type === ChannelType.GuildCategory) {
        return ctx.reply({ embeds: [Embed.error('Kênh không hợp lệ', 'Chỉ có thể gửi vào kênh văn bản.')] });
      }
      if (!canManage) {
        return ctx.reply({ embeds: [Embed.error('Thiếu quyền', 'Bạn cần quyền **Quản lý tin nhắn** để gửi sang kênh khác.')] });
      }
      const me = ctx.guild && ctx.guild.members.me;
      if (me) {
        const perms = ch.permissionsFor(me);
        if (!perms || !perms.has(PermissionsBitField.Flags.SendMessages) || !perms.has(PermissionsBitField.Flags.ViewChannel)) {
          return ctx.reply({ embeds: [Embed.error('Tôi không gửi được', `Tôi không có quyền gửi tin nhắn trong ${ch}.`)] });
        }
      }
      target = ch;
      redirected = ch.id !== ctx.channel.id;
    }

    // ---------- Cho phép ping? ----------
    // Ping theo ĐÚNG quyền của người gọi lệnh, xét ngay tại kênh đích:
    //  • Có quyền "Nhắc đến @everyone"  -> hò được @everyone/@here + mọi vai trò.
    //  • Không có quyền đó            -> vẫn tag được người và vai trò cho nhắc tự do.
    // Như vậy bot không trở thành đường vòng để ping vượt quyền.
    const meForPing = ctx.guild && ctx.guild.members.me;
    const permsOf = (holder) => {
      if (!holder) return null;
      if (typeof holder.permissionsIn === 'function') return holder.permissionsIn(target);
      if (typeof target.permissionsFor === 'function') return target.permissionsFor(holder);
      return holder.permissions || null;
    };
    const hasPerm = (perms, flag) => Boolean(perms && typeof perms.has === 'function' && perms.has(flag));
    const userCanEveryone = hasPerm(permsOf(ctx.member), PermissionsBitField.Flags.MentionEveryone);
    const botPingPerms = permsOf(meForPing);
    // Đọc không ra quyền của bot thì cứ thả — Discord sẽ tự chặn nếu bot thiếu quyền.
    const botCanEveryone = !botPingPerms || hasPerm(botPingPerms, PermissionsBitField.Flags.MentionEveryone);

    let allowedMentions;
    if (flags.noping) {
      allowedMentions = NO_MENTIONS;
    } else if (userCanEveryone && botCanEveryone) {
      allowedMentions = ALLOW_MENTIONS;
    } else {
      // Chỉ thả những vai trò mà chính người dùng cũng tag được (vai trò được phép nhắc tự do).
      const wanted = new Set();
      const roleRe = /<@&(\d+)>/g;
      let rm;
      while ((rm = roleRe.exec(String(text || ''))) !== null) wanted.add(rm[1]);
      const roleCache = ctx.guild && ctx.guild.roles ? ctx.guild.roles.cache : null;
      const okRoles = [...wanted].filter((id) => {
        const r = roleCache && typeof roleCache.get === 'function' ? roleCache.get(id) : null;
        return Boolean(r && r.mentionable);
      });
      allowedMentions = { parse: ['users'], roles: okRoles.slice(0, 20), repliedUser: false };
    }

    // ---------- Báo nhận sớm cho các nhánh "gửi hộ" ----------
    // Các nhánh này gửi tin bằng channel.send/webhook rồi mới báo lại, nên câu trả lời
    // interaction chỉ là biên nhận -> ẩn được, và tránh được lỗi "did not respond"
    // vì phía sau còn phải tải tin nhắn cần trả lời hoặc tạo webhook.
    // Nhánh nói trực tiếp KHÔNG defer: tin nhắn phải hiện cho cả kênh.
    const willSendSeparately = Boolean(redirected || flags.anon || flags.reply);
    if (ctx.isSlash && willSendSeparately) await ctx.defer(true);

    // ---------- Tin nhắn được trả lời ----------
    let replyToId = null;
    if (flags.reply) {
      replyToId = parseMessageRef(flags.reply);
      if (!replyToId) {
        return ctx.reply({ embeds: [Embed.error('Không đọc được tin nhắn', 'Hãy dán **ID** hoặc **link** của tin nhắn muốn trả lời.')] });
      }
      const found = await target.messages.fetch(replyToId).catch(() => null);
      if (!found) {
        return ctx.reply({ embeds: [Embed.error('Không tìm thấy tin nhắn', 'Tin nhắn đó không nằm trong kênh đích hoặc đã bị xoá.')] });
      }
    } else if (!ctx.isSlash && ctx.message && ctx.message.reference && ctx.message.reference.messageId && !redirected) {
      // Gõ lệnh bằng cách reply một tin nhắn -> tự động trả lời tin nhắn đó
      replyToId = ctx.message.reference.messageId;
    }

    // ---------- Dựng payload ----------
    const useEmbed = !flags.plain && !flags.anon; // webhook gửi dạng văn bản cho tự nhiên
    const payload = { allowedMentions };
    if (flags.tts) payload.tts = true;
    if (flags.silent) payload.flags = SILENT_FLAG;
    if (files.length) payload.files = files;
    if (replyToId) payload.reply = { messageReference: replyToId, failIfNotExists: false };

    let extraChunks = [];

    if (!useEmbed) {
      // ----- Văn bản thường / webhook -----
      const body = formatBody(text, flags);
      const chunks = splitPlain(body);
      payload.content = chunks[0] || '\u200b';
      extraChunks = chunks.slice(1);
    } else {
      // ----- Embed đầy đủ -----
      const color = parseColor(flags.color);
      const embed = new EmbedBuilder().setColor(color === null ? colors.info : color);

      const body = formatBody(text, flags);
      if (body) embed.setDescription(cut(body, LIMIT.desc));

      if (flags.title) embed.setTitle(cut(flags.title, LIMIT.title));
      else if (!hasEmbedExtras || flags.fields.length === 0) embed.setTitle('💬 Tin nhắn');

      if (flags.url) {
        if (!isHttpUrl(flags.url)) {
          return ctx.reply({ embeds: [Embed.error('Liên kết không hợp lệ', 'Liên kết phải bắt đầu bằng `http://` hoặc `https://`.')] });
        }
        if (!embed.data.title) embed.setTitle('💬 Tin nhắn');
        embed.setURL(cleanUrl(flags.url));
      }
      if (flags.image) {
        if (!isHttpUrl(flags.image)) {
          return ctx.reply({ embeds: [Embed.error('Ảnh không hợp lệ', 'Link ảnh phải bắt đầu bằng `http://` hoặc `https://`.')] });
        }
        embed.setImage(cleanUrl(flags.image));
      }
      if (flags.thumb) {
        if (!isHttpUrl(flags.thumb)) {
          return ctx.reply({ embeds: [Embed.error('Ảnh nhỏ không hợp lệ', 'Link ảnh nhỏ phải bắt đầu bằng `http://` hoặc `https://`.')] });
        }
        embed.setThumbnail(cleanUrl(flags.thumb));
      }
      if (flags.author) {
        embed.setAuthor({ name: cut(flags.author, LIMIT.author), iconURL: ctx.author.displayAvatarURL() });
      }
      if (flags.fields.length) {
        embed.addFields(
          flags.fields.slice(0, LIMIT.fields).map((f) => ({
            name: cut(f.name || '\u200b', LIMIT.fieldName) || '\u200b',
            value: cut(f.value || '\u200b', LIMIT.fieldValue) || '\u200b',
            inline: false,
          })),
        );
      }

      const footerText = flags.footer
        ? cut(flags.footer, LIMIT.footer)
        : `Yêu cầu bởi ${ctx.author.tag || ctx.author.username}`;
      embed.setFooter({ text: footerText });
      if (!flags.notime) embed.setTimestamp();

      // Không có gì để hiển thị -> tránh lỗi "embed rỗng"
      if (!embed.data.description && !embed.data.image && !embed.data.thumbnail && !(embed.data.fields || []).length) {
        embed.setDescription('\u200b');
      }
      payload.embeds = [embed];
    }

    // ---------- Hàm gửi (thường hoặc webhook) ----------
    const sendVia = async (channel, data) => {
      if (!flags.anon) return channel.send(data).catch(() => null);

      // Gửi qua webhook mang tên & avatar người dùng
      const me = ctx.guild && ctx.guild.members.me;
      const canHook = me && channel.permissionsFor(me)?.has(PermissionsBitField.Flags.ManageWebhooks);
      if (!canHook || typeof channel.fetchWebhooks !== 'function') return channel.send(data).catch(() => null);

      try {
        const hooks = await channel.fetchWebhooks();
        let hook = hooks.find((h) => h.owner && ctx.client.user && h.owner.id === ctx.client.user.id && h.token);
        if (!hook) {
          hook = await channel.createWebhook({ name: 'Cubitix Say', reason: `say --anon bởi ${ctx.author.tag}` });
        }
        const displayName =
          (ctx.member && ctx.member.displayName) || ctx.author.username || 'Ẩn danh';
        const hookData = Object.assign({}, data, {
          username: displayName.slice(0, 80),
          avatarURL: ctx.author.displayAvatarURL(),
        });
        delete hookData.reply; // webhook không hỗ trợ reply
        return await hook.send(hookData);
      } catch {
        return channel.send(data).catch(() => null);
      }
    };

    // ---------- Kiểm tra quyền dùng --anon ----------
    if (flags.anon && !canManage) {
      return ctx.reply({ embeds: [Embed.error('Thiếu quyền', 'Bạn cần quyền **Quản lý tin nhắn** để gửi ẩn danh (`--anon`).')] });
    }

    // =============================================================
    //  GỬI ĐI
    // =============================================================

    // --- Chế độ prefix: xoá tin nhắn lệnh cho gọn rồi gửi tin mới ---
    if (!ctx.isSlash) {
      const me = ctx.guild && ctx.guild.members.me;
      const canDelete =
        !flags.keep && me && ctx.channel.permissionsFor(me)?.has(PermissionsBitField.Flags.ManageMessages);
      // Xoá sau khi đã đọc xong đính kèm (URL đính kèm vẫn dùng được sau khi xoá)
      if (canDelete) await ctx.message.delete().catch(() => {});

      const sent = await sendVia(target, payload);
      if (!sent) {
        return ctx.channel
          .send({ embeds: [Embed.error('Không gửi được', 'Tôi không thể gửi tin nhắn vào kênh đó. Hãy kiểm tra lại quyền của bot.')] })
          .catch(() => {});
      }
      for (const chunk of extraChunks) {
        await sendVia(target, { content: chunk, allowedMentions }).catch(() => {});
      }

      if (redirected) {
        return ctx.channel
          .send({ embeds: [Embed.success('Đã gửi', `Tin nhắn đã được gửi tới ${target}.`)] })
          .then((m) => setTimeout(() => m.delete().catch(() => {}), 6000))
          .catch(() => {});
      }
      return sent;
    }

    // --- Chế độ slash ---
    // Gửi sang kênh khác / ẩn danh / có phần nối thêm -> gửi riêng rồi báo lại.
    if (redirected || flags.anon || extraChunks.length || replyToId) {
      const sent = await sendVia(target, payload);
      for (const chunk of extraChunks) {
        await sendVia(target, { content: chunk, allowedMentions }).catch(() => {});
      }
      return ctx.reply({
        embeds: [
          sent
            ? Embed.success('Đã gửi', `Tin nhắn đã được gửi tới ${target}.`)
            : Embed.error('Không gửi được', 'Tôi không thể gửi tin nhắn vào kênh đó. Hãy kiểm tra lại quyền của bot.'),
        ],
      });
    }

    // Trả lời trực tiếp trong interaction
    const direct = Object.assign({}, payload);
    delete direct.reply;
    return ctx.reply(direct);
  },
};
