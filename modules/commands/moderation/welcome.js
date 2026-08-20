// =============================================================
//  Lệnh: welcome - BẬT/TẮT lời chào mừng & tạm biệt (CHỈ QUẢN TRỊ VIÊN)
//
//  - Bật/tắt riêng từng tính năng: chào mừng, tạm biệt, đếm lượt mời
//  - Đổi kênh gửi ngay trên bảng điều khiển (không cần sửa .env)
//  - Xem thử embed trước khi bật
//  - Cài đặt lưu riêng cho TỪNG máy chủ (data/welcome.json)
// =============================================================
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  MessageFlags,
} = require('discord.js');
const Embed = require('../../core/EmbedFactory');
const { colors, emoji } = require('../../core/palette');
const welcomeStore = require('../../core/welcomeStore');
const inviteStore = require('../../core/inviteStore');
const greetings = require('../../core/greetings');

const PANEL_TIME = 180000; // bảng điều khiển sống 3 phút

// Bỏ dấu tiếng Việt để nhận diện hành động dù gõ có dấu hay không.
function plain(text) {
  return String(text == null ? '' : text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'd')
    .trim()
    .toLowerCase();
}

const ACTIONS = {
  panel: ['', 'panel', 'status', 'trang thai', 'trangthai', 'tt', 'bang', 'info'],
  on: ['on', 'bat', 'enable', 'true', 'batall', 'bat tat ca'],
  off: ['off', 'tat', 'disable', 'false', 'tatall', 'tat tat ca'],
  welcomeon: ['welcomeon', 'wcon', 'chaomungon', 'bat chao mung', 'batchaomung'],
  welcomeoff: ['welcomeoff', 'wcoff', 'chaomungoff', 'tat chao mung', 'tatchaomung'],
  goodbyeon: ['goodbyeon', 'gbon', 'tambieton', 'bat tam biet', 'battambiet'],
  goodbyeoff: ['goodbyeoff', 'gboff', 'tambietoff', 'tat tam biet', 'tattambiet'],
  inviteon: ['inviteon', 'trackon', 'bat invite', 'batinvite', 'bat moi'],
  inviteoff: ['inviteoff', 'trackoff', 'tat invite', 'tatinvite', 'tat moi'],
  test: ['test', 'thu', 'xem thu', 'xemthu', 'preview', 'demo'],
  reset: ['reset', 'macdinh', 'mac dinh', 'default', 'khoiphuc', 'khoi phuc'],
};

function resolveAction(raw) {
  const t = plain(raw);
  if (!t) return 'panel';
  for (const key of Object.keys(ACTIONS)) {
    if (key === t) return key;
    if (ACTIONS[key].indexOf(t) !== -1) return key;
  }
  return null;
}

function onOff(v) {
  return v ? '\ud83d\udfe2 **Đang BẬT**' : '\ud83d\udd34 **Đang TẮT**';
}

function channelText(guild, id, isCustom) {
  if (!id) return '\u26a0\ufe0f _Chưa chọn kênh_';
  const exists = guild && guild.channels.cache.has(id);
  return '<#' + id + '>' + (exists ? '' : ' \u26a0\ufe0f _(không tìm thấy kênh)_') + (isCustom ? '' : ' \u2022 _theo .env_');
}

// ---------- Bảng điều khiển ----------
function renderPanel(ctx, notice) {
  const client = ctx.client;
  const guild = ctx.guild;
  const s = welcomeStore.resolve(guild.id, client.config);

  const anyOn = s.welcomeEnabled || s.goodbyeEnabled;
  const color = anyOn ? colors.success : colors.dark;

  const head = anyOn
    ? 'Bot đang gửi thông báo thành viên cho máy chủ này.'
    : 'Hiện **không gửi** thông báo chào mừng hay tạm biệt nào.';

  const desc =
    (notice ? '\u276f ' + String(notice).slice(0, 400) + '\n\n' : '') +
    head +
    '\n_Cài đặt này chỉ áp dụng cho máy chủ **' + guild.name + '**._';

  const e = Embed.custom(color, '\ud83d\udc4b Chào mừng & Tạm biệt', desc);

  e.addFields(
    {
      name: '\u2728 Lời chào mừng',
      value: onOff(s.welcomeEnabled) + '\n\u2514 Kênh: ' + channelText(guild, s.welcomeChannelId, s.welcomeChannelCustom),
      inline: false,
    },
    {
      name: '\ud83d\udc4b Lời tạm biệt',
      value: onOff(s.goodbyeEnabled) + '\n\u2514 Kênh: ' + channelText(guild, s.goodbyeChannelId, s.goodbyeChannelCustom),
      inline: false,
    },
    {
      name: '\ud83d\udc8c Đếm lượt mời',
      value:
        onOff(s.inviteTracking) +
        '\n\u2514 Hiện **ai đã mời** thành viên mới và số lượt mời của người đó',
      inline: false,
    },
  );

  // Cảnh báo sớm những thứ sẽ khiến tính năng không chạy.
  const warns = [];
  if (s.welcomeEnabled && !s.welcomeChannelId) warns.push('Chưa chọn kênh chào mừng \u2192 sẽ không gửi được.');
  if (s.goodbyeEnabled && !s.goodbyeChannelId) warns.push('Chưa chọn kênh tạm biệt \u2192 sẽ không gửi được.');
  try {
    const me = guild.members.me;
    if (s.inviteTracking && me && !me.permissions.has('ManageGuild')) {
      warns.push('Bot thiếu quyền **Quản lý máy chủ** \u2192 không đếm được lượt mời.');
    }
    for (const [label, id, on] of [
      ['chào mừng', s.welcomeChannelId, s.welcomeEnabled],
      ['tạm biệt', s.goodbyeChannelId, s.goodbyeEnabled],
    ]) {
      if (!on || !id) continue;
      const ch = guild.channels.cache.get(id);
      if (ch && me && !greetings.canSpeak(ch, guild)) {
        warns.push('Bot thiếu quyền gửi/nhúng link ở kênh ' + label + '.');
      }
    }
  } catch (_) {
    /* bỏ qua */
  }
  if (warns.length) {
    e.addFields({ name: '\u26a0\ufe0f Cần lưu ý', value: warns.map((w) => '\u2022 ' + w).join('\n').slice(0, 1000), inline: false });
  }

  e.setFooter({ text: (ctx.author.tag || ctx.author.username || '') + ' \u2022 Bảng tự khoá sau 3 phút' });
  e.setTimestamp(new Date());
  return e;
}

function panelRows(ctx, disabled) {
  const s = welcomeStore.resolve(ctx.guild.id, ctx.client.config);
  const off = Boolean(disabled);

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('wc:welcome')
      .setLabel(s.welcomeEnabled ? 'Tắt chào mừng' : 'Bật chào mừng')
      .setEmoji('\u2728')
      .setStyle(s.welcomeEnabled ? ButtonStyle.Danger : ButtonStyle.Success)
      .setDisabled(off),
    new ButtonBuilder()
      .setCustomId('wc:goodbye')
      .setLabel(s.goodbyeEnabled ? 'Tắt tạm biệt' : 'Bật tạm biệt')
      .setEmoji('\ud83d\udc4b')
      .setStyle(s.goodbyeEnabled ? ButtonStyle.Danger : ButtonStyle.Success)
      .setDisabled(off),
    new ButtonBuilder()
      .setCustomId('wc:invite')
      .setLabel(s.inviteTracking ? 'Tắt đếm mời' : 'Bật đếm mời')
      .setEmoji('\ud83d\udc8c')
      .setStyle(s.inviteTracking ? ButtonStyle.Danger : ButtonStyle.Success)
      .setDisabled(off),
    new ButtonBuilder()
      .setCustomId('wc:test')
      .setLabel('Xem thử')
      .setEmoji('\ud83d\udc41\ufe0f')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(off),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('wc:refresh').setLabel('Làm mới').setEmoji('\ud83d\udd04').setStyle(ButtonStyle.Secondary).setDisabled(off),
    new ButtonBuilder().setCustomId('wc:reset').setLabel('Về mặc định (.env)').setEmoji('\u267b\ufe0f').setStyle(ButtonStyle.Secondary).setDisabled(off),
    new ButtonBuilder().setCustomId('wc:close').setLabel('Đóng').setEmoji('\u2716\ufe0f').setStyle(ButtonStyle.Secondary).setDisabled(off),
  );

  const textish = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

  const row3 = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId('wc:wchan')
      .setPlaceholder('\u2728 Chọn kênh gửi lời chào mừng')
      .addChannelTypes(textish)
      .setMinValues(1)
      .setMaxValues(1)
      .setDisabled(off),
  );

  const row4 = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId('wc:gchan')
      .setPlaceholder('\ud83d\udc4b Chọn kênh gửi lời tạm biệt')
      .addChannelTypes(textish)
      .setMinValues(1)
      .setMaxValues(1)
      .setDisabled(off),
  );

  return [row1, row2, row3, row4];
}

// Embed xem thử: dùng chính người gọi lệnh làm "thành viên mẫu".
function previewEmbeds(ctx) {
  const member = ctx.member;
  const stats = inviteStore.getStats(ctx.guild.id, ctx.author.id);
  const fakeInvite = { inviterId: ctx.author.id, total: stats.total, code: 'xem-thu' };
  return [greetings.welcomeEmbed(member, fakeInvite), greetings.goodbyeEmbed(member, { inviterId: ctx.author.id, total: stats.total })];
}

module.exports = {
  name: 'welcome',
  aliases: ['chaomung', 'chao-mung', 'wc', 'greet', 'goodbye', 'tambiet', 'tam-biet'],
  category: 'moderation',
  description: 'Bật/tắt lời chào mừng & tạm biệt thành viên (chỉ quản trị viên)',
  usage: '[on|off|welcomeon|welcomeoff|goodbyeon|goodbyeoff|inviteon|inviteoff|test|reset] [#kênh]',
  cooldown: 3,
  guildOnly: true,
  permissions: ['Administrator'],
  slash: true,
  options: [
    {
      name: 'hành_động',
      type: 'string',
      description: 'Bật/tắt chào mừng, tạm biệt, đếm lượt mời hoặc xem bảng điều khiển',
      required: false,
      choices: [
        { name: 'Xem bảng điều khiển', value: 'panel' },
        { name: 'Bật cả chào mừng + tạm biệt', value: 'on' },
        { name: 'Tắt cả chào mừng + tạm biệt', value: 'off' },
        { name: 'Bật chào mừng', value: 'welcomeon' },
        { name: 'Tắt chào mừng', value: 'welcomeoff' },
        { name: 'Bật tạm biệt', value: 'goodbyeon' },
        { name: 'Tắt tạm biệt', value: 'goodbyeoff' },
        { name: 'Bật đếm lượt mời', value: 'inviteon' },
        { name: 'Tắt đếm lượt mời', value: 'inviteoff' },
        { name: 'Xem thử embed', value: 'test' },
        { name: 'Khôi phục mặc định (.env)', value: 'reset' },
      ],
    },
    {
      name: 'kênh_chào_mừng',
      type: 'channel',
      description: 'Kênh gửi lời chào mừng',
      required: false,
      channelTypes: 'text',
    },
    {
      name: 'kênh_tạm_biệt',
      type: 'channel',
      description: 'Kênh gửi lời tạm biệt',
      required: false,
      channelTypes: 'text',
    },
  ],

  async run(ctx) {
    const client = ctx.client;
    const guild = ctx.guild;
    if (!guild) {
      return ctx.reply({ embeds: [Embed.error('Không dùng được', 'Lệnh này chỉ dùng trong máy chủ.')] });
    }

    const action = resolveAction(ctx.getString('hành_động'));
    if (!action) {
      const p = client.config.prefix || '!';
      return ctx.reply({
        embeds: [
          Embed.error(
            'Hành động không hợp lệ',
            'Chọn một trong: `on`, `off`, `welcomeon`, `welcomeoff`, `goodbyeon`, `goodbyeoff`, `inviteon`, `inviteoff`, `test`, `reset`.\n' +
              'Ví dụ: `' + p + 'welcome on` \u2022 `' + p + 'welcome test` \u2022 `' + p + 'welcome` để mở bảng điều khiển.',
          ),
        ],
      });
    }

    let notice = '';

    // --- Đặt kênh qua tham số (nếu có) ---
    const wChan = await ctx.getChannelAsync('kênh_chào_mừng').catch(() => null);
    const gChan = await ctx.getChannelAsync('kênh_tạm_biệt').catch(() => null);
    if (wChan) {
      welcomeStore.setWelcomeChannel(guild.id, wChan.id);
      notice += emoji.success + ' Kênh chào mừng \u2192 <#' + wChan.id + '>\n';
    }
    if (gChan) {
      welcomeStore.setGoodbyeChannel(guild.id, gChan.id);
      notice += emoji.success + ' Kênh tạm biệt \u2192 <#' + gChan.id + '>\n';
    }

    // --- Xem thử ---
    if (action === 'test') {
      return ctx.reply({
        content: '\ud83d\udc41\ufe0f **Xem thử** \u2014 đây là hai embed bot sẽ gửi:',
        embeds: previewEmbeds(ctx),
      });
    }

    // --- Các thao tác bật/tắt ---
    if (action === 'on') {
      welcomeStore.setBoth(guild.id, true);
      notice += emoji.success + ' Đã **bật** cả lời chào mừng và lời tạm biệt.';
    } else if (action === 'off') {
      welcomeStore.setBoth(guild.id, false);
      notice += emoji.success + ' Đã **tắt** cả lời chào mừng và lời tạm biệt.';
    } else if (action === 'welcomeon') {
      welcomeStore.setWelcomeEnabled(guild.id, true);
      notice += emoji.success + ' Đã **bật** lời chào mừng.';
    } else if (action === 'welcomeoff') {
      welcomeStore.setWelcomeEnabled(guild.id, false);
      notice += emoji.success + ' Đã **tắt** lời chào mừng.';
    } else if (action === 'goodbyeon') {
      welcomeStore.setGoodbyeEnabled(guild.id, true);
      notice += emoji.success + ' Đã **bật** lời tạm biệt.';
    } else if (action === 'goodbyeoff') {
      welcomeStore.setGoodbyeEnabled(guild.id, false);
      notice += emoji.success + ' Đã **tắt** lời tạm biệt.';
    } else if (action === 'inviteon') {
      welcomeStore.setInviteTracking(guild.id, true);
      await inviteStore.primeGuild(guild).catch(() => 0);
      notice += emoji.success + ' Đã **bật** đếm lượt mời.';
    } else if (action === 'inviteoff') {
      welcomeStore.setInviteTracking(guild.id, false);
      notice += emoji.success + ' Đã **tắt** đếm lượt mời.';
    } else if (action === 'reset') {
      welcomeStore.reset(guild.id);
      notice += emoji.success + ' Đã khôi phục toàn bộ cài đặt về mặc định trong `.env`.';
    }

    // --- Hiển thị bảng điều khiển ---
    const msg = await ctx.reply({
      embeds: [renderPanel(ctx, notice.trim())],
      components: panelRows(ctx, false),
    });
    if (!msg || typeof msg.createMessageComponentCollector !== 'function') return;

    const collector = msg.createMessageComponentCollector({ time: PANEL_TIME });
    let ended = false;

    const lock = () => {
      if (ended) return;
      ended = true;
      Promise.resolve()
        .then(() => msg.edit({ components: panelRows(ctx, true) }))
        .catch(() => {});
    };

    collector.on('collect', async (i) => {
      try {
        if (!i.customId || i.customId.indexOf('wc:') !== 0) return;
        if (i.user.id !== ctx.author.id) {
          return i
            .reply({ content: emoji.error + ' Bảng này chỉ dành cho người đã mở nó!', flags: MessageFlags.Ephemeral })
            .catch(() => {});
        }
        // Chặn ngay nếu quyền quản trị bị gỡ giữa chừng.
        if (!i.memberPermissions || !i.memberPermissions.has('Administrator')) {
          return i
            .reply({ content: emoji.error + ' Bạn cần quyền **Quản trị viên** để đổi cài đặt này.', flags: MessageFlags.Ephemeral })
            .catch(() => {});
        }
        if (ended) return i.deferUpdate().catch(() => {});

        let note = '';
        const cur = welcomeStore.resolve(guild.id, client.config);

        if (i.customId === 'wc:test') {
          return i.reply({ embeds: previewEmbeds(ctx), flags: MessageFlags.Ephemeral }).catch(() => {});
        }

        if (i.customId === 'wc:close') {
          ended = true;
          await i.update({ embeds: [renderPanel(ctx)], components: panelRows(ctx, true) }).catch(() => {});
          collector.stop('closed');
          return;
        }

        if (i.customId === 'wc:welcome') {
          welcomeStore.setWelcomeEnabled(guild.id, !cur.welcomeEnabled);
          note = cur.welcomeEnabled ? emoji.warning + ' Đã tắt lời chào mừng.' : emoji.success + ' Đã bật lời chào mừng.';
        } else if (i.customId === 'wc:goodbye') {
          welcomeStore.setGoodbyeEnabled(guild.id, !cur.goodbyeEnabled);
          note = cur.goodbyeEnabled ? emoji.warning + ' Đã tắt lời tạm biệt.' : emoji.success + ' Đã bật lời tạm biệt.';
        } else if (i.customId === 'wc:invite') {
          welcomeStore.setInviteTracking(guild.id, !cur.inviteTracking);
          if (!cur.inviteTracking) await inviteStore.primeGuild(guild).catch(() => 0);
          note = cur.inviteTracking ? emoji.warning + ' Đã tắt đếm lượt mời.' : emoji.success + ' Đã bật đếm lượt mời.';
        } else if (i.customId === 'wc:reset') {
          welcomeStore.reset(guild.id);
          note = emoji.success + ' Đã khôi phục cài đặt về mặc định trong `.env`.';
        } else if (i.customId === 'wc:wchan') {
          const id = Array.isArray(i.values) ? i.values[0] : '';
          welcomeStore.setWelcomeChannel(guild.id, id);
          note = emoji.success + ' Kênh chào mừng \u2192 <#' + id + '>';
        } else if (i.customId === 'wc:gchan') {
          const id = Array.isArray(i.values) ? i.values[0] : '';
          welcomeStore.setGoodbyeChannel(guild.id, id);
          note = emoji.success + ' Kênh tạm biệt \u2192 <#' + id + '>';
        } else if (i.customId === 'wc:refresh') {
          note = '\ud83d\udd04 Đã làm mới.';
        }

        await i.update({ embeds: [renderPanel(ctx, note)], components: panelRows(ctx, false) }).catch(() => {});
      } catch (err) {
        client.logger?.error?.('Lỗi bảng chào mừng: ' + (err && err.message ? err.message : err));
        i.deferUpdate?.().catch(() => {});
      }
    });

    collector.on('end', () => lock());
  },
};
