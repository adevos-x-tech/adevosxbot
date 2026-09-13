const { runLock } = require('./groupLock');

module.exports = [
  {
    name: 'close',
    aliases: ['closegroup', 'lock', 'mute'],
    category: 'group',
    description: 'Restrict the group to admins only. Works in-group or with an id; supports a custom message and scheduling.',
    usage: '.close [message] | .close <id> [message] | .close <time> [message]',
    execute: async (sock, message, args, context) => runLock(sock, message, args, context, 'close'),
  },
  {
    name: 'closetime',
    category: 'group',
    description: 'Schedule the group to close after a duration',
    usage: '.closetime <10m|2h|1d> [message]',
    execute: async (sock, message, args, context) => runLock(sock, message, args, context, 'close'),
  }
];
