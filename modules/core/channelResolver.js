// =============================================================
//  channelResolver - nguon du lieu kenh DUY NHAT cho toan bo bot
//
//  VAN DE DA GAP:
//    Discord CHI cho phep tra ve toi da 25 goi y (autocomplete choices).
//    May chu that su thuong co 40-100+ kenh, nen neu chi cat 25 kenh dau
//    theo vi tri thi nguoi dung se thay "thieu kenh".
//
//  CACH XU LY O DAY:
//    1. Luon lay danh sach MOI NHAT tu Discord (kenh vua tao hien ngay).
//    2. Khi o tim kiem CON TRONG  -> uu tien kenh lien quan nhat
//       (kenh hien tai, cung danh muc, kenh chat, ...) va bao ro
//       "con N kenh nua - go de tim".
//    3. Khi nguoi dung GO CHU     -> cham diem toan bo kenh roi lay 25 ket qua
//       khop nhat, nen moi kenh deu tim duoc, khong con kenh nao bi khuat.
//    4. Go khong dau / khac dau gach / dan ID / dan <#id> deu ra dung kenh.
// =============================================================
const { ChannelType } = require('discord.js');

// Cac loai kenh co the GUI tin nhan vao.
const TEXT_LIKE = [
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildVoice,
  ChannelType.GuildStageVoice,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
  ChannelType.AnnouncementThread,
].filter((t) => t !== undefined);

// Moi loai kenh trong mot may chu (dung cho lenh chi xem thong tin).
const ALL_GUILD = [
  ...TEXT_LIKE,
  ChannelType.GuildCategory,
  ChannelType.GuildForum,
  ChannelType.GuildMedia,
].filter((t) => t !== undefined);

const TYPE_ICON = {
  [ChannelType.GuildText]: '#',
  [ChannelType.GuildAnnouncement]: '\u{1F4E2}',
  [ChannelType.GuildVoice]: '\u{1F50A}',
  [ChannelType.GuildStageVoice]: '\u{1F399}',
  [ChannelType.GuildCategory]: '\u{1F4C1}',
  [ChannelType.GuildForum]: '\u{1F4AC}',
  [ChannelType.GuildMedia]: '\u{1F5BC}',
  [ChannelType.PublicThread]: '\u{1F9F5}',
  [ChannelType.PrivateThread]: '\u{1F512}',
  [ChannelType.AnnouncementThread]: '\u{1F9F5}',
};

// Gia tri gia dat o dong "con N kenh nua". Neu nguoi dung lo bam vao,
// resolveChannel se tra ve null va lenh bao loi than thien.
const HINT_VALUE = '__go_de_tim__';

// Bo dau tieng Viet + chuyen ve chu thuong.
function norm(text) {
  return String(text == null ? '' : text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u0111\u0110]/g, 'd')
    .toLowerCase()
    .trim();
}

// Bo luon dau gach / khoang trang / dau cham de "thong bao" khop "thong-bao".
function loose(text) {
  return norm(text).replace(/[^a-z0-9]/g, '');
}

const ID_RE = /^\d{15,25}$/;

// -------------------------------------------------------------
//  Lay danh sach kenh (luon co gang lam moi truoc)
// -------------------------------------------------------------
const FRESH_MS = 5000;
const lastFetch = new Map(); // guildId -> timestamp
const inFlight = new Map(); // guildId -> Promise (gop cac lan goi trung nhau)

async function doFetch(guild) {
  // fetch() ghi thang ket qua vao cache nen chi can bo qua loi.
  await guild.channels.fetch().catch(() => null);
  // Kenh luong (thread) dang hoat dong KHONG nam trong channels.fetch().
  if (typeof guild.channels.fetchActiveThreads === 'function') {
    await guild.channels.fetchActiveThreads().catch(() => null);
  }
}

/**
 * Lay TAT CA kenh cua may chu. Khong bao gio nem loi: fetch hong thi dung cache.
 * @returns {Promise<Array>} mang channel
 */
async function fetchAllChannels(guild, { force = false } = {}) {
  if (!guild || !guild.channels) return [];
  const now = Date.now();
  const last = lastFetch.get(guild.id) || 0;

  if (force || now - last > FRESH_MS) {
    // Gop nhieu lan goi song song (nguoi dung go nhanh) vao MOT request duy nhat.
    let p = inFlight.get(guild.id);
    if (!p) {
      p = doFetch(guild).finally(() => {
        // Chi danh dau "da lam moi" SAU khi fetch xong, tranh doc phai cache cu.
        lastFetch.set(guild.id, Date.now());
        inFlight.delete(guild.id);
      });
      inFlight.set(guild.id, p);
    }
    await p;
  }
  return [...guild.channels.cache.values()].filter(Boolean);
}

// Don bo nho khi bot roi khoi may chu (tranh ro ri khi chay 24/7).
function forget(guildId) {
  lastFetch.delete(guildId);
  inFlight.delete(guildId);
}

// Ban dong bo (khong fetch) - dung khi khong the await.
function allCached(guild) {
  if (!guild || !guild.channels) return [];
  return [...guild.channels.cache.values()].filter(Boolean);
}

function matchesTypes(channel, types) {
  if (!types || !types.length) return true;
  return types.includes(channel.type);
}

// -------------------------------------------------------------
//  Sap xep giong het thanh ben cua Discord
//  (danh muc -> vi tri trong danh muc -> ten)
// -------------------------------------------------------------
function sortKey(c) {
  const parent = c.parent || null;
  // Kenh khong thuoc danh muc nao luon nam tren cung.
  const catPos = parent ? (typeof parent.rawPosition === 'number' ? parent.rawPosition : parent.position || 0) : -1;
  const own = typeof c.rawPosition === 'number' ? c.rawPosition : c.position || 0;
  return [catPos, parent ? String(parent.id) : '', own, String(c.name || '')];
}

function sortChannels(list) {
  return list
    .slice()
    .map((c) => ({ c, k: sortKey(c) }))
    .sort((a, b) => {
      if (a.k[0] !== b.k[0]) return a.k[0] - b.k[0];
      if (a.k[1] !== b.k[1]) return a.k[1] < b.k[1] ? -1 : 1;
      if (a.k[2] !== b.k[2]) return a.k[2] - b.k[2];
      return a.k[3].localeCompare(b.k[3]);
    })
    .map((x) => x.c);
}

// -------------------------------------------------------------
//  Cham diem do khop (cang NHO cang khop)
// -------------------------------------------------------------
function matchScore(channel, q, qLoose) {
  if (!q) return 100; // o tim kiem dang trong -> moi kenh deu "khop"
  const name = norm(channel.name);
  const nameLoose = loose(channel.name);
  if (channel.id === q) return 0;
  if (name === q) return 1;
  if (nameLoose === qLoose) return 2;
  if (name.startsWith(q)) return 3;
  if (nameLoose.startsWith(qLoose)) return 4;
  if (name.includes(q)) return 5;
  if (nameLoose.includes(qLoose)) return 6;
  // Khop theo ten danh muc, vd go "admin" ra cac kenh trong danh muc ADMIN.
  const parent = channel.parent && channel.parent.name ? loose(channel.parent.name) : '';
  if (qLoose && parent.includes(qLoose)) return 7;
  return -1; // khong khop
}

// Do uu tien khi o tim kiem CON TRONG (cang NHO cang duoc hien truoc).
// Muc dich: 25 dong dau tien phai la nhung kenh nguoi dung hay chon nhat.
function idlePriority(channel, ctx) {
  if (ctx.currentId && channel.id === ctx.currentId) return 0;
  if (ctx.parentId && channel.parentId === ctx.parentId) return 1;
  if (channel.type === ChannelType.GuildText) return 2;
  if (channel.type === ChannelType.GuildAnnouncement) return 3;
  if (channel.type === ChannelType.GuildForum || channel.type === ChannelType.GuildMedia) return 4;
  if (channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice) return 5;
  if (channel.type === ChannelType.GuildCategory) return 7;
  return 6; // thread va cac loai khac
}

// -------------------------------------------------------------
//  Tim kenh theo chuoi nguoi dung nhap
// -------------------------------------------------------------
/**
 * Chap nhan: ID, <#id>, #ten, ten day du, ten khong dau, ten mot phan.
 * Luon lam moi danh sach truoc de kenh vua tao cung tim duoc ngay.
 */
async function resolveChannel(guild, query, { types = null } = {}) {
  if (!guild || query == null) return null;
  const raw = String(query).trim();
  if (!raw || raw === HINT_VALUE) return null;

  const id = raw.replace(/[<#>]/g, '').trim();
  if (ID_RE.test(id)) {
    const cached = guild.channels.cache.get(id);
    if (cached) return matchesTypes(cached, types) ? cached : null;
    const fetched = await guild.channels.fetch(id).catch(() => null);
    if (fetched) return matchesTypes(fetched, types) ? fetched : null;
  }

  const list = (await fetchAllChannels(guild)).filter((c) => matchesTypes(c, types));
  return bestMatch(list, raw);
}

// Bo lop vo cua mot lan nhac kenh: "<#123>", "#ten" -> "123" / "ten".
function stripWrap(raw) {
  return String(raw == null ? '' : raw)
    .trim()
    .replace(/^<#!?/, '')
    .replace(/>$/, '')
    .replace(/^#/, '')
    .trim();
}

function bestMatch(list, raw) {
  const cleaned = stripWrap(raw);
  const q = norm(cleaned);
  const qLoose = loose(cleaned);
  if (!q && !qLoose) return null;

  let best = null;
  let bestScore = Infinity;
  for (const c of sortChannels(list)) {
    const s = matchScore(c, q, qLoose);
    if (s < 0 || s >= 100) continue;
    if (s < bestScore) {
      bestScore = s;
      best = c;
      if (s === 0) break;
    }
  }
  return best;
}

// Ban dong bo (chi dung cache) - du phong khi khong await duoc.
function resolveChannelSync(guild, query, { types = null } = {}) {
  if (!guild || query == null) return null;
  const raw = String(query).trim();
  if (!raw || raw === HINT_VALUE) return null;
  const id = raw.replace(/[<#>]/g, '').trim();
  if (ID_RE.test(id)) {
    const c = guild.channels.cache.get(id);
    if (c) return matchesTypes(c, types) ? c : null;
  }
  const list = allCached(guild).filter((c) => matchesTypes(c, types));
  return bestMatch(list, raw);
}

// -------------------------------------------------------------
//  Goi y (autocomplete)
// -------------------------------------------------------------
function label(c) {
  const icon = TYPE_ICON[c.type] || '#';
  const parent = c.parent && c.parent.name ? ' \u00B7 ' + c.parent.name : '';
  let name = icon + ' ' + c.name + parent;
  if (name.length > 100) name = name.slice(0, 99) + '\u2026';
  return name;
}

/**
 * Tra loi goi y cho mot option kieu chuoi dung de chon kenh.
 * Danh sach LUON duoc lam moi nen kenh vua tao xuat hien ngay lap tuc.
 */
async function autocompleteChannels(interaction, { types = null, limit = 25 } = {}) {
  try {
    if (interaction.responded) return;
    const guild = interaction.guild;
    if (!guild) {
      await interaction.respond([]).catch(() => {});
      return;
    }

    const focused = String(interaction.options.getFocused() || '').trim();
    const all = (await fetchAllChannels(guild)).filter((c) => matchesTypes(c, types));

    const q = norm(focused.replace(/^#/, '').replace(/[<>]/g, ''));
    const qLoose = loose(focused);

    let ranked;
    if (q || qLoose) {
      // CO tu khoa: cham diem TOAN BO kenh roi lay 25 ket qua khop nhat.
      // Nho vay khong kenh nao bi khuat, du may chu co hang tram kenh.
      ranked = sortChannels(all)
        .map((c, i) => ({ c, s: matchScore(c, q, qLoose), i }))
        .filter((x) => x.s >= 0 && x.s < 100)
        .sort((a, b) => a.s - b.s || a.i - b.i)
        .map((x) => x.c);
    } else {
      // KHONG co tu khoa: uu tien kenh lien quan nhat de 25 dong dau huu ich.
      const ctx = {
        currentId: interaction.channelId || null,
        parentId: (interaction.channel && interaction.channel.parentId) || null,
      };
      ranked = sortChannels(all)
        .map((c, i) => ({ c, p: idlePriority(c, ctx), i }))
        .sort((a, b) => a.p - b.p || a.i - b.i)
        .map((x) => x.c);
    }

    const total = ranked.length;
    const truncated = total > limit;
    // Neu bi cat bot, danh 1 o de bao cho nguoi dung biet can go them.
    const take = truncated ? limit - 1 : limit;
    const choices = ranked.slice(0, take).map((c) => ({ name: label(c), value: c.id }));

    if (truncated) {
      const hidden = total - take;
      let hint = '\u2026 con ' + hidden + ' k\u00EAnh n\u1EEFa \u2014 g\u00F5 t\u00EAn k\u00EAnh \u0111\u1EC3 t\u00ECm';
      if (hint.length > 100) hint = hint.slice(0, 99) + '\u2026';
      choices.push({ name: hint, value: HINT_VALUE });
    }

    await interaction.respond(choices.slice(0, limit)).catch(() => {});
  } catch {
    if (!interaction.responded) await interaction.respond([]).catch(() => {});
  }
}

module.exports = {
  TEXT_LIKE,
  ALL_GUILD,
  TYPE_ICON,
  HINT_VALUE,
  norm,
  loose,
  fetchAllChannels,
  forget,
  allCached,
  sortChannels,
  matchScore,
  resolveChannel,
  resolveChannelSync,
  autocompleteChannels,
};
