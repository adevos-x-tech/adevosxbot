const chalk = require('chalk');

const colors = [
  chalk.red, chalk.green, chalk.yellow, chalk.blue,
  chalk.magenta, chalk.cyan, chalk.white
];

function rainbow(text) {
  return text.split('').map((char, i) => colors[i % colors.length](char)).join('');
}

function pastel(text) {
  return text.split('').map((char, i) => {
    const c = i % 4;
    if (c === 0) return chalk.hex('#FFB3BA')(char);
    if (c === 1) return chalk.hex('#FFDFBA')(char);
    if (c === 2) return chalk.hex('#FFFFBA')(char);
    return chalk.hex('#BAFFC9')(char);
  }).join('');
}

module.exports = { rainbow, pastel };
