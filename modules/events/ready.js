// =============================================================
//  Sự kiện: ready - chạy 1 lần khi bot online
//  - In thông tin
//  - Đặt trạng thái xoay vòng (rotating presence)
//  - Tự động đăng ký slash command
//  Lưu ý: dùng 'ready' để tương thích toàn bộ discord.js v14.
// =============================================================
const { REST, Routes, ActivityType } = require('discord.js');

module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    const { config, logger } = client;
    logger.success(`Đã đăng nhập: ${client.user.tag}`);
    // Dùng tổng memberCount thay cho users.cache (cache luôn gần như rỗng lúc mới bật).
    const totalMembers = client.guilds.cache.reduce((a, g) => a + (g.memberCount || 0), 0);
    logger.info(`Đang phục vụ ${client.guilds.cache.size} máy chủ, ${totalMembers} người dùng.`);
    logger.info(`Prefix: "${config.prefix}" | Slash: ${config.enableSlash ? 'Bật' : 'Tắt'}`);

    // --- Trạng thái xoay vòng ---
    client.presenceLocked = false; // khi bật (setstatus), giữ nguyên trạng thái tùy chỉnh
    let i = 0;
    const update = () => {
      if (client.presenceLocked) return; // chủ bot đã đặt trạng thái thủ công -> không xoay vòng
      const totalUsers = client.guilds.cache.reduce((a, g) => a + (g.memberCount || 0), 0);
      const text = (config.activities[i % config.activities.length] || 'Cubitix Studios')
        .replaceAll('{prefix}', config.prefix)
        .replaceAll('{guilds}', String(client.guilds.cache.size))
        .replaceAll('{users}', String(totalUsers));
      client.user.setActivity(text, { type: ActivityType.Watching });
      i++;
    };
    update();
    // Lưu lại đồng hồ để có thể dừng khi tắt bot; unref() để không giữ tiến trình sống mãi.
    if (client.presenceTimer) clearInterval(client.presenceTimer);
    client.presenceTimer = setInterval(update, 15000);
    if (typeof client.presenceTimer.unref === 'function') client.presenceTimer.unref();

    // --- Đăng ký slash command ---
    if (config.enableSlash && config.clientId && client.slashData.length) {
      const rest = new REST({ version: '10' }).setToken(config.token);
      try {
        if (config.guildId) {
          await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
            body: client.slashData,
          });
          logger.success(`Đã đăng ký ${client.slashData.length} slash command cho máy chủ test.`);
        } else {
          await rest.put(Routes.applicationCommands(config.clientId), { body: client.slashData });
          logger.success(`Đã đăng ký ${client.slashData.length} slash command toàn cầu.`);
        }
      } catch (err) {
        logger.warn('Không thể đăng ký slash command: ' + err.message);
        logger.warn('Kiểm tra lại CLIENT_ID trong file .env.');
      }
    } else if (config.enableSlash && !config.clientId) {
      logger.warn('Chưa có CLIENT_ID nên bỏ qua đăng ký slash command (lệnh prefix vẫn hoạt động).');
    }

    // --- Khôi phục các đợt giveaway còn dở ---
    // Giveaway được lưu trong data/giveaways.json nên không mất khi restart;
    // ở đây ta hẹn lại giờ kết thúc cho chúng.
    try {
      const giveaway = require('../core/giveawayManager');
      const resumed = giveaway.scheduleAll(client);
      if (resumed) logger.info(`Đã khôi phục ${resumed} đợt giveaway đang diễn ra.`);
    } catch (err) {
      logger.warn('Không thể khôi phục giveaway: ' + err.message);
    }

    // --- Nạp sẵn danh sách kênh của mọi máy chủ ---
    // Nhờ vậy các lệnh tìm kênh theo tên hoạt động đúng ngay từ giây đầu tiên.
    try {
      const chanUtil = require('../core/channelResolver');
      let n = 0;
      for (const guild of client.guilds.cache.values()) {
        const list = await chanUtil.fetchAllChannels(guild, { force: true });
        n += list.length;
      }
      logger.info(`Đã nạp ${n} kênh vào bộ nhớ đệm.`);
    } catch (err) {
      logger.warn('Không nạp được danh sách kênh: ' + err.message);
    }

    // --- SỬA LỖI: khôi phục trạng thái "đang bảo trì" sau khi bot khởi động lại ---
    // Trước đây nếu bot bị restart trong lúc đang bảo trì, trạng thái hiển thị
    // lại trở về "online" bình thường dù chế độ bảo trì vẫn còn bật.
    try {
      const mt = require('../core/maintenanceStore');
      const maintenanceCmd = require('../commands/owner/maintenance');
      if (mt.isEnabled() && typeof maintenanceCmd.applyPresence === 'function') {
        maintenanceCmd.applyPresence(client, true);
        logger.warn('Chế độ bảo trì vẫn đang BẬT -> đã khôi phục trạng thái "Đang bảo trì".');
      }
    } catch (err) {
      logger.warn('Không khôi phục được trạng thái bảo trì: ' + err.message);
    }

    // --- Hai hệ thống chống gian lận ---
    // Nạp sẵn để hai công tắc toàn cục được đăng ký ngay khi bot bật (mặc định BẬT),
    // và in trạng thái hiện tại để chủ bot dễ theo dõi.
    try {
      const abuseGuard = require('../core/abuseGuard');
      const st = abuseGuard.status();
      logger.info(
        'Chống bot tự động: ' +
          (st.switches.automation.on ? 'BẬT' : 'TẮT') +
          ' | Chống acc clone: ' +
          (st.switches.alt.on ? 'BẬT' : 'TẮT') +
          ' | Mức độ: ' +
          (st.config.preset || 'balanced') +
          ' | Hồ sơ đang theo dõi: ' +
          st.counts.profiles,
      );
      if (!st.switches.automation.on || !st.switches.alt.on) {
        logger.warn(
          'Có hệ thống chống gian lận đang TẮT trên TOÀN BỘ máy chủ. Gõ ' + config.prefix + 'antiabuse để bật lại.',
        );
      }
    } catch (err) {
      logger.warn('Không nạp được hệ thống chống gian lận: ' + err.message);
    }

    // --- Hệ thống xử lý (cảnh cáo / cấm tạm / cấm vĩnh viễn) — LTS ---
    // Bắt buộc phải bật đồng hồ ở đây: nó là thứ duy nhất phát hiện án cấm
    // tạm VỪA HẾT HẠN để nhắn tin "bạn chơi lại được rồi" cho người chơi.
    // Không có nó thì người bị cấm tạm phải tự mò thử xem hết hạn chưa.
    try {
      const sanctions = require('../core/sanctions');
      const sstore = require('../core/sanctionStore');
      sanctions.startTicker(client, 60 * 1000);

      // Dọn hồ sơ quá cũ ngay khi bật, rồi lặp lại mỗi 6 giờ.
      const pruneAll = () => {
        try {
          const a = sstore.prune();
          const b = require('../core/abuseStore').prune();
          if (a || b) logger.info(`Dọn dữ liệu cũ: ${a} hồ sơ xử lý, ${b} mục chống gian lận.`);
        } catch (err) {
          logger.warn('Không dọn được dữ liệu cũ: ' + (err && err.message ? err.message : err));
        }
      };
      pruneAll();
      if (client.pruneTimer) clearInterval(client.pruneTimer);
      client.pruneTimer = setInterval(pruneAll, 6 * 60 * 60 * 1000);
      client.pruneTimer.unref?.();

      const sst = sanctions.status();
      logger.info(
        'Hệ thống xử lý: ' +
          (sst.on ? 'BẬT' : 'TẮT') +
          ' | Bộ cấu hình: ' +
          sst.presetLabel +
          ' | Đang cấm vĩnh viễn: ' +
          sst.stats.activeBans +
          ' | Đang cấm tạm: ' +
          sst.stats.activeMutes +
          ' | Đơn kháng nghị chờ: ' +
          sst.stats.pendingAppeals,
      );
      if (sst.stats.pendingAppeals > 0) {
        logger.warn(
          'Có ' +
            sst.stats.pendingAppeals +
            ' đơn kháng nghị đang chờ bạn xem. Gõ ' +
            config.prefix +
            'xuly để mở bảng.',
        );
      }
      if (sst.config.observeOnly) {
        logger.warn('Hệ thống xử lý đang ở chế độ CHỈ QUAN SÁT — ghi nhận nhưng không thi hành án nào.');
      }
    } catch (err) {
      logger.warn('Không nạp được hệ thống xử lý: ' + (err && err.message ? err.message : err));
    }

    logger.success('Bot đã sẵn sàng! Gõ ' + config.prefix + 'help để bắt đầu.');
  },
};
