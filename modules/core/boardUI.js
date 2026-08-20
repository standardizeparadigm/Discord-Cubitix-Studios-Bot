// =============================================================
//  boardUI - các hàng nút bấm dùng chung cho mọi bảng xếp hạng chia trang.
//
//  Tách riêng khỏi boardPage.js vì file này cần discord.js, còn boardPage.js
//  thì không (để kiểm thử được độc lập).
//
//  Mỗi lệnh truyền vào một `prefix` riêng (ví dụ 'top', 'ftop') để hai bảng
//  mở cùng lúc không ăn nhầm nút của nhau.
// =============================================================
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const page = require('./boardPage');

// Hàng điều hướng: đầu · trước · (trang x/y) · sau · cuối
function navRow(prefix, current, list, disabled = false) {
  const pages = page.pageCount(list);
  const safe = page.clampPage(current, list);
  const atFirst = safe <= 0;
  const atLast = safe >= pages - 1;

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(prefix + ':first')
      .setEmoji('⏮️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || atFirst),
    new ButtonBuilder()
      .setCustomId(prefix + ':prev')
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled || atFirst),
    // Nút giữa chỉ để hiển thị số trang -> luôn tắt.
    new ButtonBuilder()
      .setCustomId(prefix + ':page')
      .setLabel('Trang ' + (safe + 1) + '/' + pages)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(prefix + ':next')
      .setEmoji('▶️')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled || atLast),
    new ButtonBuilder()
      .setCustomId(prefix + ':last')
      .setEmoji('⏭️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || atLast),
  );
}

// Hàng tiện ích: nhảy tới hạng của mình · làm mới · đóng
function toolsRow(prefix, disabled = false, hasRows = true) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(prefix + ':me')
      .setLabel('Hạng của tôi')
      .setEmoji('🎯')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled || !hasRows),
    new ButtonBuilder()
      .setCustomId(prefix + ':refresh')
      .setLabel('Làm mới')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(prefix + ':close')
      .setLabel('Đóng')
      .setEmoji('✖️')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
  );
}

// Hàng menu thả xuống để đổi chế độ xếp hạng.
// items: [{ key, label, emoji, desc }]
function modeRow(prefix, items, activeKey, placeholder, disabled = false) {
  const list = (Array.isArray(items) ? items : []).slice(0, 25);
  const select = new StringSelectMenuBuilder()
    .setCustomId(prefix + ':mode')
    .setPlaceholder(placeholder || 'Chọn chế độ xếp hạng')
    .setDisabled(disabled)
    .addOptions(
      list.map((c) => {
        const opt = {
          label: String(c.label).slice(0, 100),
          value: String(c.key).slice(0, 100),
          default: c.key === activeKey,
        };
        // description rỗng sẽ bị Discord từ chối -> chỉ gắn khi có nội dung.
        if (c.desc) opt.description = String(c.desc).slice(0, 100);
        if (c.emoji) opt.emoji = c.emoji;
        return opt;
      }),
    );
  return new ActionRowBuilder().addComponents(select);
}

// Tra tên hiển thị SONG SONG + có bộ nhớ đệm.
// Bản cũ tra tuần tự từng người -> 10 lượt gọi nối đuôi nhau, rất chậm.
async function resolveNames(client, ids, cache) {
  const want = Array.isArray(ids) ? ids : [];
  const missing = want.filter((id) => !cache.has(id));
  if (!missing.length) return cache;
  await Promise.all(
    missing.map(async (id) => {
      const u = await client.users.fetch(id).catch(() => null);
      cache.set(id, u ? (u.globalName || u.username) : 'Người dùng ẩn');
    }),
  );
  return cache;
}

module.exports = {
  navRow,
  toolsRow,
  modeRow,
  resolveNames,
  // Tiện tay dùng lại phần tính toán mà không phải require thêm file.
  ...page,
};
