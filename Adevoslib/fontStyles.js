'use strict';

const FONT_STYLES = {
  none: { name: 'Default', description: 'Normal text, no style', preview: 'Hello World', convert: (t) => t },
  bold: { name: 'Bold', description: 'WhatsApp *bold* wrap', preview: '*Hello World*', convert: (t) => t },
  italic: { name: 'Italic', description: 'WhatsApp _italic_ wrap', preview: '_Hello World_', convert: (t) => t },
  strikethrough: { name: 'Strikethrough', description: 'Slashed through text', preview: '~Hello World~', convert: (t) => t },
  mono: { name: 'Monospace', description: 'Code/mono style', preview: '```Hello World```', convert: (t) => t },
  serif_bold: {
    name: 'Serif Bold', description: 'Bold serif unicode', preview: '𝐇𝐞𝐥𝐥𝐨 𝐖𝐨𝐫𝐥𝐝',
    map: { upper: 0x1D400 - 65, lower: 0x1D41A - 97, digits: 0x1D7CE - 48 }
  },
  serif_italic: {
    name: 'Serif Italic', description: 'Italic serif unicode', preview: '𝐻𝑒𝑙𝑙𝑜 𝑊𝑜𝑟𝑙𝑑',
    map: { upper: 0x1D434 - 65, lower: 0x1D44E - 97 },
    special_lower: { h: '\u{1D489}' }
  },
  serif_bold_italic: {
    name: 'Serif Bold Italic', description: 'Bold italic serif', preview: '𝑯𝒆𝒍𝒍𝒐 𝑾𝒐𝒓𝒍𝒅',
    map: { upper: 0x1D468 - 65, lower: 0x1D482 - 97 }
  },
  script: {
    name: 'Script', description: 'Cursive/handwriting style', preview: '𝒽𝑒𝓁𝓁𝑜 𝒲𝑜𝓇𝓁𝒹',
    map: { upper: 0x1D49C - 65, lower: 0x1D4B6 - 97 },
    special_upper: { B: '\u212C', E: '\u2130', F: '\u2131', H: '\u210B', I: '\u2110', L: '\u2112', M: '\u2133', R: '\u211B' },
    special_lower: { e: '\u212F', g: '\u210A', o: '\u2134' }
  },
  bold_script: {
    name: 'Bold Script', description: 'Bold cursive style', preview: '𝓗𝓮𝓵𝓵𝓸 𝓦𝓸𝓻𝓵𝓭',
    map: { upper: 0x1D4D0 - 65, lower: 0x1D4EA - 97 }
  },
  fraktur: {
    name: 'Fraktur', description: 'Gothic/old German', preview: '𝔥𝔢𝔩𝔩𝔬 𝔚𝔬𝔯𝔩𝔡',
    map: { upper: 0x1D504 - 65, lower: 0x1D51E - 97 },
    special_upper: { C: '\u212D', H: '\u210C', I: '\u2111', R: '\u211C', Z: '\u2128' }
  },
  double_struck: {
    name: 'Double Struck', description: 'Hollow/mathematical letters', preview: '𝕙𝕖𝕝𝕝𝕠 𝕎𝕠𝕣𝕝𝕕',
    map: { upper: 0x1D538 - 65, lower: 0x1D552 - 97, digits: 0x1D7D8 - 48 },
    special_upper: { C: '\u2102', H: '\u210D', N: '\u2115', P: '\u2119', Q: '\u211A', R: '\u211D', Z: '\u2124' }
  },
  sans: {
    name: 'Sans Serif', description: 'Clean sans-serif', preview: '𝖧𝖾𝗅𝗅𝗈 𝖶𝗈𝗋𝗅𝖽',
    map: { upper: 0x1D5A0 - 65, lower: 0x1D5BA - 97, digits: 0x1D7E2 - 48 }
  },
  sans_bold: {
    name: 'Sans Bold', description: 'Bold sans-serif', preview: '𝗛𝗲𝗹𝗹𝗼 𝗪𝗼𝗿𝗹𝗱',
    map: { upper: 0x1D5D4 - 65, lower: 0x1D5EE - 97, digits: 0x1D7EC - 48 }
  },
  sans_italic: {
    name: 'Sans Italic', description: 'Italic sans-serif', preview: '𝘏𝘦𝘭𝘭𝘰 𝘞𝘰𝘳𝘭𝘥',
    map: { upper: 0x1D608 - 65, lower: 0x1D622 - 97 }
  },
  sans_bold_italic: {
    name: 'Sans Bold Italic', description: 'Bold italic sans-serif', preview: '𝙃𝙚𝙡𝙡𝙤 𝙒𝙤𝙧𝙡𝙙',
    map: { upper: 0x1D63C - 65, lower: 0x1D656 - 97 }
  },
  circled: {
    name: 'Circled', description: 'Letters in circles', preview: 'ⒽⒺⓁⓁⓄ ⓦⓞⓡⓛⓓ',
    special_upper_map: {
      A:'\u24B6',B:'\u24B7',C:'\u24B8',D:'\u24B9',E:'\u24BA',F:'\u24BB',G:'\u24BC',H:'\u24BD',I:'\u24BE',J:'\u24BF',
      K:'\u24C0',L:'\u24C1',M:'\u24C2',N:'\u24C3',O:'\u24C4',P:'\u24C5',Q:'\u24C6',R:'\u24C7',S:'\u24C8',T:'\u24C9',
      U:'\u24CA',V:'\u24CB',W:'\u24CC',X:'\u24CD',Y:'\u24CE',Z:'\u24CF'
    },
    special_lower_map: {
      a:'\u24D0',b:'\u24D1',c:'\u24D2',d:'\u24D3',e:'\u24D4',f:'\u24D5',g:'\u24D6',h:'\u24D7',i:'\u24D8',j:'\u24D9',
      k:'\u24DA',l:'\u24DB',m:'\u24DC',n:'\u24DD',o:'\u24DE',p:'\u24DF',q:'\u24E0',r:'\u24E1',s:'\u24E2',t:'\u24E3',
      u:'\u24E4',v:'\u24E5',w:'\u24E6',x:'\u24E7',y:'\u24E8',z:'\u24E9'
    }
  }
};

const WA_WRAPPERS = {
  bold: { prefix: '*', suffix: '*' },
  italic: { prefix: '_', suffix: '_' },
  strikethrough: { prefix: '~', suffix: '~' },
  mono: { prefix: '```', suffix: '```' }
};

function convertChar(char, style) {
  if (!style.map) return char;
  const code = char.codePointAt(0);
  const isUpper = code >= 65 && code <= 90;
  const isLower = code >= 97 && code <= 122;
  const isDigit = code >= 48 && code <= 57;

  if (style.special_upper && isUpper && style.special_upper[char]) return style.special_upper[char];
  if (style.special_lower && isLower && style.special_lower[char]) return style.special_lower[char];

  if (isUpper && style.map.upper !== undefined) return String.fromCodePoint(code + style.map.upper);
  if (isLower && style.map.lower !== undefined) return String.fromCodePoint(code + style.map.lower);
  if (isDigit && style.map.digits !== undefined) return String.fromCodePoint(code + style.map.digits);
  return char;
}

function applyUnicodeFont(text, styleName) {
  const style = FONT_STYLES[styleName];
  if (!style) return text;
  if (style.special_upper_map || style.special_lower_map) {
    return [...text].map(ch => {
      if (style.special_upper_map && style.special_upper_map[ch]) return style.special_upper_map[ch];
      if (style.special_lower_map && style.special_lower_map[ch]) return style.special_lower_map[ch];
      return ch;
    }).join('');
  }
  if (!style.map) return text;
  return [...text].map(char => convertChar(char, style)).join('');
}

function applyWAWrapper(text, styleName) {
  const wrapper = WA_WRAPPERS[styleName];
  if (!wrapper) return text;
  const lines = text.split('\n');
  return lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    if (trimmed.startsWith(wrapper.prefix) && trimmed.endsWith(wrapper.suffix)) return line;
    const leading = line.match(/^(\s*)/)?.[1] || '';
    return `${leading}${wrapper.prefix}${trimmed}${wrapper.suffix}`;
  }).join('\n');
}

function applyBotFont(text, styleName) {
  if (!text || !styleName || styleName === 'none') return text;
  if (WA_WRAPPERS[styleName]) return applyWAWrapper(text, styleName);
  if (FONT_STYLES[styleName]?.map || FONT_STYLES[styleName]?.special_upper_map) return applyUnicodeFont(text, styleName);
  return text;
}

function getStyleList() {
  return Object.entries(FONT_STYLES).map(([key, val]) => ({
    key,
    name: val.name,
    description: val.description,
    preview: val.preview || applyBotFont('Hello World', key)
  }));
}

module.exports = { FONT_STYLES, applyBotFont, getStyleList };
