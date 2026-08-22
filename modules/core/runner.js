// =============================================================
//  runner - chạy một lệnh với kiểm tra cooldown, quyền, và bắt lỗi
//  Dùng chung cho cả prefix và slash
// =============================================================
const { Collection, PermissionsBitField } = require('discord.js');
const Embed = require('./EmbedFactory');
const maintenance = require('./maintenanceStore');
const { colors } = require('./palette');
const abuseGuard = require('./abuseGuard');
// Hệ thống xử lý (cảnh cáo / cấm tạm / cấm vĩnh viễn) — LTS.
const sanctions = require('./sanctions');

// Nhắc "đang bảo trì" tối đa 1 lần / 20 giây cho mỗi người, để một người
// spam lệnh lúc bảo trì không làm bot gửi hàng loạt tin nhắn (chống rate limit).
const NOTICE_MS = 20000;
const noticeAt = new Map();

function shouldNotify(userId) {
  const now = Date.now();
  // Dọn bộ nhớ định kỳ để Map không phình vô hạn khi chạy 24/7.
  if (noticeAt.size > 500) {
    for (const [key, at] of noticeAt) {
      if (now - at > NOTICE_MS) noticeAt.delete(key);
    }
  }
  const last = noticeAt.get(userId) || 0;
  if (now - last < NOTICE_MS) return false;
  noticeAt.set(userId, now);
  return true;
}

// Tên quyền hiển thị thân thiện bằng tiếng Việt
const PERM_NAMES = {
  KickMembers: 'Kiểm soát thành viên (Kick)',
  BanMembers: 'Cấm thành viên (Ban)',
  ManageMessages: 'Quản lý tin nhắn',
  ManageChannels: 'Quản lý kênh',
  ManageGuild: 'Quản lý máy chủ',
  Administrator: 'Quản trị viên',
  ManageRoles: 'Quản lý vai trò',
  ModerateMembers: 'Kiểm duyệt thành viên (Timeout)',
  ManageNicknames: 'Quản lý biệt danh',
};

function humanPerms(perms) {
  return perms.map((p) => PERM_NAMES[p] || p).join(', ');
}

module.exports = async function runCommand(client, command, ctx) {
  // --- CHẾ ĐỘ BẢO TRÌ ---
  // Chặn TOÀN BỘ lệnh (cả prefix lẫn slash) của mọi người, trừ chủ bot và
  // những ai nằm trong danh sách miễn trừ. Đặt ngay đầu hàm để không lệnh nào lọt.
  try {
    // Lấy danh sách vai trò của thành viên để xet miễn trừ theo vai trò.
    let memberRoleIds = null;
    try {
      const rc = ctx.member && ctx.member.roles ? ctx.member.roles.cache : null;
      if (rc && typeof rc.keys === 'function') memberRoleIds = Array.from(rc.keys());
      else if (Array.isArray(ctx.member?.roles)) memberRoleIds = ctx.member.roles;
    } catch (_) {
      memberRoleIds = null;
    }

    const ownerId = client.config?.ownerId;

    // 1) Bảo trì TOÀN BỘ bot
    if (!maintenance.canUse(ctx.author.id, ownerId, memberRoleIds)) {
      maintenance.noteBlocked();
      if (!shouldNotify(ctx.author.id)) return;
      const s = maintenance.getState();
      const emb = Embed.custom(
        colors.warning,
        '🔧 Bot đang bảo trì',
        'Bot tạm thời **ngừng nhận lệnh** để bảo trì. Vui lòng quay lại sau nhé!',
      ).addFields({ name: '📝 Lý do', value: s.reason ? s.reason.slice(0, 1000) : '_Không nêu lý do_' });
      if (s.until) {
        emb.addFields({
          name: '⏳ Dự kiến mở lại',
          value: `<t:${Math.floor(s.until / 1000)}:R> (còn ${maintenance.formatDuration(s.remaining)})`,
        });
      } else {
        emb.addFields({ name: '⏳ Dự kiến mở lại', value: 'Chưa xác định' });
      }
      return ctx.reply({ embeds: [emb] }).catch(() => {});
    }

    // 2) Bảo trì RIÊNG cho từng lệnh: chỉ lệnh này bị chặn, các lệnh khác vẫn chạy.
    if (!maintenance.canUseCommand(command.name, ctx.author.id, ownerId, memberRoleIds)) {
      const info = maintenance.commandInfo(command.name) || {};
      maintenance.noteBlocked();
      if (!shouldNotify(`cmd:${command.name}:${ctx.author.id}`)) return;
      const emb = Embed.custom(
        colors.warning,
        '🧰 Lệnh này đang được bảo trì',
        `Lệnh \`${command.name}\` tạm thời **ngừng hoạt động** để bảo trì.\nCác lệnh khác của bot **vẫn dùng bình thường** nhé!`,
      ).addFields({ name: '📝 Lý do', value: info.reason ? info.reason.slice(0, 1000) : '_Không nêu lý do_' });
      if (info.until) {
        emb.addFields({
          name: '⏳ Dự kiến mở lại',
          value: `<t:${Math.floor(info.until / 1000)}:R> (còn ${maintenance.formatDuration(info.remaining)})`,
        });
      } else {
        emb.addFields({ name: '⏳ Dự kiến mở lại', value: 'Chưa xác định' });
      }
      return ctx.reply({ embeds: [emb] }).catch(() => {});
    }
  } catch (err) {
    // Bảo trì lỗi thì KHÔNG được chặn bot hoạt động -> ghi log rồi chạy tiếp.
    client.logger?.error?.(`Lỗi kiểm tra bảo trì: ${err?.message || err}`);
  }

  // --- Chỉ dành cho chủ bot ---
  if (command.ownerOnly && ctx.author.id !== client.config.ownerId) {
    return ctx.reply({ embeds: [Embed.error('Không thể dùng', 'Lệnh này chỉ dành cho chủ bot.')] }).catch(() => {});
  }

  // --- ĐANG BỊ CẤM DÙNG BOT? (warn / mute / ban) — LTS ---
  // Đặt sát đầu vì người đã bị cấm thì không cần chạy thêm bất kỳ bước
  // nào (nhanh nhất, rẻ nhất). Hàm gate() tự cho qua: chủ bot, lệnh
  // ownerOnly, và các lệnh trong danh sách cho phép (verify, kháng nghị...).
  // Nếu không ai bị cấm thì hàm thoát ngay ở bước đầu tiên, gần như
  // không tốn gì. Mọi lỗi ở đây đều mở cửa cho lệnh chạy (fail-open).
  try {
    const sg = sanctions.gate(client, command, ctx);
    if (sg && sg.allowed === false) {
      if (sg.payload && !sg.silent) await ctx.reply(sg.payload).catch(() => {});
      return;
    }
  } catch (err) {
    client.logger?.error?.(`Lỗi kiểm tra hệ thống xử lý: ${err && err.stack ? err.stack : err}`);
  }

  // --- Chỉ dùng trong máy chủ ---
  if (command.guildOnly && !ctx.guild) {
    return ctx.reply({ embeds: [Embed.error('Không thể dùng', 'Lệnh này chỉ dùng được trong máy chủ.')] }).catch(() => {});
  }

  // --- Kiểm tra quyền của thành viên ---
  // LỖ HỔNG CŨ: nếu ctx.member là null (cache chưa có) thì TOÀN BỘ kiểm tra
  // quyền bị bỏ qua -> người thường vẫn chạy được lệnh kick/ban. Nay ta
  // fetch lại member, và nếu vẫn không lấy được thì TỪ CHỐI thay vì cho qua.
  if (command.permissions && command.permissions.length) {
    let member = ctx.member;
    if (!member && ctx.guild) {
      member = await ctx.guild.members.fetch(ctx.author.id).catch(() => null);
    }
    if (!member) {
      return ctx
        .reply({
          embeds: [
            Embed.error(
              'Không xác minh được quyền',
              'Không đọc được thông tin thành viên của bạn nên lệnh bị từ chối vì an toàn. Hãy thử lại.',
            ),
          ],
        })
        .catch(() => {});
    }
    const unknown = command.permissions.filter((p) => PermissionsBitField.Flags[p] === undefined);
    if (unknown.length) {
      client.logger?.warn?.(`Lệnh "${command.name}" khai báo quyền không tồn tại: ${unknown.join(', ')}`);
    }
    const missing = command.permissions.filter(
      (p) => PermissionsBitField.Flags[p] !== undefined && !member.permissions.has(PermissionsBitField.Flags[p]),
    );
    if (missing.length) {
      return ctx
        .reply({ embeds: [Embed.error('Thiếu quyền', `Bạn cần quyền: **${humanPerms(missing)}**`)] })
        .catch(() => {});
    }
  }

  // --- Cooldown (thời gian chờ giữa các lần dùng) ---
  // Chủ bot được miễn thời gian chờ để tiện kiểm tra/vận hành.
  const skipCooldown = Boolean(client.config.ownerId) && String(ctx.author.id) === String(client.config.ownerId);
  if (!client.cooldowns.has(command.name)) client.cooldowns.set(command.name, new Collection());
  const now = Date.now();
  const timestamps = client.cooldowns.get(command.name);
  const cooldownMs = (command.cooldown || 2) * 1000;
  if (!skipCooldown && timestamps.has(ctx.author.id)) {
    const expiration = timestamps.get(ctx.author.id) + cooldownMs;
    if (now < expiration) {
      const left = ((expiration - now) / 1000).toFixed(1);
      return ctx
        .reply({ embeds: [Embed.warn('Chậm lại chút!', `Vui lòng đợi **${left}s** rồi dùng lại lệnh \`${command.name}\`.`)] })
        .catch(() => {});
    }
  }
  // --- Hai hệ thống chống gian lận (chống bot tự động & chống acc clone) ---
  // Đặt SAU kiểm tra cooldown để bộ máy đo được nhịp gõ thật của người chơi,
  // và TRƯỚC khi ghi mốc cooldown để lệnh bị chặn không bị tính vào thời gian chờ.
  // Cả hai hệ thống MẶC ĐỊNH BẬT và do chủ bot bật/tắt toàn cục.
  let guardTrack = null;
  try {
    const verdict = await abuseGuard.guard(client, command, ctx);
    if (verdict && !verdict.allowed) {
      // LỖI CŨ (đã sửa ở bản LTS): trước đây khi bị chặn thì hàm return
      // ngay, KHÔNG ghi mốc cooldown. Kết quả: đúng kẻ dùng macro lại là
      // người được spam lệnh KHÔNG GIỚI HẠN — mỗi lần bị chặn lại đủ
      // điều kiện bấm tiếp, làm bot tốn CPU và dễ bị Discord chặn tần số.
      // Nay vẫn ghi mốc cooldown khi bị chặn để họ không thể hại bot.
      if (!skipCooldown) {
        timestamps.set(ctx.author.id, now);
        setTimeout(() => timestamps.delete(ctx.author.id), cooldownMs).unref?.();
      }
      return;
    }
    guardTrack = (verdict && verdict.track) || null;
  } catch (err) {
    // Không bao giờ để hệ thống chống gian lận làm chết lệnh (fail-open).
    client.logger?.error?.(`Lỗi hệ thống chống gian lận: ${err && err.stack ? err.stack : err}`);
  }

  if (!skipCooldown) {
    timestamps.set(ctx.author.id, now);
    setTimeout(() => timestamps.delete(ctx.author.id), cooldownMs).unref?.();
  }

  // --- Chạy lệnh ---
  try {
    client.logger.command(`${ctx.author.tag || ctx.author.username} đã dùng: ${command.name}${ctx.isSlash ? ' (slash)' : ''}`);
    await command.run(ctx);
    // Ghi số xu vừa kiếm được để áp trần xu mỗi ngày cho cụm acc clone.
    try {
      abuseGuard.after(client, command, ctx, guardTrack);
    } catch {
      /* bỏ qua - không được ảnh hưởng tới lệnh */
    }
  } catch (err) {
    client.logger.error(`Lỗi khi chạy lệnh "${command.name}": ${err.stack || err}`);
    const emb = Embed.error('Đã xảy ra lỗi', 'Xin lỗi, có lỗi khi thực thi lệnh này. Vui lòng thử lại sau.');
    ctx.reply({ embeds: [emb] }).catch(() => {});
  }
};
