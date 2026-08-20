// =============================================================
//  giveawayManager - bộ máy điều khiển giveaway
//  - Vẽ embed + nút bấm
//  - Xử lý nút (tham gia / danh sách / kết thúc sớm / huỷ / quay lại)
//  - Hẹn giờ kết thúc, khôi phục được sau khi bot khởi động lại
//
//  Vì sao KHÔNG dùng collector như các lệnh khác?
//  Collector chết khi bot restart, mà giveaway có thể kéo dài nhiều ngày.
//  Nên nút được xử lý toàn cục trong interactionCreate, trạng thái nằm ở JSON.
// =============================================================
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const Embed = require('./EmbedFactory');
const { colors } = require('./palette');
const store = require('./giveawayStore');

// setTimeout của Node chỉ nhận tối đa ~24,8 ngày (2^31-1 ms).
// Vượt số này timer sẽ chạy NGAY LẬP TỨC -> phải chia nhỏ.
const MAX_TIMEOUT = 2147483647;

const MIN_MS = 10 * 1000;                  // tối thiểu 10 giây
const MAX_MS = 60 * 24 * 60 * 60 * 1000;   // tối đa 60 ngày
const MAX_WINNERS = 20;
const MAX_PRIZE_LEN = 200;
const MAX_DESC_LEN = 500;
const MAX_BONUS = 10;                      // tối đa +10 lượt cho vai trò thưởng
const LIST_SHOWN = 30;                     // số người hiện trong danh sách tham gia

const timers = new Map(); // messageId -> Timeout

// --- Phân tích chuỗi thời gian: 30s / 10m / 2h / 1d / 1w ---
function parseDuration(str) {
  if (!str) return null;
  const re = /(\d+)\s*(w|d|h|m|s|tuần|ngày|giờ|phút|giây)/gi;
  let ms = 0;
  let matched = false;
  let m;
  while ((m = re.exec(str)) !== null) {
    matched = true;
    const n = Number(m[1]);
    const u = m[2].toLowerCase();
    if (u === 'w' || u === 'tuần') ms += n * 604800000;
    else if (u === 'd' || u === 'ngày') ms += n * 86400000;
    else if (u === 'h' || u === 'giờ') ms += n * 3600000;
    else if (u === 'm' || u === 'phút') ms += n * 60000;
    else ms += n * 1000;
  }
  return matched ? ms : null;
}

// Các "thẻ" của Discord (mention, emoji riêng, dấu thời gian) phải giữ nguyên xi.
// Nếu khử ký tự bên trong chúng — nhất là dấu ">" — thẻ sẽ vỡ và hiện ra chữ thô
// kiểu "<@&123\>" thay vì tên vai trò.
const TOKEN_RE = /(@everyone|@here|<@!?\d+>|<@&\d+>|<#\d+>|<a?:[\w~]+:\d+>|<t:\d+(?::[tTdDfFR])?>)/g;

// Phần thưởng / mô tả do người dùng nhập có thể chứa ký tự Markdown hoặc xuống dòng
// làm vỡ định dạng embed -> khử trước khi hiển thị, nhưng CHỪA các thẻ Discord.
function escapeMd(text) {
  const raw = String(text === null || text === undefined ? '' : text).replace(/\r?\n/g, ' ');
  return raw
    .split(TOKEN_RE)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : String(part === null || part === undefined ? '' : part).replace(/([\\`*_~|>])/g, '\\$1'),
    )
    .join('')
    .trim();
}

// Bóc các thẻ nhắc có trong chữ người dùng nhập.
function extractMentions(text) {
  const src = String(text === null || text === undefined ? '' : text);
  const users = new Set();
  const roles = new Set();
  let everyone = false;
  let here = false;
  const re = /@everyone|@here|<@!?(\d+)>|<@&(\d+)>/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    if (m[1]) users.add(m[1]);
    else if (m[2]) roles.add(m[2]);
    else if (m[0] === '@here') here = true;
    else everyone = true;
  }
  return { users: [...users], roles: [...roles], everyone, here };
}

function mentionSource(gw) {
  return String(gw.prize === null || gw.prize === undefined ? '' : gw.prize) +
    ' ' +
    String(gw.description === null || gw.description === undefined ? '' : gw.description);
}

// Mention nạm TRONG embed không bao giờ báo cho ai cả (Discord thiết kế vậy).
// Muốn ping thật thì phải nhắc lại ở phần chữ thường của tin nhắn.
// Chỉ liệt kê những thứ đã được phép ping để không để lại chữ "@everyone" chết.
function pingContent(gw) {
  const m = extractMentions(mentionSource(gw));
  const parts = [];
  if (gw.allowEveryone && m.everyone) parts.push('@everyone');
  if (gw.allowEveryone && m.here) parts.push('@here');
  for (const id of gw.pingRoleIds || []) parts.push('<@&' + id + '>');
  for (const id of gw.pingUserIds || []) parts.push('<@' + id + '>');
  return parts.join(' ').slice(0, 1900);
}

// Luôn ghi rõ parse: nếu bỏ trống trường này thì Discord có thể tự phân tích
// mọi loại mention trong chuỗi, làm ping ngoài ý muốn.
function mentionsFor(gw) {
  const m = extractMentions(mentionSource(gw));
  const parse = [];
  if (gw.allowEveryone && (m.everyone || m.here)) parse.push('everyone');
  return {
    parse,
    users: (gw.pingUserIds || []).slice(0, 20),
    roles: (gw.pingRoleIds || []).slice(0, 20),
    repliedUser: false,
  };
}

// --- Điều kiện tham gia, hiển thị trong embed ---
function requirementLines(gw) {
  const reqs = [];
  if (gw.requiredRoleId) reqs.push(' • Phải có vai trò <@&' + gw.requiredRoleId + '>');
  if (gw.minAccountDays > 0) reqs.push(' • Tài khoản tối thiểu **' + gw.minAccountDays + '** ngày tuổi');
  if (gw.bonusRoleId && gw.bonusEntries > 0) {
    reqs.push(' • <@&' + gw.bonusRoleId + '> được **' + (1 + gw.bonusEntries) + '** lượt bốc thăm');
  }
  if (!gw.hostCanJoin) reqs.push(' • Người tổ chức không được tự tham gia');
  if (!reqs.length) reqs.push(' • Không có — ai cũng tham gia được!');
  return reqs.join('\n');
}

function buildEmbed(gw) {
  const endSec = Math.floor(gw.endAt / 1000);
  const count = (gw.entries || []).length;
  const prize = escapeMd(gw.prize);

  // Khi có lượt thưởng thì số người ≠ số lượt, nên nói rõ cả hai.
  const tickets = store.totalTickets(gw);
  const joinedValue =
    tickets !== count ? '**' + count + '** người — ' + tickets + ' lượt' : '**' + count + '** người';

  // --- Đang diễn ra ---
  if (!gw.ended) {
    return Embed.custom(colors.gold, '🎁 GIVEAWAY — ' + prize)
      .setDescription(
        (gw.description ? escapeMd(gw.description) + '\n\n' : '') +
          ' 👇 Nhấn **🎉 Tham gia** để ghi danh (nhấn lần nữa để rời).\n' +
          ' ⏳ Kết thúc <t:' + endSec + ':R> — <t:' + endSec + ':f>',
      )
      .addFields(
        { name: '🏆 Phần thưởng', value: '**' + prize + '**', inline: true },
        { name: '👑 Số giải', value: '**' + gw.winnerCount + '** người thắng', inline: true },
        { name: '👥 Đã tham gia', value: joinedValue, inline: true },
        { name: '📋 Điều kiện', value: requirementLines(gw) },
        { name: '🎤 Người tổ chức', value: '<@' + gw.hostId + '>', inline: true },
      );
  }

  // --- Đã huỷ ---
  if (gw.cancelled) {
    return Embed.custom(colors.error, '🚫 GIVEAWAY ĐÃ HUỶ — ' + prize)
      .setDescription('_Đợt này đã bị người tổ chức huỷ, không bốc thăm và không có người thắng._')
      .addFields(
        { name: '🏆 Phần thưởng', value: '**' + prize + '**', inline: true },
        { name: '👥 Đã ghi danh', value: joinedValue, inline: true },
        { name: '🎤 Người tổ chức', value: '<@' + gw.hostId + '>', inline: true },
      );
  }

  // --- Đã kết thúc ---
  const winners = gw.winners || [];
  const rerolled = gw.rerolled ? '\n\n_Đã quay lại **' + gw.rerolled + '** lần._' : '';
  return Embed.custom(winners.length ? colors.success : colors.dark, '🎊 GIVEAWAY ĐÃ KẾT THÚC — ' + prize)
    .setDescription(
      (winners.length
        ? '**🎊 Chúc mừng người thắng:**\n' + winners.map((id) => ' 🏆 <@' + id + '>').join('\n')
        : '_Không có ai tham gia hợp lệ nên không có người thắng._') + rerolled,
    )
    .addFields(
      { name: '🏆 Phần thưởng', value: '**' + prize + '**', inline: true },
      { name: '👥 Tổng tham gia', value: joinedValue, inline: true },
      { name: '⏱️ Kết thúc', value: '<t:' + endSec + ':R>', inline: true },
      { name: '🎤 Người tổ chức', value: '<@' + gw.hostId + '>', inline: true },
    );
}

function buildRows(gw) {
  const count = (gw.entries || []).length;
  if (!gw.ended) {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('gw:join').setLabel('Tham gia (' + count + ')').setEmoji('🎉').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('gw:list').setLabel('Danh sách').setEmoji('👥').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('gw:end').setLabel('Kết thúc sớm').setEmoji('⏹️').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('gw:cancel').setLabel('Huỷ đợt').setEmoji('🚫').setStyle(ButtonStyle.Secondary),
      ),
    ];
  }

  const closedLabel = gw.cancelled
    ? 'Đã huỷ'
    : 'Đã kết thúc — ' + count + ' người tham gia';
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('gw:closed').setLabel(closedLabel).setEmoji('🔒').setStyle(ButtonStyle.Secondary).setDisabled(true),
  );
  // Đợt bị huỷ thì không cho quay lại (không hề có bốc thăm nào để quay).
  if (!gw.cancelled) {
    row.addComponents(
      new ButtonBuilder().setCustomId('gw:reroll').setLabel('Quay lại').setEmoji('🎲').setStyle(ButtonStyle.Primary),
    );
  }
  return [row];
}

// Chỉ người tổ chức hoặc quản trị viên mới được kết thúc / huỷ / quay lại.
function canManage(interaction, gw) {
  if (interaction.user && interaction.user.id === gw.hostId) return true;
  const perms = interaction.member ? interaction.member.permissions : null;
  if (!perms || typeof perms.has !== 'function') return false;
  try {
    return perms.has('ManageMessages') || perms.has('ManageGuild');
  } catch {
    return false;
  }
}

function clearTimer(messageId) {
  const t = timers.get(String(messageId));
  if (t) {
    clearTimeout(t);
    timers.delete(String(messageId));
  }
}

// Lọc bỏ người đã rời máy chủ, bốc bù người khác thay thế.
// Lặp cho tối khi đủ giải, vì người được bốc bù cũng có thể đã rời.
async function resolveWinners(client, gw) {
  const guild = await client.guilds.fetch(gw.guildId).catch(() => null);
  if (!guild) return gw.winners || [];

  const valid = [];
  const gone = [];
  const check = async (id) => {
    const m = await guild.members.fetch(id).catch(() => null);
    if (m) valid.push(id);
    else gone.push(id);
  };

  for (const id of gw.winners || []) await check(id);

  let guard = 0;
  while (valid.length < gw.winnerCount && guard < 25) {
    guard++;
    const need = gw.winnerCount - valid.length;
    const exclude = [...valid, ...gone, ...(gw.pastWinners || [])];
    const more = store.pickWinners(gw.entries, need, exclude, gw.weights);
    if (!more.length) break;
    for (const id of more) await check(id);
  }
  return valid;
}

async function fetchChannel(client, gw) {
  if (!client.channels || typeof client.channels.fetch !== 'function') return null;
  return client.channels.fetch(gw.channelId).catch(() => null);
}

// Cập nhật lại tin nhắn giveaway trên Discord. Trả về null nếu tin nhắn không còn.
async function refreshMessage(client, gw, channel) {
  const ch = channel || (await fetchChannel(client, gw));
  if (!ch || !ch.messages || typeof ch.messages.fetch !== 'function') return null;
  const msg = await ch.messages.fetch(gw.messageId).catch(() => null);
  if (!msg) return null;
  await msg.edit({ embeds: [buildEmbed(gw)], components: buildRows(gw) }).catch(() => {});
  return msg;
}

function messageLink(gw) {
  return 'https://discord.com/channels/' + gw.guildId + '/' + gw.channelId + '/' + gw.messageId;
}

// Bỏ ghim khi đợt kết thúc để không chiếm chỗ danh sách ghim của kênh.
async function unpinIfNeeded(msg, gw) {
  if (!gw.pinned || !msg || typeof msg.unpin !== 'function') return;
  await msg.unpin().catch(() => {});
}

// Nhắn riêng cho người thắng — nhiều người tắt tin nhắn riêng nên lỗi ở đây là bình thường.
async function dmWinners(client, gw, ids) {
  const list = ids || gw.winners || [];
  if (!gw.dmWinners || !list.length) return;
  if (!client.users || typeof client.users.fetch !== 'function') return;
  for (const id of list) {
    const user = await client.users.fetch(id).catch(() => null);
    if (!user || typeof user.send !== 'function') continue;
    await user
      .send({
        embeds: [
          Embed.custom(
            colors.gold,
            '🎉 Bạn đã thắng giveaway!',
            'Phần thưởng: **' + escapeMd(gw.prize) + '**\n' +
              'Hãy liên hệ <@' + gw.hostId + '> để nhận thưởng.\n' +
              messageLink(gw),
          ),
        ],
      })
      .catch(() => {});
  }
}

/**
 * Kết thúc một đợt giveaway và công bố kết quả.
 * An toàn khi gọi trùng: đã kết thúc thì thoát ngay.
 * @param {object} opts { early: kết thúc sớm, cancelled: huỷ không bốc thăm }
 */
async function endGiveaway(client, messageId, opts = {}) {
  const gw = store.get(messageId);
  if (!gw || gw.ended) return null;

  // Đánh dấu kết thúc + bốc thăm NGAY (đồng bộ, không await ở giữa)
  // để hai lệnh kết thúc chạy sát nhau không bốc thăm hai lần.
  gw.ended = true;
  if (opts.early) gw.endAt = Date.now();
  if (opts.cancelled) {
    gw.cancelled = true;
    gw.winners = [];
  } else {
    gw.winners = store.pickWinners(gw.entries, gw.winnerCount, gw.pastWinners, gw.weights);
  }
  store.save(gw);
  clearTimer(messageId);

  if (!gw.cancelled) {
    // Loại người đã rời máy chủ
    const finalWinners = await resolveWinners(client, gw);
    if (finalWinners.join(',') !== (gw.winners || []).join(',')) {
      gw.winners = finalWinners;
    }
    // Ghi nhận vào sổ người tứng thắng để lần quay lại sau không chọn trùng.
    gw.pastWinners = [...new Set([...(gw.pastWinners || []), ...gw.winners])];
    store.save(gw);
  }

  const channel = await fetchChannel(client, gw);
  const msg = await refreshMessage(client, gw, channel);
  await unpinIfNeeded(msg, gw);

  // Công bố kết quả. Vẫn gửi được dù tin nhắn giveaway gốc đã bị xoá —
  // trước đây mất tin nhắn gốc là mất luôn công bố, người thắng không ai biết.
  if (channel && typeof channel.send === 'function') {
    const prize = escapeMd(gw.prize);
    let text;
    if (gw.cancelled) {
      text = '🚫 Giveaway **' + prize + '** đã bị huỷ, không có người thắng.';
    } else if (gw.winners.length) {
      text =
        '🎉 Chúc mừng ' +
        gw.winners.map((id) => '<@' + id + '>').join(', ') +
        ' đã thắng **' + prize + '**!';
    } else {
      text = '😢 Giveaway **' + prize + '** đã kết thúc nhưng không có người tham gia hợp lệ.';
    }
    if (msg) text += '\n' + messageLink(gw);
    await channel
      .send({
        content: text,
        // Chỉ ping người thắng. Phần thưởng có thể chứa @everyone nhưng ở bản
        // công bố thì không ping lại nữa, tránh hò cả máy chủ hai lần một đợt.
        allowedMentions: { parse: [], users: gw.winners.slice(0, 20), roles: [], repliedUser: false },
      })
      .catch(() => {});
  }

  if (!gw.cancelled) await dmWinners(client, gw);
  return gw;
}

// --- Hẹn giờ kết thúc (có chia nhỏ cho mốc xa) ---
function scheduleOne(client, gw) {
  if (!gw || !gw.messageId || gw.ended) return;
  clearTimer(gw.messageId);

  const delay = gw.endAt - Date.now();
  if (delay <= 0) {
    endGiveaway(client, gw.messageId).catch(() => {});
    return;
  }

  const wait = Math.min(delay, MAX_TIMEOUT);
  const timer = setTimeout(() => {
    timers.delete(String(gw.messageId));
    const cur = store.get(gw.messageId);
    if (!cur || cur.ended) return;
    if (cur.endAt - Date.now() > 0) scheduleOne(client, cur); // còn xa -> hẹn tiếp chặng sau
    else endGiveaway(client, cur.messageId).catch(() => {});
  }, wait);
  timers.set(String(gw.messageId), timer);
}

// Khôi phục toàn bộ giveaway còn dở sau khi bot khởi động lại.
function scheduleAll(client) {
  store.prune();
  const list = store.pending();
  for (const gw of list) scheduleOne(client, gw);
  return list.length;
}

// --- Xử lý nút bấm ---
async function handleButton(client, interaction) {
  const eph = { flags: MessageFlags.Ephemeral };
  const action = interaction.customId.slice('gw:'.length);
  if (action === 'closed') return interaction.deferUpdate().catch(() => {});

  const gw = store.get(interaction.message.id);
  if (!gw) {
    return interaction
      .reply({ content: '⚠️ Đợt giveaway này quá cũ hoặc dữ liệu không còn được lưu.', ...eph })
      .catch(() => {});
  }

  // ===== Tham gia / rời =====
  if (action === 'join') {
    if (gw.ended) {
      return interaction.reply({ content: '⏰ Giveaway này đã kết thúc rồi.', ...eph }).catch(() => {});
    }
    // Chủ đợt tự bốc được quà của mình thì mất công bằng -> chặn, trừ khi bật cho phép.
    if (!gw.hostCanJoin && interaction.user.id === gw.hostId) {
      return interaction
        .reply({ content: '🎤 Bạn là người tổ chức đợt này nên không tham gia được.', ...eph })
        .catch(() => {});
    }
    const roleCache =
      interaction.member && interaction.member.roles ? interaction.member.roles.cache : null;
    if (gw.requiredRoleId && !(roleCache && roleCache.has(gw.requiredRoleId))) {
      return interaction
        .reply({ content: '🔒 Bạn cần có vai trò <@&' + gw.requiredRoleId + '> mới tham gia được.', ...eph })
        .catch(() => {});
    }
    if (gw.minAccountDays > 0) {
      const days = (Date.now() - (interaction.user.createdTimestamp || 0)) / 86400000;
      if (days < gw.minAccountDays) {
        return interaction
          .reply({
            content:
              '🔒 Tài khoản cần ít nhất **' + gw.minAccountDays + '** ngày tuổi (của bạn: ' +
              Math.floor(days) + ' ngày).',
            ...eph,
          })
          .catch(() => {});
      }
    }

    // Đọc -> sửa -> ghi phải liền mạch, KHÔNG được await ở giữa,
    // nếu không hai người bấm cùng lúc sẽ ghi đè mất lượt của nhau.
    const fresh = store.get(interaction.message.id);
    if (!fresh || fresh.ended) {
      return interaction.reply({ content: '⏰ Giveaway này vừa kết thúc.', ...eph }).catch(() => {});
    }
    const entries = new Set(fresh.entries || []);
    const joined = !entries.has(interaction.user.id);
    let tickets = 1;
    if (joined) {
      entries.add(interaction.user.id);
      // Chốt số lượt NGAY LÚC GHI DANH: sau này bị gỡ vai trò thưởng cũng
      // không bị mất lượt đã hứa, và ngược lại.
      if (gw.bonusRoleId && gw.bonusEntries > 0 && roleCache && roleCache.has(gw.bonusRoleId)) {
        tickets = 1 + gw.bonusEntries;
      }
      fresh.weights[interaction.user.id] = tickets;
    } else {
      entries.delete(interaction.user.id);
      delete fresh.weights[interaction.user.id];
    }
    fresh.entries = [...entries];
    store.save(fresh);

    await interaction.update({ embeds: [buildEmbed(fresh)], components: buildRows(fresh) }).catch(() => {});
    const bonusNote = joined && tickets > 1 ? ' Bạn được **' + tickets + '** lượt bốc thăm!' : '';
    return interaction
      .followUp({
        content: joined
          ? '✅ Đã ghi danh! Chúc may mắn 🍀 (hiện có ' + fresh.entries.length + ' người tham gia)' + bonusNote
          : '↩️ Bạn đã rời khỏi giveaway này.',
        ...eph,
      })
      .catch(() => {});
  }

  // ===== Xem danh sách =====
  if (action === 'list') {
    const ids = gw.entries || [];
    if (!ids.length) {
      return interaction.reply({ content: 'Chưa có ai tham gia đợt này.', ...eph }).catch(() => {});
    }
    const shown = ids
      .slice(0, LIST_SHOWN)
      .map((id, i) => {
        const t = store.ticketsOf(gw, id);
        return (i + 1) + '. <@' + id + '>' + (t > 1 ? ' — ' + t + ' lượt' : '');
      })
      .join('\n');
    const more = ids.length > LIST_SHOWN ? '\n… và **' + (ids.length - LIST_SHOWN) + '** người khác.' : '';
    const total = store.totalTickets(gw);
    const head = total !== ids.length ? ids.length + ' người — ' + total + ' lượt' : ids.length + ' người';
    return interaction
      .reply({
        embeds: [Embed.custom(colors.info, '👥 Danh sách tham gia (' + head + ')', shown + more)],
        ...eph,
      })
      .catch(() => {});
  }

  // ===== Kết thúc sớm / Huỷ đợt =====
  if (action === 'end' || action === 'cancel') {
    const isCancel = action === 'cancel';
    const verb = isCancel ? 'huỷ' : 'kết thúc';
    if (!canManage(interaction, gw)) {
      return interaction
        .reply({ content: '🔒 Chỉ người tổ chức hoặc quản trị viên mới ' + verb + ' được.', ...eph })
        .catch(() => {});
    }
    if (gw.ended) {
      return interaction.reply({ content: 'Giveaway này đã kết thúc rồi.', ...eph }).catch(() => {});
    }
    await interaction
      .reply({ content: isCancel ? '🚫 Đang huỷ giveaway…' : '⏹️ Đang kết thúc giveaway…', ...eph })
      .catch(() => {});
    await endGiveaway(client, interaction.message.id, { early: true, cancelled: isCancel });
    return undefined;
  }

  // ===== Quay lại (reroll) =====
  if (action === 'reroll') {
    if (!canManage(interaction, gw)) {
      return interaction
        .reply({ content: '🔒 Chỉ người tổ chức hoặc quản trị viên mới quay lại được.', ...eph })
        .catch(() => {});
    }
    if (!gw.ended) {
      return interaction
        .reply({ content: '⏳ Giveaway chưa kết thúc nên chưa quay lại được.', ...eph })
        .catch(() => {});
    }
    if (gw.cancelled) {
      return interaction
        .reply({ content: '🚫 Đợt này đã bị huỷ nên không quay lại được.', ...eph })
        .catch(() => {});
    }

    const fresh = store.get(interaction.message.id);
    // Loại TẤT CẢ ai từng thắng đợt này, không chỉ lần quay gần nhất.
    const past = fresh.pastWinners && fresh.pastWinners.length ? fresh.pastWinners : fresh.winners || [];
    const next = store.pickWinners(fresh.entries, fresh.winnerCount, past, fresh.weights);
    if (!next.length) {
      return interaction
        .reply({ content: '😢 Không còn ai khác để quay lại.', ...eph })
        .catch(() => {});
    }
    fresh.winners = next;
    fresh.pastWinners = [...new Set([...past, ...next])];
    fresh.rerolled = (fresh.rerolled || 0) + 1;
    store.save(fresh);

    await interaction.update({ embeds: [buildEmbed(fresh)], components: buildRows(fresh) }).catch(() => {});
    await dmWinners(client, fresh, next);
    return interaction
      .followUp({
        content:
          '🎲 Đã quay lại! Người thắng mới: ' +
          next.map((id) => '<@' + id + '>').join(', ') +
          ' — phần thưởng **' + escapeMd(fresh.prize) + '**',
        allowedMentions: { parse: [], users: next.slice(0, 20), roles: [], repliedUser: false },
      })
      .catch(() => {});
  }

  return interaction.deferUpdate().catch(() => {});
}

module.exports = {
  parseDuration,
  escapeMd,
  extractMentions,
  pingContent,
  mentionsFor,
  buildEmbed,
  buildRows,
  endGiveaway,
  handleButton,
  scheduleOne,
  scheduleAll,
  messageLink,
  MIN_MS,
  MAX_MS,
  MAX_WINNERS,
  MAX_PRIZE_LEN,
  MAX_DESC_LEN,
  MAX_BONUS,
};
