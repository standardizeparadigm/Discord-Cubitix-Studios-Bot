// =============================================================
//  Cubitix Studios - All In One Discord Bot
//  File khởi động chính
// =============================================================
const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const config = require('./config');
const logger = require('./modules/core/logger');
const loadCommands = require('./modules/handlers/commandHandler');
const loadEvents = require('./modules/handlers/eventHandler');

logger.banner(config.brand);

// --- Kiểm tra token trước khi chạy ---
if (!config.token) {
  logger.error('Chưa có DISCORD_TOKEN! Hãy mở file .env và điền token của bot.');
  logger.error('Xem hướng dẫn chi tiết trong file HUONG_DAN_SU_DUNG.txt.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    // SỬA LỖI: thiếu intent này nên hai sự kiện inviteCreate / inviteDelete
    // chưa bao giờ được gọi -> bộ nhận diện người mời bị sai sau khi có
    // lời mời mới được tạo hoặc bị xoá. Đây cũng là dữ liệu để
    // hệ thống chống acc clone phát hiện "cùng một người mời hàng loạt acc".
    GatewayIntentBits.GuildInvites,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction],
});

// --- Gắn các thuộc tính dùng chung ---
client.config = config;
client.logger = logger;
client.commands = new Collection();
client.aliases = new Collection();
client.cooldowns = new Collection();
client.slashData = [];
client.categories = [];

// =============================================================
//  Phần dành cho việc chạy 24/7
//  Discord hay ngắt rồi nối lại kết nối. Nếu không ai lắng nghe sự kiện 'error'
//  thì Node sẽ ném lỗi ra ngoài, làm log khó đọc và có thể dừng tiến trình.
// =============================================================
client.on('error', (err) => logger.error('Lỗi kết nối Discord: ' + (err?.message || err)));
client.on('shardError', (err, id) => logger.error(`Lỗi shard #${id ?? 0}: ` + (err?.message || err)));
client.on('shardDisconnect', (event, id) =>
  logger.warn(`Shard #${id ?? 0} đã ngắt kết nối (mã ${event?.code ?? '?'}). Đang chờ nối lại...`),
);
client.on('shardReconnecting', (id) => logger.info(`Shard #${id ?? 0} đang nối lại...`));
client.on('shardResume', (id) => logger.success(`Shard #${id ?? 0} đã nối lại bình thường.`));
// Phiên bị vô hiệu (token bị thu hồi, bị đá khỏi gateway...): không thể tự hồi phục,
// thoát hẳn để trình quản lý (pm2 / systemd / host) khởi động lại sạch sẽ.
client.on('invalidated', () => {
  logger.error('Phiên đăng nhập đã bị vô hiệu. Thoát để được khởi động lại.');
  process.exit(1);
});

(async () => {
  try {
    await loadCommands(client);
    await loadEvents(client);
    await client.login(config.token);
  } catch (err) {
    const msg = String(err?.message || err);
    if (/token|unauthorized|401/i.test(msg)) {
      logger.error('Đăng nhập thất bại: TOKEN không hợp lệ hoặc đã bị thu hồi.');
      logger.error('Hãy mở file .env và dán lại DISCORD_TOKEN mới từ Discord Developer Portal.');
    } else if (/disallowed intents|used disallowed/i.test(msg)) {
      logger.error('Đăng nhập thất bại: chưa bật Privileged Gateway Intents.');
      logger.error('Vào Discord Developer Portal > Bot > bật "MESSAGE CONTENT INTENT" và "SERVER MEMBERS INTENT".');
    } else {
      logger.error('Không thể khởi động bot: ' + (err?.stack || msg));
    }
    process.exit(1);
  }
})();

// --- Bắt lỗi toàn cục để bot không bị sập ---
process.on('unhandledRejection', (err) => logger.error('Lỗi chưa bắt (promise): ' + (err?.stack || err)));
process.on('uncaughtException', (err) => logger.error('Lỗi chưa bắt (exception): ' + (err?.stack || err)));

// --- Tắt máy êm ái ---
// Khi host restart hoặc deploy, nó gửi SIGTERM (Ctrl+C là SIGINT). Đóng kết nối tử tế
// để Discord thấy bot offline ngay, tránh treo phiên cũ và tránh trạng thái "zombie".
let shuttingDown = false;
const shutdown = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.warn(`Nhận ${signal} - đang tắt bot...`);
  // Hết 5 giây mà chưa xong thì thoát luôn, không để treo tiến trình.
  const hardExit = setTimeout(() => process.exit(0), 5000);
  hardExit.unref?.();
  Promise.resolve()
    .then(() => client.destroy())
    .catch(() => {})
    .finally(() => {
      logger.success('Đã đóng kết nối. Tạm biệt!');
      process.exit(0);
    });
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
