// =============================================================
//  deploy-commands.js - đăng ký slash command THỦ CÔNG
//  Thường bạn KHÔNG cần chạy file này vì bot tự đăng ký khi khởi động.
//  Chỉ dùng khi muốn đồng bộ lại thủ công: node deploy-commands.js
// =============================================================
const { REST, Routes, Collection } = require('discord.js');
const config = require('./config');
const logger = require('./modules/core/logger');

const fakeClient = {
  config,
  logger,
  commands: new Collection(),
  aliases: new Collection(),
  slashData: [],
};

(async () => {
  if (!config.token || !config.clientId) {
    logger.error('Cần có DISCORD_TOKEN và CLIENT_ID trong file .env để đăng ký lệnh.');
    process.exit(1);
  }
  await require('./modules/handlers/commandHandler')(fakeClient);

  const rest = new REST({ version: '10' }).setToken(config.token);
  try {
    logger.info(`Đang đăng ký ${fakeClient.slashData.length} slash command...`);
    if (config.guildId) {
      await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
        body: fakeClient.slashData,
      });
      logger.success('Đã đăng ký lệnh cho máy chủ test (cập nhật ngay lập tức).');
    } else {
      await rest.put(Routes.applicationCommands(config.clientId), { body: fakeClient.slashData });
      logger.success('Đã đăng ký lệnh toàn cầu (có thể mất tới 1 giờ để hiển thị).');
    }
  } catch (err) {
    logger.error('Đăng ký thất bại: ' + err.message);
  }
})();
