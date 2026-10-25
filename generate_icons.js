const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const sizes = [
  { name: 'mipmap-mdpi', size: 48 },
  { name: 'mipmap-hdpi', size: 72 },
  { name: 'mipmap-xhdpi', size: 96 },
  { name: 'mipmap-xxhdpi', size: 144 },
  { name: 'mipmap-xxxhdpi', size: 192 }
];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage();
  const svgContent = fs.readFileSync('icon.svg', 'utf8');
  
  const html = `<html><body style="margin:0;padding:0;overflow:hidden">${svgContent.replace('<svg', '<svg width="100%" height="100%"')}</body></html>`;
  
  if (!fs.existsSync('android_assets')) fs.mkdirSync('android_assets');

  for (const s of sizes) {
    await page.setViewport({width: s.size, height: s.size, deviceScaleFactor: 1});
    await page.setContent(html);
    const dir = path.join('android_assets', s.name);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    await page.screenshot({path: path.join(dir, 'ic_launcher.png'), omitBackground: true});
    console.log('Generated ' + s.name);
  }

  await browser.close();
  console.log('All icons generated in android_assets/');
})();
