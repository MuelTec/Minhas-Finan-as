const puppeteer = require('puppeteer-core');
const fs = require('fs');

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

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 640, height: 300, deviceScaleFactor: 1 });

  const html = `<html><body style="margin:0;background:#0B0D1A;display:flex;gap:40px;align-items:center;justify-content:center;height:300px;font-family:sans-serif">
    <!-- Estilo Pixel: círculo -->
    <div style="text-align:center">
      <svg width="200" height="200" viewBox="0 0 108 108">
        <defs><clipPath id="circ"><circle cx="54" cy="54" r="54"/></clipPath></defs>
        <g clip-path="url(#circ)">
          <rect width="108" height="108" fill="#0F1226"/>
          <g transform="translate(8.49,8.76) scale(2.75)">${design}</g>
        </g>
      </svg>
      <div style="color:#8B93B8;font-size:13px;margin-top:8px">Circular (Pixel)</div>
    </div>
    <!-- Estilo Samsung: squircle -->
    <div style="text-align:center">
      <svg width="200" height="200" viewBox="0 0 108 108">
        <defs><clipPath id="sq"><rect width="108" height="108" rx="30"/></clipPath></defs>
        <g clip-path="url(#sq)">
          <rect width="108" height="108" fill="#0F1226"/>
          <g transform="translate(8.49,8.76) scale(2.75)">${design}</g>
        </g>
      </svg>
      <div style="color:#8B93B8;font-size:13px;margin-top:8px">Squircle (Samsung)</div>
    </div>
    <!-- Legado: PNG arredondado -->
    <div style="text-align:center">
      <img src="file:///${require('path').resolve('android_assets/mipmap-xxxhdpi/ic_launcher.png').replace(/\\\\/g, '/')}" width="200" height="200"/>
      <div style="color:#8B93B8;font-size:13px;margin-top:8px">PNG legado (Android 7-)</div>
    </div>
  </body></html>`;

  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: 'preview_icone_final.png' });
  await browser.close();
  console.log('Preview gerado: preview_icone_final.png');
})();
