// =============================================================
//  modGuard - lá chắn dùng chung cho các lệnh quản lý (moderation)
//  Gom mọi kiểm tra an toàn vào một chỗ để tất cả lệnh hành xử
//  giống hệt nhau, tránh mỗi lệnh kiểm một kiểu (hoặc quên kiểm).
//
//  Thứ tự kiểm tra:
//    1. Có tìm thấy thành viên không
//    2. Tự thao tác với chính mình  -> CHẶN (trừ khi opts.allowSelf)
//    3. Thao tác với chính con bot   -> CHẶN
//    4. Thao tác với chủ máy chủ     -> CHẶN
//    5. Thứ bậc vai trò: không đụng được người ngang/cao hơn mình
//       (chủ máy chủ được bỏ qua bước này; tự thao tác với chính mình
//        cũng bỏ qua vì so thứ bậc của mình với chính mình là vô nghĩa)
// =============================================================
const Embed = require('./EmbedFactory');

// Động từ tiếng Việt cho từng hành động, dùng để ghép câu thông báo.
const VERBS = {
  kick: 'đuổi',
  ban: 'cấm',
  timeout: 'timeout',
  untimeout: 'gỡ timeout cho',
  warn: 'cảnh cáo',
  nick: 'đổi biệt danh của',
  giverole: 'thay đổi vai trò của',
  clearwarn: 'xóa cảnh cáo của',
};

function fail(title, desc) {
  return { ok: false, embed: Embed.error(title, desc) };
}

/**
 * Kiểm tra xem ctx.author có được phép thao tác lên `member` hay không.
 * @param {object} ctx     CommandContext
 * @param {object} member  GuildMember mục tiêu (có thể null)
 * @param {string} action  khóa trong VERBS, ví dụ 'kick'
 * @param {object} opts    { skipHierarchy?: boolean, allowSelf?: boolean }
 *                         allowSelf: cho phép tự thao tác với chính mình
 *                         (dùng cho nick / giverole - xem chú thích ở 2 lệnh đó)
 * @returns {{ok:true}|{ok:false, embed:object}}
 */
function guardTarget(ctx, member, action, opts = {}) {
  const verb = VERBS[action] || action;

  if (!member) {
    return fail('Không tìm thấy', 'Hãy nhắc tên (mention) thành viên hợp lệ.');
  }

  // --- Tự thao tác với chính mình ---
  const isSelf = member.id === ctx.author.id;
  if (isSelf && !opts.allowSelf) {
    return fail('Không hợp lệ', `Bạn không thể tự ${verb} chính mình.`);
  }

  // --- Thao tác với chính con bot ---
  const meId = ctx.client?.user?.id;
  if (meId && member.id === meId) {
    return fail('Không hợp lệ', `Tôi không thể tự ${verb} chính mình. Hãy dùng bảng cài đặt của máy chủ nếu bạn thật sự cần.`);
  }

  // --- Thao tác với chủ máy chủ ---
  // Nếu chính chủ máy chủ đang tự thao tác với mình (và lệnh cho phép) thì bỏ qua.
  if (ctx.guild && member.id === ctx.guild.ownerId && !(isSelf && opts.allowSelf)) {
    return fail('Không hợp lệ', `Không thể ${verb} chủ máy chủ.`);
  }

  // --- Thứ bậc vai trò của NGƯỜI RA LỆNH ---
  // Discord chỉ tự kiểm tra thứ bậc của BOT, không kiểm tra của người ra lệnh.
  // Thiếu bước này thì một mod cấp thấp có thể đụng tới mod cấp cao hơn.
  if (!opts.skipHierarchy && !isSelf && ctx.guild) {
    const actor = ctx.member;
    const isGuildOwner = actor && actor.id === ctx.guild.ownerId;
    const actorTop = actor?.roles?.highest?.position;
    const targetTop = member?.roles?.highest?.position;
    if (!isGuildOwner && typeof actorTop === 'number' && typeof targetTop === 'number') {
      if (targetTop >= actorTop) {
        return fail(
          'Không đủ thứ bậc',
          `Bạn không thể ${verb} người có vai trò ngang hàng hoặc cao hơn bạn.`,
        );
      }
    }
  }

  return { ok: true };
}

module.exports = { guardTarget, VERBS };
