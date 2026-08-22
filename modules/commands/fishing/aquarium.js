// =============================================================
//  Lệnh: aquarium - xem bể cá (cá đã câu, chưa bán)
//
//  BẢN NÂNG CẤP LTS v3.1.4 - CHIA TRANG
//  VẤN ĐỀ CỦA BẢN CŨ: embed của Discord chỉ chứa tối đa 25 ô / 6000 ký
//  tự, nên khi người chơi có quá nhiều loài thì danh sách bị "rút gọn" và
//  phần cá còn lại KHÔNG bao giờ xem được.
//  BẢN MỚI: chia trang 10 loài/trang với nút ⏮️ ◀️ ▶️ ⏭️, thêm bộ lọc
//  theo độ hiếm và 4 kiểu sắp xếp. Phần dụng giao diện nằm ở
//  modules/core/aquariumView.js để lệnh `fish` dùng lại được.
// =============================================================
const { MessageFlags } = require('discord.js');
const db = require('../../core/Database');
const fishing = require('../../core/fishing');
const view = require('../../core/aquariumView');
const ui = require('../../core/boardUI');

const ID = 'aq';
const PANEL_TIME = 180000;

// Danh sách độ hiếm cho option slash (cao → thấp, kèm mục "tất cả").
const RARITY_CHOICES = [{ name: 'Tất cả độ hiếm', value: 'all' }].concat(
  Object.values(fishing.RARITIES)
    .sort((a, b) => b.order - a.order)
    .map((r) => ({ name: String(r.label).slice(0, 100), value: r.key })),
);

const SORT_CHOICES = view.SORTS.map((s) => ({ name: s.label, value: s.key }));

function prefixOf(ctx) {
  try {
    return db.getPrefix(ctx.guild && ctx.guild.id) || (ctx.client.config && ctx.client.config.prefix) || '';
  } catch {
    return '';
  }
}

module.exports = {
  name: 'aquarium',
  aliases: ['aq', 'beca', 'tank', 'hoca'],
  category: 'fishing',
  description: 'Xem bể cá của bạn hoặc người khác (chia trang, lọc theo độ hiếm)',
  usage: '[@thành_viên] [trang]',
  cooldown: 4,
  guildOnly: true,
  slash: true,
  options: [
    { name: 'thành_viên', type: 'user', description: 'Người muốn xem (bỏ trống = chính bạn)', required: false },
    { name: 'trang', type: 'integer', description: 'Mở thẳng tới trang số mấy', required: false, minValue: 1 },
    { name: 'độ_hiếm', type: 'string', description: 'Chỉ xem một bậc độ hiếm', required: false, choices: RARITY_CHOICES },
    { name: 'sắp_xếp', type: 'string', description: 'Cách sắp xếp danh sách', required: false, choices: SORT_CHOICES },
  ],

  async run(ctx) {
    const target = ctx.getUser('thành_viên') || ctx.author;
    const self = String(target.id) === String(ctx.author.id);
    const cmdPrefix = prefixOf(ctx);

    // Trạng thái của bảng đang mở
    let filter = view.safeFilter(ctx.getString('độ_hiếm'));
    let sortKey = view.safeSort(ctx.getString('sắp_xếp'));
    const wantPage = ctx.getInteger('trang');
    let current = Number.isFinite(wantPage) && wantPage > 0 ? wantPage - 1 : 0;

    // Đọc lại ví mỗi lần render để số liệu luôn mới (người chơi có thể
    // vừa câu hoặc vừa bán cá ở tin nhắn khác trong lúc bảng đang mở).
    const render = (disabled = false) => {
      const wallet = db.getWallet(target.id);
      const built = view.buildView({
        aquarium: wallet.aquarium || [],
        name: target.globalName || target.username,
        avatar: typeof target.displayAvatarURL === 'function' ? target.displayAvatarURL() : undefined,
        prefix: ID,
        current,
        filter,
        sortKey,
        disabled,
        cmdPrefix,
        self,
      });
      current = built.page; // cắt lại cho khỏi vượt số trang
      return built;
    };

    const first = render(false);
    const msg = await ctx.reply({ embeds: first.embeds, components: first.components });

    // Bể trống thì không có nút nào -> không cần mở collector.
    if (!first.components.length) return;

    const collector = msg.createMessageComponentCollector({ time: PANEL_TIME });
    let ended = false;

    collector.on('collect', async (i) => {
      if (i.user.id !== ctx.author.id) {
        return i
          .reply({
            content: `❌ Đây không phải bảng bạn mở. Hãy tự gõ \`${cmdPrefix}aquarium\` để có bảng riêng nhé!`,
            flags: MessageFlags.Ephemeral,
          })
          .catch(() => {});
      }
      if (ended) return i.deferUpdate().catch(() => {});

      const id = i.customId;

      if (id === `${ID}:close`) {
        await i.deferUpdate().catch(() => {});
        collector.stop('closed');
        return undefined;
      }

      if (id === `${ID}:filter`) {
        const v = Array.isArray(i.values) ? i.values[0] : null;
        filter = view.safeFilter(v);
        current = 0;
      } else if (id === `${ID}:sort`) {
        const v = Array.isArray(i.values) ? i.values[0] : null;
        sortKey = view.safeSort(v);
        current = 0;
      } else if (id === `${ID}:first`) {
        current = 0;
      } else if (id === `${ID}:prev`) {
        current = Math.max(0, current - 1);
      } else if (id === `${ID}:next`) {
        current += 1;
      } else if (id === `${ID}:last`) {
        current = Number.MAX_SAFE_INTEGER; // buildView sẽ cắt về trang cuối
      } else if (id !== `${ID}:refresh`) {
        // Nút "Trang x/y" ở giữa luôn bị tắt, nhưng vẫn phòng xa.
        return i.deferUpdate().catch(() => {});
      }

      await i.deferUpdate().catch(() => {});
      const next = render(false);
      await msg.edit({ embeds: next.embeds, components: next.components }).catch(() => {});
      return undefined;
    });

    collector.on('end', () => {
      if (ended) return;
      ended = true;
      const off = render(true);
      msg.edit({ components: off.components }).catch(() => {});
    });
  },
};

// Giữ lại tham chiếu ui để tránh lỗi "require không dùng" khi soi mã;
// navRow dùng chung nằm trong aquariumView.
void ui;
