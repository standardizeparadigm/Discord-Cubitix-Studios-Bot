// =============================================================
//  CommandContext - lớp hợp nhất cho cả lệnh prefix và slash
//  Nhờ lớp này, mỗi lệnh chỉ cần viết 1 hàm run(ctx) duy nhất.
// =============================================================
const { MessageFlags } = require('discord.js');
const chan = require('./channelResolver');

// =============================================================
//  Bộ thu thập dự phòng.
//  Dùng khi không lấy được đối tượng Message thật. Bản cũ trả về
//  { on() {}, stop() {} } nên sự kiện 'end' KHÔNG BAO GIỜ chạy: các ván
//  casino sẽ bị "treo" vĩnh viễn sau khi đã trừ tiền cược (mất xu, không
//  bao giờ hoàn / kết toán). Bản này phát đúng sự kiện 'end' khi hết giờ
//  hoặc khi stop() được gọi, giống hành vi của discord.js.
// =============================================================
class FallbackCollector {
  constructor(options = {}) {
    this._handlers = new Map();
    this.ended = false;
    this.collected = new Map();
    const time = Number(options && options.time);
    this._timer = Number.isFinite(time) && time > 0 ? setTimeout(() => this.stop('time'), time) : null;
    // Không giữ tiến trình Node sống chỉ vì bộ đếm giờ này.
    if (this._timer && typeof this._timer.unref === 'function') this._timer.unref();
  }

  on(event, handler) {
    if (typeof handler === 'function') {
      if (!this._handlers.has(event)) this._handlers.set(event, []);
      this._handlers.get(event).push(handler);
    }
    return this;
  }

  once(event, handler) { return this.on(event, handler); }
  off(event) { this._handlers.delete(event); return this; }
  removeAllListeners() { this._handlers.clear(); return this; }
  resetTimer() { return this; }

  stop(reason = 'user') {
    if (this.ended) return;
    this.ended = true;
    if (this._timer) clearTimeout(this._timer);
    for (const handler of this._handlers.get('end') || []) {
      // Một handler lỗi không được làm sập bot chạy 24/7.
      try {
        const out = handler(this.collected, reason);
        if (out && typeof out.catch === 'function') out.catch(() => {});
      } catch { /* bỏ qua */ }
    }
  }
}

class CommandContext {
  constructor(client, { message = null, interaction = null, command = null, args = [] }) {
    this.client = client;
    this.message = message;
    this.interaction = interaction;
    this.command = command;
    this.args = args;
    this.isSlash = Boolean(interaction);
  }

  get author() {
    return this.isSlash ? this.interaction.user : this.message.author;
  }
  get user() {
    return this.author;
  }
  get member() {
    return this.isSlash ? this.interaction.member : this.message.member;
  }
  get guild() {
    return this.isSlash ? this.interaction.guild : this.message.guild;
  }
  get channel() {
    return this.isSlash ? this.interaction.channel : this.message.channel;
  }

  // Trả về chỉ số của option theo tên (dựa vào command.options)
  _optionIndex(name) {
    if (!this.command || !this.command.options) return -1;
    return this.command.options.findIndex((o) => o.name.toLowerCase() === String(name).toLowerCase());
  }

  // Vị trí của option kiểu "user" trong số các option kiểu user
  // (để ánh xạ đúng mention thứ mấy ở chế độ prefix).
  _userOptionPosition(name) {
    if (!this.command || !this.command.options) return -1;
    const userOpts = this.command.options.filter((o) => o.type === 'user');
    return userOpts.findIndex((o) => o.name.toLowerCase() === String(name).toLowerCase());
  }

  // Danh sách user được nhắc đến (đã loại bỏ chính bot)
  _mentionedUsers() {
    if (!this.message) return [];
    const botId = this.client.user?.id;
    return [...this.message.mentions.users.values()].filter((u) => u.id !== botId);
  }

  _mentionedMembers() {
    if (!this.message || !this.message.mentions.members) return [];
    const botId = this.client.user?.id;
    return [...this.message.mentions.members.values()].filter((m) => m.id !== botId);
  }

  // Lấy chuỗi. Nếu option có rest=true thì gộp hết các từ còn lại (chế độ prefix).
  getString(name) {
    if (this.isSlash) return this.interaction.options.getString(name) ?? null;
    const idx = this._optionIndex(name);
    if (idx === -1) return this.args.join(' ') || null;
    const opt = this.command.options[idx];
    if (opt.rest) return this.args.slice(idx).join(' ') || null;
    return this.args[idx] ?? null;
  }

  getInteger(name) {
    if (this.isSlash) return this.interaction.options.getInteger(name);
    const v = parseInt(this.getString(name), 10);
    return Number.isNaN(v) ? null : v;
  }

  getNumber(name) {
    if (this.isSlash) return this.interaction.options.getNumber(name);
    const v = parseFloat(this.getString(name));
    return Number.isNaN(v) ? null : v;
  }

  getBoolean(name) {
    if (this.isSlash) return this.interaction.options.getBoolean(name);
    const v = (this.getString(name) || '').toLowerCase();
    return ['true', 'yes', 'co', 'có', 'on', '1'].includes(v);
  }

  getUser(name) {
    if (this.isSlash) return this.interaction.options.getUser(name) ?? null;
    // Chế độ prefix: ánh xạ option user thứ N tới mention thứ N
    const users = this._mentionedUsers();
    const pos = this._userOptionPosition(name);
    if (pos !== -1 && users[pos]) return users[pos];
    // Dự phòng: thử theo ID trong tham số (chấp nhận cả <@id> và <@!id>)
    const raw = this._rawId(this._positionalString(name));
    if (raw) return this.client.users.cache.get(raw) || null;
    return pos <= 0 ? users[0] || null : null;
  }

  async getMember(name) {
    if (this.isSlash) return this.interaction.options.getMember(name);
    const members = this._mentionedMembers();
    const pos = this._userOptionPosition(name);
    if (pos !== -1 && members[pos]) return members[pos];
    const raw = this._rawId(this._positionalString(name));
    if (raw && this.guild) {
      return this.guild.members.fetch(raw).catch(() => null);
    }
    return pos <= 0 ? members[0] || null : null;
  }

  // Bóc lớp vỏ của một lần nhắc (<@id>, <@!id>, <@&id>) và trả về ID thuần.
  _rawId(value) {
    const t = String(value == null ? '' : value).trim().replace(/^<@[!&]?/, '').replace(/>$/, '');
    return /^\d{15,25}$/.test(t) ? t : null;
  }

  // Vị trí của option kiểu "channel" trong số các option kiểu channel
  _channelOptionPosition(name) {
    if (!this.command || !this.command.options) return -1;
    const opts = this.command.options.filter((o) => o.type === 'channel' || o.channelPicker);
    return opts.findIndex((o) => o.name.toLowerCase() === String(name).toLowerCase());
  }

  // Kiểu option ĐÃ KHAI BÁO trong lệnh ('channel', 'string', 'user'…).
  _declaredOptionType(name) {
    const idx = this._optionIndex(name);
    if (idx === -1) return null;
    return this.command.options[idx].type || 'string';
  }

  // Bộ lọc loại kênh khai báo kèm option (channelFilter), nếu có.
  _channelFilter(name) {
    const idx = this._optionIndex(name);
    if (idx === -1) return null;
    return this.command.options[idx].channelFilter || null;
  }

  // Đọc giá trị THÔ của một option slash mà KHÔNG quan tâm kiểu.
  // Dùng options.get() nên không bao giờ ném lỗi "Option is of type: 3; expected 7".
  _rawSlashValue(name) {
    if (!this.isSlash) return null;
    try {
      const opt = this.interaction.options.get(name, false);
      if (!opt) return null;
      if (opt.channel && opt.channel.id) return String(opt.channel.id);
      if (opt.value == null) return null;
      return String(opt.value);
    } catch {
      return null;
    }
  }

  // Chế độ prefix: lệnh tự tách tham số (manualPrefixParse) thì KHÔNG đoán theo vị trí.
  _positionalString(name) {
    if (this.command && this.command.manualPrefixParse) return null;
    return this.getString(name);
  }

  // Lấy kênh (bản đồng bộ, chỉ dùng cache). Nên dùng getChannelAsync để luôn
  // thấy cả kênh vừa mới tạo.
  getChannel(name) {
    if (this.isSlash) {
      // CHỈ hỏi Discord theo kiểu "channel" khi option thật sự được khai báo là channel.
      // Ô chọn kênh bằng gợi ý (channelPicker) là kiểu string -> gọi getChannel() sẽ ném lỗi.
      if (this._declaredOptionType(name) === 'channel') {
        try {
          const direct = this.interaction.options.getChannel(name);
          if (direct) return direct;
        } catch {
          // Kiểu không khớp -> đọc dạng chuỗi ở dưới.
        }
      }
      const raw = this._rawSlashValue(name);
      if (raw) return chan.resolveChannelSync(this.guild, raw, { types: this._channelFilter(name) });
      return null;
    }
    // Chế độ prefix: ưu tiên #nhắc-kênh theo đúng thứ tự, sau đó tới ID / tên kênh.
    const mentioned = this.message && this.message.mentions && this.message.mentions.channels
      ? [...this.message.mentions.channels.values()]
      : [];
    const pos = this._channelOptionPosition(name);
    if (pos !== -1 && mentioned[pos]) return mentioned[pos];
    const raw = this._positionalString(name);
    if (raw) {
      const found = chan.resolveChannelSync(this.guild, raw, { types: this._channelFilter(name) });
      if (found) return found;
    }
    return pos <= 0 ? mentioned[0] || null : null;
  }

  // Lấy kênh có LÀM MỚI danh sách từ Discord -> kênh vừa tạo cũng dùng được ngay.
  async getChannelAsync(name, opts = {}) {
    const quick = this.getChannel(name);
    if (quick) return quick;
    const raw = this.isSlash ? this._rawSlashValue(name) : this._positionalString(name);
    if (!raw) return null;
    const types = opts.types || this._channelFilter(name) || null;
    return chan.resolveChannel(this.guild, raw, { ...opts, types });
  }

  // Vị trí của option kiểu "role" trong số các option kiểu role
  _roleOptionPosition(name) {
    if (!this.command || !this.command.options) return -1;
    const opts = this.command.options.filter((o) => o.type === 'role');
    return opts.findIndex((o) => o.name.toLowerCase() === String(name).toLowerCase());
  }

  getRole(name) {
    if (this.isSlash) return this.interaction.options.getRole(name) ?? null;
    if (!this.message || !this.message.mentions || !this.message.mentions.roles) return null;
    const roles = [...this.message.mentions.roles.values()];
    const pos = this._roleOptionPosition(name);
    if (pos !== -1 && roles[pos]) return roles[pos];
    const raw = this._rawId(this._positionalString(name));
    if (raw && this.guild) {
      const byId = this.guild.roles.cache.get(raw);
      if (byId) return byId;
    }
    return pos <= 0 ? roles[0] || null : null;
  }

  // Báo "đang xử lý" (chỉ có tác dụng ở slash)
  async defer(ephemeral = false) {
    if (this.isSlash && !this.interaction.deferred && !this.interaction.replied) {
      await this.interaction.deferReply(ephemeral ? { flags: MessageFlags.Ephemeral } : {});
    }
  }

  // Trả lời và LUÔN trả về đối tượng Message (để có thể .edit làm animation)
  async reply(payload) {
    if (this.isSlash) {
      if (this.interaction.deferred || this.interaction.replied) {
        return this.interaction.editReply(payload);
      }
      const res = await this.interaction.reply(payload);
      // discord.js v14.16+: reply() trả về InteractionCallbackResponse có .fetch()
      if (res && typeof res.fetch === 'function') {
        const fetched = await res.fetch().catch(() => null);
        if (fetched) return fetched;
      }
      if (res && typeof res.edit === 'function') return res;
      const fetched = await this.interaction.fetchReply().catch(() => null);
      return fetched || this._replyFallback();
    }
    // Nếu tin nhắn lệnh đã bị xoá (ví dụ do lệnh say/embed/clear) thì .reply() sẽ lỗi.
    // Khi đó gửi thẳng vào kênh thay vì để lệnh báo lỗi.
    try {
      return await this.message.reply(payload);
    } catch {
      return this.channel.send(payload);
    }
  }

  // Đối tượng thay thế khi không lấy được Message thật, để các lệnh gọi
  // .edit()/.delete() không bị lỗi "Cannot read properties of undefined".
  _replyFallback() {
    const it = this.interaction;
    return {
      __fallback: true,
      // Không bao giờ ném lỗi: tránh "unhandled rejection" làm chết tiến trình.
      edit: (p) => Promise.resolve()
        .then(() => (it ? it.editReply(p) : null))
        .catch(() => null),
      delete: () => Promise.resolve()
        .then(() => (it ? it.deleteReply() : null))
        .catch(() => null),
      react: () => Promise.resolve(null),
      createMessageComponentCollector: (options = {}) => new FallbackCollector(options),
    };
  }

  // Gửi tin nhắn mới vào kênh
  async send(payload) {
    return this.channel.send(payload);
  }
}

module.exports = CommandContext;
