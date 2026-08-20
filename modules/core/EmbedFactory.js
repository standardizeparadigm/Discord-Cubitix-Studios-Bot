// =============================================================
//  EmbedFactory - tạo embed đẹp, đồng nhất màu sắc & footer
// =============================================================
const { EmbedBuilder } = require('discord.js');
const { colors, emoji } = require('./palette');

const DEFAULTS = { footerText: 'Cubitix Studios', embedColor: '#5865F2', brand: 'Cubitix Studios' };
let cfg = { ...DEFAULTS };

// GOP cau hinh thay vi ghi de. Truoc day neu .env thieu FOOTER_TEXT thi
// cfg.footerText === undefined -> setFooter({ text: undefined }) se nem loi
// va lam HONG moi embed cua bot.
function init(config) {
  cfg = { ...DEFAULTS, ...(config || {}) };
  if (!cfg.footerText || typeof cfg.footerText !== 'string') cfg.footerText = DEFAULTS.footerText;
  if (cfg.footerText.length > 2048) cfg.footerText = cfg.footerText.slice(0, 2048);
  if (!cfg.embedColor) cfg.embedColor = DEFAULTS.embedColor;
}

function base() {
  return new EmbedBuilder().setFooter({ text: cfg.footerText || DEFAULTS.footerText }).setTimestamp();
}

function primary(title, description) {
  const e = base().setColor(cfg.embedColor || colors.primary);
  if (title) e.setTitle(title);
  if (description) e.setDescription(description);
  return e;
}

function success(title, description) {
  return base()
    .setColor(colors.success)
    .setTitle(`${emoji.success} ${title}`)
    .setDescription(description || null);
}

function error(title, description) {
  return base()
    .setColor(colors.error)
    .setTitle(`${emoji.error} ${title}`)
    .setDescription(description || null);
}

function warn(title, description) {
  return base()
    .setColor(colors.warning)
    .setTitle(`${emoji.warning} ${title}`)
    .setDescription(description || null);
}

function info(title, description) {
  return base()
    .setColor(colors.info)
    .setTitle(`${emoji.info} ${title}`)
    .setDescription(description || null);
}

function custom(color, title, description) {
  const e = base().setColor(color);
  if (title) e.setTitle(title);
  if (description) e.setDescription(description);
  return e;
}

module.exports = { init, base, primary, success, error, warn, info, custom, colors, emoji };
