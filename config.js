// =============================================================
//  config.js - đọc cấu hình từ file .env
//  Bạn KHÔNG cần sửa file này - chỉ cần điền thông tin trong .env
// =============================================================
require('dotenv').config();

function bool(value, fallback = true) {
  if (value === undefined || value === '') return fallback;
  return ['true', '1', 'yes', 'on', 'co'].includes(String(value).toLowerCase());
}

const activities = (process.env.ACTIVITIES || '{prefix}help | Cubitix Studios;{guilds} máy chủ;{users} thành viên')
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean);

const welcomeChannelId = process.env.WELCOME_CHANNEL_ID || '';

module.exports = {
  token: process.env.DISCORD_TOKEN || '',
  clientId: process.env.CLIENT_ID || '',
  guildId: process.env.GUILD_ID || '',
  prefix: process.env.PREFIX || '!',
  ownerId: process.env.OWNER_ID || '',
  brand: process.env.BRAND_NAME || 'Cubitix Studios',
  embedColor: process.env.EMBED_COLOR || '#5865F2',
  footerText: process.env.FOOTER_TEXT || 'Cubitix Studios • All In One Bot',

  // --- Chào mừng & tạm biệt thành viên ---
  welcomeChannelId,
  // Bỏ trống GOODBYE_CHANNEL_ID thì dùng chung kênh với lời chào mừng.
  goodbyeChannelId: process.env.GOODBYE_CHANNEL_ID || welcomeChannelId,
  welcomeEnabled: bool(process.env.WELCOME_ENABLED, true),
  goodbyeEnabled: bool(process.env.GOODBYE_ENABLED, true),
  // Đếm xem ai đã mời thành viên mới và tổng số lượt mời của người đó.
  inviteTracking: bool(process.env.INVITE_TRACKING, true),

  enableSlash: bool(process.env.ENABLE_SLASH, true),
  activities,
};
