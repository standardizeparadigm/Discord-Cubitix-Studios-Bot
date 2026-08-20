// =============================================================
//  eventHandler - tự động nạp tất cả sự kiện trong modules/events
// =============================================================
const fs = require('fs');
const path = require('path');

module.exports = async function loadEvents(client) {
  const eventsPath = path.join(__dirname, '..', 'events');
  if (!fs.existsSync(eventsPath)) return;

  const files = fs.readdirSync(eventsPath).filter((f) => f.endsWith('.js'));
  let loaded = 0;

  for (const file of files) {
    // Bọc try/catch để một file sự kiện lỗi không làm sập toàn bộ bot lúc khởi động.
    try {
      const event = require(path.join(eventsPath, file));
      if (!event || !event.name || typeof event.execute !== 'function') {
        client.logger.warn(`Bỏ qua sự kiện ${file} (thiếu 'name' hoặc 'execute').`);
        continue;
      }
      // Bắt lỗi bên trong từng sự kiện để tránh unhandledRejection
      const safeExecute = async (...args) => {
        try {
          await event.execute(client, ...args);
        } catch (err) {
          client.logger.error(`Lỗi trong sự kiện "${event.name}": ${err?.stack || err}`);
        }
      };
      if (event.once) {
        client.once(event.name, safeExecute);
      } else {
        client.on(event.name, safeExecute);
      }
      loaded++;
    } catch (err) {
      client.logger.error(`Không nạp được sự kiện ${file}: ${err?.stack || err}`);
    }
  }

  client.logger.success(`Đã nạp ${loaded} sự kiện.`);
};
