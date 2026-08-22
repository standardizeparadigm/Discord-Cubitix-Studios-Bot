// =============================================================
//  Sự kiện: interactionCreate - xử lý slash command & gợi ý (autocomplete)
// =============================================================
const CommandContext = require('../core/CommandContext');
const runCommand = require('../core/runner');
const giveaway = require('../core/giveawayManager');
const chan = require('../core/channelResolver');
const maintenance = require('../core/maintenanceStore');

function findCommand(client, name) {
  return client.commands.get(name) || client.commands.get(client.aliases.get(name));
}

module.exports = {
  name: 'interactionCreate',
  async execute(client, interaction) {
    // --- Gợi ý động (autocomplete) ---
    // Nhờ đây, ô chọn kênh luôn được lấy MỚI từ Discord: kênh vừa tạo xong
    // là hiện ngay, không cần khởi động lại bot.
    if (typeof interaction.isAutocomplete === 'function' && interaction.isAutocomplete()) {
      // Đang bảo trì: không gợi ý gì cho người không được phép, tránh việc
      // họ gõ xong rồi mới bị từ chối.
      const command = findCommand(client, interaction.commandName);
      try {
        // Lấy vai trò của thành viên để xét miễn trừ theo vai trò (trước đây bị bỏ sót).
        let roleIds = null;
        try {
          const rc = interaction.member && interaction.member.roles ? interaction.member.roles.cache : null;
          if (rc && typeof rc.keys === 'function') roleIds = Array.from(rc.keys());
          else if (Array.isArray(interaction.member?.roles)) roleIds = interaction.member.roles;
        } catch (_) {
          roleIds = null;
        }
        const uid = interaction.user?.id;
        const ownerId = client.config?.ownerId;
        const cmdName = command ? command.name : interaction.commandName;
        if (
          !maintenance.canUse(uid, ownerId, roleIds) ||
          !maintenance.canUseCommand(cmdName, uid, ownerId, roleIds)
        ) {
          return interaction.respond([]).catch(() => {});
        }
      } catch {
        /* lỗi kiểm tra bảo trì không được chặn gợi ý bình thường */
      }
      if (!command) return interaction.respond([]).catch(() => {});
      try {
        if (typeof command.autocomplete === 'function') {
          await command.autocomplete(interaction, client);
          return;
        }
        const focused = interaction.options.getFocused(true);
        const spec = (command.options || []).find(
          (o) => String(o.name).toLowerCase() === String(focused.name).toLowerCase(),
        );
        if (spec && spec.channelPicker) {
          await chan.autocompleteChannels(interaction, { types: spec.channelFilter || null });
          return;
        }
        await interaction.respond([]).catch(() => {});
      } catch (err) {
        client.logger?.error?.(`Lỗi autocomplete "${interaction.commandName}": ${err?.message || err}`);
        interaction.respond([]).catch(() => {});
      }
      return;
    }

    // Nút của giveaway được xử lý toàn cục tại đây, KHÔNG dùng collector,
    // để giveaway vẫn hoạt động bình thường sau khi bot khởi động lại.
    if (
      typeof interaction.isButton === 'function' &&
      interaction.isButton() &&
      typeof interaction.customId === 'string' &&
      interaction.customId.startsWith('gw:')
    ) {
      try {
        await giveaway.handleButton(client, interaction);
      } catch (err) {
        client.logger?.error?.(`Lỗi nút giveaway: ${err?.message || err}`);
      }
      return;
    }

    // --- Nút bấm nhanh trong tin nhắn báo án gửi riêng cho chủ bot (LTS) ---
    // Phải xử lý TOÀN CỤC ở đây, không dùng collector: tin nhắn riêng còn
    // nằm trong hộp thư rất lâu, kể cả sau khi bot khởi động lại. Nếu dùng
    // collector thì bấm vào sẽ không có gì xảy ra — rất khó hiểu cho chủ bot.
    if (
      typeof interaction.isButton === 'function' &&
      interaction.isButton() &&
      typeof interaction.customId === 'string' &&
      interaction.customId.startsWith('sc:quick:')
    ) {
      try {
        if (interaction.user.id !== client.config.ownerId) {
          await interaction.reply({ content: '⛔ Chỉ chủ bot dùng được nút này.', ephemeral: true }).catch(() => {});
          return;
        }
        const parts = interaction.customId.split(':');
        const act = parts[2] || '';
        const uid = parts[3] || '';
        if (!/^\d{5,25}$/.test(uid)) {
          await interaction.reply({ content: '❌ Nút này thiếu ID người dùng.', ephemeral: true }).catch(() => {});
          return;
        }
        const sanctions = require('../core/sanctions');
        const sstore = require('../core/sanctionStore');
        const by = interaction.user.tag || interaction.user.username || 'chủ bot';
        let text = '';

        if (act === 'pardon') {
          const res = sstore.pardon(uid, by, 'Chủ bot tha ngay từ tin nhắn báo án', true);
          if (res.ok) {
            await sanctions.notifyLifted(client, uid, 'pardon', '');
            text = `🕊️ Đã tha toàn bộ án cho <@${uid}> và xoá sạch lịch sử leo bậc.`;
          } else {
            text = '❌ ' + res.error;
          }
        } else if (act === 'immune') {
          sstore.setImmune(uid, true, by);
          text = `⭐ Đã cho <@${uid}> vào danh sách miễn trừ — máy sẽ không bao giờ tự ra án cho người này nữa.`;
        } else if (act === 'ban') {
          const res = await sanctions.manualBan(client, uid, {
            by,
            reason: 'Chủ bot xác nhận cấm vĩnh viễn từ tin nhắn báo án',
          });
          text =
            res && res.ok
              ? `🔴 Đã cấm vĩnh viễn <@${uid}>.`
              : '❌ ' + String((res && res.error) || 'Không cấm được.');
        } else {
          text = '❌ Nút không hợp lệ.';
        }

        await interaction.reply({ content: text, ephemeral: true }).catch(() => {});
      } catch (err) {
        client.logger?.error?.(`Lỗi nút xử lý nhanh: ${err?.message || err}`);
        if (!interaction.replied && !interaction.deferred) {
          interaction.reply({ content: '❌ Có lỗi khi xử lý nút này.', ephemeral: true }).catch(() => {});
        }
      }
      return;
    }

    // Chỉ xử lý slash command ở đây.
    // Các nút/menu tương tác khác đều được xử lý ngay trong từng lệnh (collector).
    if (!interaction.isChatInputCommand()) return;

    const command = findCommand(client, interaction.commandName);
    if (!command) return;

    const ctx = new CommandContext(client, { interaction, command });
    await runCommand(client, command, ctx);
  },
};
