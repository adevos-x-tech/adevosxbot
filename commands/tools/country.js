'use strict';

const axios = require('axios');

module.exports = {
  name: 'country',
  aliases: ['countryinfo', 'nation', 'flag'],
  category: 'tools',
  description: 'Get information about a country',
  usage: '.country Kenya',
  execute: async (sock, message, args, context) => {
    const query = args.join(' ').trim();
    if (!query) return context.reply('Usage: .country Kenya');
    if (query.length > 80) return context.reply('Country name is too long.');
    try {
      const response = await axios.get(`https://restcountries.com/v3.1/name/${encodeURIComponent(query)}?fullText=true`, { timeout: 8000 });
      const country = response.data?.[0];
      if (!country) throw new Error('not found');
      const currencies = Object.values(country.currencies || {})
        .map(currency => `${currency.name || '?'} (${currency.symbol || '?'})`).join(', ') || '?';
      const languages = Object.values(country.languages || {}).join(', ') || '?';
      const capital = country.capital?.[0] || '?';
      return context.reply([
        `${country.flag || ''} *${country.name?.common || query}*`,
        `Official: ${country.name?.official || '?'}`,
        `Capital: ${capital}`,
        `Region: ${country.region || '?'}${country.subregion ? ` / ${country.subregion}` : ''}`,
        `Population: ${(country.population || 0).toLocaleString()}`,
        `Currency: ${currencies}`,
        `Languages: ${languages}`,
      ].join('\n'));
    } catch {
      return context.reply('Country not found or the information service is unavailable.');
    }
  },
};
