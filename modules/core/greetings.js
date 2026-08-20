// =============================================================
//  greetings - dựng embed Chào mừng / Tạm biệt dùng chung
//  Để cả sự kiện thật lẫn lệnh xem thử đều ra cùng một kết quả.
// =============================================================
const Embed = require('./EmbedFactory');
const { colors, emoji } = require('./palette');

// Tìm kênh theo ID: ưu tiên cache, không có thì fetch (kênh vừa tạo vẫn tìm ra).
async function resolveChannel(guild, channelId) {
  const id = String(channelId || '').trim();
  if (!guild || !/^\d{15,25}$/.test(id)) return null;
  let channel = guild.channels.cache.get(id) || null;
  if (!channel) {
    channel = await guild.channels.fetch(id).catch(() => null);
  }
  if (!channel || typeof channel.send !== 'function') return null;
  return channel;
}

// Kiểm tra bot có đủ quyền gửi embed vào kênh không.
function canSpeak(channel, guild) {
  try {
    const me = guild.members.me;
    if (!me || typeof channel.permissionsFor !== 'function') return true;
    const perms = channel.permissionsFor(me);
    if (!perms) return true;
    return perms.has('ViewChannel') && perms.has('SendMessages') && perms.has('EmbedLinks');
  } catch (_) {
    return true;
  }
}

function ordinal(n) {
  const num = Number(n);
  return Number.isFinite(num) && num > 0 ? '#' + num.toLocaleString('vi-VN') : 'không rõ';
}

// Thời điểm dạng <t:...:R> cho Discord tự hiển thị theo múi giờ người xem.
function rel(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return 'không rõ';
  return '<t:' + Math.floor(n / 1000) + ':R>';
}

// ---------- Embed CHÀO MừNG ----------
// invite: { inviterId, total, code, vanity } hoặc null nếu không xác định được.
function welcomeEmbed(member, invite) {
  const guild = member.guild;
  const count = guild.memberCount;

  const e = Embed.custom(
    colors.aqua,
    emoji.sparkles + ' Chào mừng thành viên mới!',
    'Xin chào ' + member + ', chào mừng bạn đến với **' + guild.name + '**!\n' +
      'Bạn là thành viên thứ **' + ordinal(count) + '** ' + emoji.crown,
  ).setThumbnail(member.user.displayAvatarURL({ size: 256 }));

  e.addFields({
    name: '\ud83d\udc64 Thành viên',
    value: '`' + (member.user.tag || member.user.username) + '`',
    inline: true,
  });

  // Tài khoản quá mới thường là acc ảo -> nhắc nhẹ cho quản trị viên biết.
  e.addFields({
    name: '\ud83d\udcc5 Tạo tài khoản',
    value: rel(member.user.createdTimestamp),
    inline: true,
  });

  if (invite) {
    if (invite.vanity) {
      e.addFields({ name: '\ud83d\udd17 Mời bởi', value: 'Link riêng của máy chủ', inline: true });
    } else if (invite.inviterId) {
      e.addFields({
        name: '\ud83d\udc8c Người mời',
        value:
          '<@' + invite.inviterId + '>\n' +
          '\u2514 hiện có **' + Number(invite.total || 0).toLocaleString('vi-VN') + '** lượt mời',
        inline: true,
      });
    } else {
      e.addFields({ name: '\ud83d\udc8c Người mời', value: 'Không xác định', inline: true });
    }
  } else {
    e.addFields({ name: '\ud83d\udc8c Người mời', value: 'Không xác định', inline: true });
  }

  return e;
}

// ---------- Embed TẠM BIỆT ----------
// Đối xứng với embed chào mừng ở trên.
function goodbyeEmbed(member, leaveInfo) {
  const guild = member.guild;
  const user = member.user || {};
  const count = guild.memberCount;

  const e = Embed.custom(
    colors.orange,
    '\ud83d\udc4b Tạm biệt thành viên',
    '**' + (user.tag || user.username || 'Một thành viên') + '** vừa rời khỏi **' + guild.name + '**.\n' +
      'Máy chủ hiện còn **' + ordinal(count) + '** thành viên. Hẹn gặp lại! \ud83c\udf40',
  ).setThumbnail(typeof user.displayAvatarURL === 'function' ? user.displayAvatarURL({ size: 256 }) : null);

  e.addFields({
    name: '\ud83d\udc64 Thành viên',
    value: '`' + (user.tag || user.username || 'không rõ') + '`',
    inline: true,
  });

  e.addFields({
    name: '\ud83d\udcc5 Đã tham gia',
    value: member.joinedTimestamp ? rel(member.joinedTimestamp) : 'không rõ',
    inline: true,
  });

  if (leaveInfo && leaveInfo.inviterId) {
    e.addFields({
      name: '\ud83d\udc8c Người đã mời',
      value:
        '<@' + leaveInfo.inviterId + '>\n' +
        '\u2514 còn **' + Number(leaveInfo.total || 0).toLocaleString('vi-VN') + '** lượt mời',
      inline: true,
    });
  } else {
    e.addFields({ name: '\ud83d\udc8c Người đã mời', value: 'Không xác định', inline: true });
  }

  return e;
}

module.exports = { resolveChannel, canSpeak, welcomeEmbed, goodbyeEmbed, ordinal, rel };
