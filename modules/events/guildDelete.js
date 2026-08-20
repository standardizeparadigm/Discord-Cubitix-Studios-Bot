// =============================================================
//  Su kien: guildDelete
//  Bot roi khoi mot may chu -> xoa bo nho dem cua may chu do.
//  Rat quan trong khi chay 24/7: tranh ro ri bo nho theo thoi gian.
// =============================================================
const chan = require('../core/channelResolver');

module.exports = {
  name: 'guildDelete',
  async execute(client, guild) {
    if (!guild) return;
    chan.forget(guild.id);
    client.logger?.warn?.(`Da roi khoi may chu: ${guild.name || guild.id}.`);
  },
};
