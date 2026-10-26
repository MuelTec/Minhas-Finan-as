// Gera ícones PNG para PWA (iOS apple-touch-icon + manifest Android/desktop)
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const BG = '#0F1226';
const design = `
  <defs>
    <linearGradient id="lineGrad" x1="6" y1="18" x2="26" y2="10" gradientUnits="userSpaceOnUse">
      <stop stop-color="#22E1D0"/>
      <stop offset="1" stop-color="#3F7FE8"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="32" height="32" fill="${BG}"/>
  <g opacity="0.85">
    <rect x="8" y="19" width="3.5" height="7" rx="1" fill="#22E1D0"/>
    <rect x="14" y="16" width="3.5" height="10" rx="1" fill="#3F7FE8"/>
    <rect x="20" y="13" width="3.5" height="13" rx="1" fill="#D56EF5"/>
  </g>
  <path d="M6 14L11 9L16 14L22 8L26 12" stroke="url(#lineGrad)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <circle cx="26" cy="12" r="2.2" fill="#D56EF5"/>
`;

// ratio = fração da tela ocupada pelo desenho (resto é margem/fundo)
const iconSvg = (px, ratio) => {
  const s = (px * ratio) / 32;
  const t = (px - 32 * s) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${px} ${px}">
    <g transform="translate(${t},${t}) scale(${s})">${design}</g>
  </svg>`;
};

const targets = [
  { file: 'webicons/apple-touch-icon.png', px: 180, ratio: 0.66 },
  { file: 'webicons/icon-192.png', px: 192, ratio: 0.66 },
  { file: 'webicons/icon-512.png', px: 512, ratio: 0.66 },
  { file: 'webicons/icon-maskable-512.png', px: 512, ratio: 0.56 } // zona segura do maskable
];

(async () => {
  fs.mkdirSync('webicons', { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage();
  for (const t of targets) {
    await page.setViewport({ width: t.px, height: t.px, deviceScaleFactor: 1 });
    await page.setContent(`<html><body style="margin:0">${iconSvg(t.px, t.ratio)}</body></html>`);
    await page.screenshot({ path: t.file });
    console.log('Gerado ' + t.file + ' (' + t.px + 'px)');
  }
  await browser.close();
  console.log('Concluído!');
})();
