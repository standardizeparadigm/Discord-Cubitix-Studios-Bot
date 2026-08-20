// =============================================================
//  Lệnh: sysinfo - thông tin hệ thống & runtime của bot (CHỈ CHỦ BOT)
// =============================================================
const os = require('os');
const { version: djsVersion } = require('discord.js');
const Embed = require('../../core/EmbedFactory');
const { colors, emoji } = require('../../core/palette');

function fmtBytes(bytes) {
  const mb = bytes / 1024 / 1024;
  if (mb >= 1024) return (mb / 1024).toFixed(2) + ' GB';
  return mb.toFixed(1) + ' MB';
}

function fmtUptime(sec) {
  sec = Math.floor(sec);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const parts = [];
  if (d) parts.push(`${d} ngày`);
  if (h) parts.push(`${h} giờ`);
  if (m) parts.push(`${m} phút`);
  parts.push(`${s} giây`);
  return parts.join(' ');
}

module.exports = {
  name: 'sysinfo',
  aliases: ['sys', 'ownerstats', 'botsys'],
  category: 'owner',
  description: 'Xem thông tin hệ thống & runtime của bot (chỉ chủ bot)',
  usage: '',
  cooldown: 5,
  ownerOnly: true,
  slash: true,
  async run(ctx) {
    const client = ctx.client;
    const mem = process.memoryUsage();
    const totalMembers = client.guilds.cache.reduce((a, g) => a + (g.memberCount || 0), 0);
    const cpu = os.cpus() || [];
    const cpuModel = cpu.length ? cpu[0].model.trim() : 'Không rõ';
    const ws = Math.round(client.ws.ping);

    const embed = Embed.custom(colors.info, `${emoji.info} Thông tin hệ thống`)
      .addFields(
        { name: '🤖 Bot', value: `${client.user.tag}`, inline: true },
        { name: '📡 Ping API', value: ws < 0 ? 'Đang tính' : `${ws}ms`, inline: true },
        { name: '⏱️ Thời gian chạy', value: fmtUptime(process.uptime()), inline: true },
        { name: '🌐 Máy chủ', value: `${client.guilds.cache.size.toLocaleString('vi-VN')}`, inline: true },
        { name: '👥 Thành viên', value: `${totalMembers.toLocaleString('vi-VN')}`, inline: true },
        { name: '📚 Lệnh', value: `${client.commands.size}`, inline: true },
        { name: '🧠 RAM bot', value: `${fmtBytes(mem.rss)} (heap ${fmtBytes(mem.heapUsed)})`, inline: true },
        { name: '💾 RAM hệ thống', value: `${fmtBytes(os.totalmem() - os.freemem())} / ${fmtBytes(os.totalmem())}`, inline: true },
        { name: '🖥️ Nền tảng', value: `${os.platform()} ${os.arch()}`, inline: true },
        { name: '⚙️ CPU', value: `${cpuModel} (${cpu.length} nhân)`, inline: false },
        { name: '🟩 Node.js', value: process.version, inline: true },
        { name: '📦 discord.js', value: `v${djsVersion}`, inline: true },
      )
      .setFooter({ text: `${client.config.brand || 'Cubitix Studios'}` });
    await ctx.reply({ embeds: [embed] });
  },
};
