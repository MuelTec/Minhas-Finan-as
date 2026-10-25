// Gera todos os recursos de ícone para o Android (adaptativo + legado)
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const densities = [
  { name: 'mdpi', launcher: 48, fg: 108 },
  { name: 'hdpi', launcher: 72, fg: 162 },
  { name: 'xhdpi', launcher: 96, fg: 216 },
  { name: 'xxhdpi', launcher: 144, fg: 324 },
  { name: 'xxxhdpi', launcher: 192, fg: 432 }
];

// Desenho (sem fundo) — coordenadas no espaço 32x32 do icon.svg
const design = `
  <defs>
    <linearGradient id="lineGrad" x1="6" y1="18" x2="26" y2="10" gradientUnits="userSpaceOnUse">
      <stop stop-color="#22E1D0"/>
      <stop offset="1" stop-color="#3F7FE8"/>
    </linearGradient>
  </defs>
  <g opacity="0.85">
    <rect x="8" y="19" width="3.5" height="7" rx="1" fill="#22E1D0"/>
    <rect x="14" y="16" width="3.5" height="10" rx="1" fill="#3F7FE8"/>
    <rect x="20" y="13" width="3.5" height="13" rx="1" fill="#D56EF5"/>
  </g>
  <path d="M6 14L11 9L16 14L22 8L26 12" stroke="url(#lineGrad)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <circle cx="26" cy="12" r="2.2" fill="#D56EF5"/>
`;

// Foreground adaptativo: desenho centralizado na zona segura (72dp de 108dp)
// bbox do desenho: x[4.9,28.2] y[6.9,26] => centro (16.55,16.45)
// escala 2.75 + translate => centro do canvas 108x108 em (54,54), largura ~64
const fgSvg = px =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 108 108">
     <g transform="translate(8.49,8.76) scale(2.75)">${design}</g>
   </svg>`;

const launcherSvg = px => {
  const inner = fs.readFileSync('icon.svg', 'utf8')
    .replace(/<svg[^>]*>/, '')
    .replace('</svg>', '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 32 32">${inner}</svg>`;
};

const colorXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#0F1226</color>
</resources>
`;

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage();

  for (const d of densities) {
    const dir = path.join('android_assets', 'mipmap-' + d.name);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // PNG legado (Android <= 7): ícone completo
    await page.setViewport({ width: d.launcher, height: d.launcher, deviceScaleFactor: 1 });
    await page.setContent(`<html><body style="margin:0">${launcherSvg(d.launcher)}</body></html>`);
    await page.screenshot({ path: path.join(dir, 'ic_launcher.png'), omitBackground: true });
    fs.copyFileSync(path.join(dir, 'ic_launcher.png'), path.join(dir, 'ic_launcher_round.png'));

    // Foreground do ícone adaptativo (Android 8+): desenho transparente na zona segura
    await page.setViewport({ width: d.fg, height: d.fg, deviceScaleFactor: 1 });
    await page.setContent(`<html><body style="margin:0">${fgSvg(d.fg)}</body></html>`);
    await page.screenshot({ path: path.join(dir, 'ic_launcher_foreground.png'), omitBackground: true });

    console.log('Gerado mipmap-' + d.name + ' (launcher ' + d.launcher + 'px, fg ' + d.fg + 'px)');
  }

  // Cor de fundo do ícone adaptativo
  const valuesDir = 'android_assets/values';
  if (!fs.existsSync(valuesDir)) fs.mkdirSync(valuesDir, { recursive: true });
  fs.writeFileSync(path.join(valuesDir, 'ic_launcher_background.xml'), colorXml);
  console.log('Gerado values/ic_launcher_background.xml (#0F1226)');

  await browser.close();
  console.log('Concluído!');
})();
