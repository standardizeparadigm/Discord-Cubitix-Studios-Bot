// =============================================================
//  slashBuilder - chuyển một lệnh thành SlashCommandBuilder
//  Dùng chung bởi commandHandler và deploy-commands.js
//
//  Hỗ trợ các thuộc tính option:
//    name, type, description, required, rest
//    choices      : [{ name, value }]  hoặc ['a','b']
//    channelTypes : mảng ChannelType cho option kiểu 'channel'
//    autocomplete : true  -> bật gợi ý động (chỉ với string/integer/number)
//    minValue/maxValue, minLength/maxLength
// =============================================================
const { SlashCommandBuilder, ChannelType } = require('discord.js');

const typeMap = {
  string: 'addStringOption',
  integer: 'addIntegerOption',
  number: 'addNumberOption',
  boolean: 'addBooleanOption',
  user: 'addUserOption',
  channel: 'addChannelOption',
  role: 'addRoleOption',
  mentionable: 'addMentionableOption',
  attachment: 'addAttachmentOption',
};

// Discord chỉ chấp nhận tên gồm chữ cái (mọi ngôn ngữ), chữ số, '-' và '_',
// viết thường, dài 1..32. Tên sai sẽ làm TOÀN BỘ việc đăng ký slash thất bại.
const NAME_RE = /^[-_\p{L}\p{N}]{1,32}$/u;

function normalizeName(raw, fallback) {
  let t = String(raw == null ? '' : raw).trim().toLowerCase();
  // Khoảng trắng & dấu chấm -> gạch dưới; bỏ mọi ký tự không hợp lệ.
  t = t.replace(/\s+/g, '_').replace(/[^-_\p{L}\p{N}]/gu, '');
  if (!t) t = String(fallback || 'option').toLowerCase().replace(/[^-_\p{L}\p{N}]/gu, '');
  if (!t) t = 'option';
  if (t.length > 32) t = t.slice(0, 32);
  if (!NAME_RE.test(t)) throw new Error(`Tên không hợp lệ cho Discord: "${raw}"`);
  return t;
}

function clean(text, fallback) {
  const t = (text || fallback || 'Không có mô tả').toString().replace(/\s+/g, ' ').trim() || 'Không có mô tả';
  return t.length > 100 ? t.slice(0, 97) + '...' : t;
}

// Mặc định cho option kiểu kênh: cho phép MỌI loại kênh trong máy chủ.
// Không gọi addChannelTypes = Discord tự cho mọi loại, nhưng khai báo tường minh
// giúp lọc đúng khi lệnh chỉ muốn kênh chat được.
function resolveChannelTypes(opt) {
  if (!opt.channelTypes) return null;
  if (opt.channelTypes === 'text') {
    return [
      ChannelType.GuildText,
      ChannelType.GuildAnnouncement,
      ChannelType.GuildVoice,
      ChannelType.GuildStageVoice,
      ChannelType.PublicThread,
      ChannelType.PrivateThread,
      ChannelType.AnnouncementThread,
    ].filter((t) => t !== undefined);
  }
  if (Array.isArray(opt.channelTypes) && opt.channelTypes.length) return opt.channelTypes;
  return null;
}

function applyCommon(o, opt, method) {
  o.setName(normalizeName(opt.name, 'option'))
    .setDescription(clean(opt.description, opt.name))
    .setRequired(Boolean(opt.required));

  // Danh sách lựa chọn cố định (tối đa 25).
  if (Array.isArray(opt.choices) && opt.choices.length && typeof o.addChoices === 'function') {
    const choices = opt.choices
      .slice(0, 25)
      .map((c) => (typeof c === 'object' && c !== null ? c : { name: String(c), value: c }))
      .filter((c) => c && c.name != null && c.value != null)
      .map((c) => ({ name: String(c.name).slice(0, 100), value: c.value }));
    if (choices.length) o.addChoices(...choices);
  } else if (opt.autocomplete && typeof o.setAutocomplete === 'function') {
    // Discord không cho vừa choices vừa autocomplete.
    o.setAutocomplete(true);
  }

  if (method === 'addChannelOption') {
    const types = resolveChannelTypes(opt);
    if (types && typeof o.addChannelTypes === 'function') o.addChannelTypes(...types);
  }

  if (typeof o.setMinValue === 'function' && Number.isFinite(opt.minValue)) o.setMinValue(opt.minValue);
  if (typeof o.setMaxValue === 'function' && Number.isFinite(opt.maxValue)) o.setMaxValue(opt.maxValue);
  if (typeof o.setMinLength === 'function' && Number.isFinite(opt.minLength)) o.setMinLength(opt.minLength);
  if (typeof o.setMaxLength === 'function' && Number.isFinite(opt.maxLength)) o.setMaxLength(opt.maxLength);

  return o;
}

module.exports = function buildSlash(command) {
  const builder = new SlashCommandBuilder()
    .setName(normalizeName(command.name, 'command'))
    .setDescription(clean(command.description, command.name));

  // Discord yêu cầu option bắt buộc phải đứng trước option không bắt buộc,
  // nếu không việc đăng ký slash sẽ thất bại. Ta tự sắp xếp lại cho chắc chắn.
  // Dùng chỉ số gốc làm khoá phụ để sắp xếp ỔN ĐỊNH (giữ nguyên thứ tự khai báo).
  const raw = (command.options || []).map((o, i) => ({ o, i }));
  const sorted = raw
    .slice()
    .sort((a, b) => Number(Boolean(b.o.required)) - Number(Boolean(a.o.required)) || a.i - b.i)
    .map((x) => x.o);

  const seen = new Set();
  let count = 0;
  for (const opt of sorted) {
    if (!opt || !opt.name) continue;
    if (count >= 25) {
      throw new Error(`Lệnh "${command.name}" có quá 25 option (Discord chỉ cho tối đa 25).`);
    }
    const finalName = normalizeName(opt.name, 'option');
    if (seen.has(finalName)) {
      throw new Error(`Lệnh "${command.name}" có hai option trùng tên "${finalName}".`);
    }
    seen.add(finalName);
    const method = typeMap[opt.type] || 'addStringOption';
    builder[method]((o) => applyCommon(o, opt, method));
    count++;
  }
  return builder;
};

module.exports.normalizeName = normalizeName;
module.exports.NAME_RE = NAME_RE;
