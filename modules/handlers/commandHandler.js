// =============================================================
//  commandHandler - FILE COMMAND RIÊNG
//  Tự động quét thư mục modules/commands và nạp TẤT CẢ lệnh
// =============================================================
const fs = require('fs');
const path = require('path');
const buildSlash = require('../core/slashBuilder');
const Embed = require('../core/EmbedFactory');

function walk(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results = results.concat(walk(full));
    else if (entry.name.endsWith('.js')) results.push(full);
  }
  return results;
}

module.exports = async function loadCommands(client) {
  // Khởi tạo embed factory theo cấu hình
  Embed.init(client.config);

  // Nap lai tu dau: xoa sach du lieu cu de lenh `reload` khong tao ban trung.
  client.commands.clear?.();
  client.aliases.clear?.();
  client.slashData.length = 0;

  const commandsPath = path.join(__dirname, '..', 'commands');
  const files = walk(commandsPath);
  let loaded = 0;
  const categories = new Set();
  const slashNames = new Set();

  for (const file of files) {
    let command;
    try {
      command = require(file);
    } catch (err) {
      client.logger.error(`Không nạp được file ${path.basename(file)}: ${err.message}`);
      continue;
    }

    if (!command || !command.name || typeof command.run !== 'function') {
      client.logger.warn(`Bỏ qua ${path.basename(file)} (thiếu 'name' hoặc hàm 'run').`);
      continue;
    }

    // Gán category theo tên thư mục cha nếu chưa khai báo
    command.name = String(command.name).toLowerCase();
    if (client.commands.has(command.name)) {
      client.logger.warn(`Bo qua ${path.basename(file)}: trung ten lenh "${command.name}".`);
      continue;
    }

    command.category = command.category || path.basename(path.dirname(file));
    categories.add(command.category);

    command.__file = file; // lưu đường dẫn tệp để lệnh reload dùng lại
    client.commands.set(command.name, command);
    (command.aliases || []).forEach((a) => {
      const alias = String(a).toLowerCase();
      if (client.commands.has(alias) || client.aliases.has(alias)) {
        client.logger.warn(`Alias "${alias}" cua lenh "${command.name}" bi trung - da bo qua.`);
        return;
      }
      client.aliases.set(alias, command.name);
    });

    if (command.slash !== false) {
      try {
        const json = buildSlash(command).toJSON();
        if (slashNames.has(json.name)) {
          client.logger.warn(`Bo qua slash trung ten "${json.name}".`);
        } else {
          slashNames.add(json.name);
          client.slashData.push(json);
        }
      } catch (err) {
        client.logger.warn(`Khong tao duoc slash cho ${command.name}: ${err.message}`);
      }
    }
    loaded++;
  }

  client.categories = [...categories];
  client.logger.success(`Đã nạp ${loaded} lệnh thuộc ${categories.size} nhóm: ${[...categories].join(', ')}`);
};
