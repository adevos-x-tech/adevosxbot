'use strict';

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

const commandsPath = path.join(__dirname, '../commands');

global.commands = global.commands || new Map();
global.aliases = global.aliases || new Map();
global.fileCategories = global.fileCategories || {};
global.replyHandlers = global.replyHandlers || new Map();

function clearCommandRegistration(filePath) {
  global.commands.forEach((command, name) => {
    if (command?.filePath === filePath) global.commands.delete(name);
  });
  global.aliases.forEach((command, alias) => {
    if (command?.filePath === filePath) global.aliases.delete(alias);
  });
  for (const category of Object.keys(global.fileCategories)) {
    global.fileCategories[category] = global.fileCategories[category].filter(name => {
      const command = global.commands.get(name);
      return command?.filePath !== filePath;
    });
    if (!global.fileCategories[category].length) delete global.fileCategories[category];
  }
}

function categoryForFile(filePath) {
  const relative = path.relative(commandsPath, filePath);
  const parts = relative.split(path.sep);
  return (parts.length > 1 ? parts[0] : path.basename(filePath, '.js')).toLowerCase();
}

function registerCommands(commandsExport, filePath) {
  if (!Array.isArray(commandsExport)) commandsExport = [commandsExport];
  const defaultCategory = categoryForFile(filePath);

  for (const command of commandsExport) {
    if (!command || !command.name || typeof command.execute !== 'function') continue;
    command.filePath = filePath;
    command.category = String(command.category || defaultCategory).toLowerCase();
    global.commands.set(command.name, command);

    if (Array.isArray(command.aliases)) {
      for (const alias of command.aliases) {
        if (alias) global.aliases.set(alias, command);
      }
    }

    if (!global.fileCategories[command.category]) global.fileCategories[command.category] = [];
    if (!global.fileCategories[command.category].includes(command.name)) {
      global.fileCategories[command.category].push(command.name);
    }
  }
}

function loadCommandFile(filePath) {
  try {
    clearCommandRegistration(filePath);
    delete require.cache[require.resolve(filePath)];
    let commandsExport = require(filePath);
    if (commandsExport.default) commandsExport = commandsExport.default;
    registerCommands(commandsExport, filePath);
  } catch (err) {
    console.error(chalk.red(`Failed to load ${path.relative(commandsPath, filePath)}: ${err.message}`));
  }
}

function loadCommands() {
  global.fileCategories = {};

  function readDirRecursive(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith('_')) continue;
        readDirRecursive(entryPath);
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        loadCommandFile(entryPath);
      }
    }
  }

  readDirRecursive(commandsPath);

  for (const category in global.fileCategories) {
    global.fileCategories[category].sort();
  }

  fs.watch(commandsPath, { recursive: true }, (eventType, filename) => {
    if (!filename || !filename.endsWith('.js') || filename.split(path.sep).some(part => part.startsWith('_'))) return;
    const filePath = path.join(commandsPath, filename);
    if (fs.existsSync(filePath)) {
      console.log(chalk.yellowBright(`[Adevos X Bot] Reloading: ${filename}`));
      loadCommandFile(filePath);
    } else {
      clearCommandRegistration(filePath);
    }
  });

  const total = global.commands.size;
  console.log(chalk.greenBright(`[Adevos X Bot] Loaded ${total} commands from ${Object.keys(global.fileCategories).length} categories`));
}

module.exports = { loadCommands, registerCommands };
