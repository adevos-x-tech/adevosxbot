'use strict';

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

async function TelegraPh(filePath) {
  if (!fs.existsSync(filePath)) throw new Error('File not found: ' + filePath);
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));
  const res = await axios({
    url: 'https://telegra.ph/upload',
    method: 'POST',
    headers: form.getHeaders(),
    data: form
  });
  return 'https://telegra.ph' + res.data[0].src;
}

module.exports = { TelegraPh };
