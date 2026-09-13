'use strict';

const axios = require('axios');

module.exports = {
  name: 'weather',
  aliases: ['forecast', 'temperature'],
  category: 'tools',
  description: 'Get current weather for a location',
  usage: '.weather Nairobi',
  execute: async (sock, message, args, context) => {
    const query = args.join(' ').trim();
    if (!query) return context.reply('Usage: .weather Nairobi');
    if (query.length > 80) return context.reply('Location name is too long.');
    try {
      const geo = await axios.get('https://geocoding-api.open-meteo.com/v1/search', {
        params: { name: query, count: 1, language: 'en', format: 'json' },
        timeout: 8000,
      });
      const place = geo.data?.results?.[0];
      if (!place) throw new Error('location not found');
      const forecast = await axios.get('https://api.open-meteo.com/v1/forecast', {
        params: {
          latitude: place.latitude,
          longitude: place.longitude,
          current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m',
          timezone: 'auto',
        },
        timeout: 8000,
      });
      const current = forecast.data?.current;
      if (!current) throw new Error('weather unavailable');
      return context.reply([
        `*Weather: ${place.name}, ${place.country || ''}*`,
        `Temperature: ${current.temperature_2m}${forecast.data.current_units?.temperature_2m || '°C'}`,
        `Feels like: ${current.apparent_temperature}${forecast.data.current_units?.apparent_temperature || '°C'}`,
        `Humidity: ${current.relative_humidity_2m}${forecast.data.current_units?.relative_humidity_2m || '%'}`,
        `Wind: ${current.wind_speed_10m}${forecast.data.current_units?.wind_speed_10m || ' km/h'}`,
        `Weather code: ${current.weather_code}`,
      ].join('\n'));
    } catch {
      return context.reply('Location not found or the weather service is unavailable.');
    }
  },
};
