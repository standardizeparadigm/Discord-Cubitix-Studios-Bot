// =============================================================
//  Lệnh: gwlist - xem các đợt giveaway của máy chủ
//  Giúp quản trị viên không phải cuộn tìm lại tin nhắn giveaway cũ.
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { colors } = require('../../core/palette');
const store = require('../../core/giveawayStore');
const gm = require('../../core/giveawayManager');

const MAX_ACTIVE_SHOWN = 10;
const MAX_ENDED_SHOWN = 5;

module.exports = {
  name: 'gwlist',
  aliases: ['giveawaylist', 'danhsachgiveaway', 'gwds'],
  category: 'giveaway',
  description: 'Xem các đợt giveaway đang diễn ra và vừa kết thúc',
  usage: '',
  cooldown: 5,
  guildOnly: true,
  slash: true,
  options: [],

  async run(ctx) {
    store.prune();
    const active = store.activeInGuild(ctx.guild.id);
    const ended = store.endedInGuild(ctx.guild.id);

    if (!active.length && !ended.length) {
      return ctx.reply({
        embeds: [
          Embed.info(
            'Chưa có giveaway nào',
            'Máy chủ này chưa có đợt giveaway nào được lưu.\nTạo một đợt bằng lệnh `giveaway 1d 1 Phần thưởng`.',
          ),
        ],
      });
    }

    const embed = Embed.custom(colors.gold, '🎁 Giveaway của ' + ctx.guild.name).setDescription(
      'Đang diễn ra: **' + active.length + '** — đã kết thúc (còn lưu): **' + ended.length + '**',
    );

    if (active.length) {
      const lines = active.slice(0, MAX_ACTIVE_SHOWN).map((gw, i) => {
        const endSec = Math.floor(gw.endAt / 1000);
        const people = (gw.entries || []).length;
        const tickets = store.totalTickets(gw);
        const joined = tickets !== people ? people + ' người / ' + tickets + ' lượt' : people + ' người';
        return (
          '**' + (i + 1) + '. ' + gm.escapeMd(gw.prize) + '**\n' +
          ' ⏳ Kết thúc <t:' + endSec + ':R> • 👑 ' + gw.winnerCount + ' giải • 👥 ' + joined + '\n' +
          ' 🎤 <@' + gw.hostId + '> • [Đến tin nhắn](' + gm.messageLink(gw) + ')'
        );
      });
      const more =
        active.length > MAX_ACTIVE_SHOWN
          ? '\n… và ' + (active.length - MAX_ACTIVE_SHOWN) + ' đợt khác.'
          : '';
      embed.addFields({
        name: '▶️ Đang diễn ra (' + active.length + ')',
        value: (lines.join('\n\n') + more).slice(0, 1024),
      });
    }

    if (ended.length) {
      const lines = ended.slice(0, MAX_ENDED_SHOWN).map((gw) => {
        const endSec = Math.floor(gw.endAt / 1000);
        const state = gw.cancelled
          ? '🚫 Đã huỷ'
          : (gw.winners || []).length
            ? '🏆 ' + gw.winners.map((id) => '<@' + id + '>').join(', ')
            : '😢 Không có người thắng';
        return (
          '**' + gm.escapeMd(gw.prize) + '** — <t:' + endSec + ':R>\n' +
          ' ' + state + ' • [Đến tin nhắn](' + gm.messageLink(gw) + ')'
        );
      });
      embed.addFields({
        name: '🏁 Đã kết thúc gần đây',
        value: lines.join('\n\n').slice(0, 1024),
      });
    }

    embed.setFooter({
      text: 'Các đợt đã kết thúc được giữ 7 ngày để còn quay lại được.',
    });

    // Không ping ai khi liệt kê danh sách.
    return ctx.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};
