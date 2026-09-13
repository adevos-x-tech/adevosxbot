const { runLock } = require('./groupLock');

module.exports = [
  {
    name: 'open',
    aliases: ['opengroup', 'unlock', 'unmute'],
    category: 'group',
    description: 'Allow all members to send messages. Works in-group or with an id; supports a custom message and scheduling.',
    usage: '.open [message] | .open <id> [message] | .open <time> [message]',
    execute: async (sock, message, args, context) => runLock(sock, message, args, context, 'open'),
  },
  {
    name: 'opentime',
    category: 'group',
    description: 'Schedule the group to open after a duration',
    usage: '.opentime <10m|2h|1d> [message]',
    execute: async (sock, message, args, context) => runLock(sock, message, args, context, 'open'),
  }
];
