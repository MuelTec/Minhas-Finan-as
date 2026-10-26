// Instala o leitor nativo de notificações no projeto Android
// gerado pelo Capacitor. Roda no workflow do GitHub Actions.
const fs = require('fs');
const path = require('path');

const SRC = 'android_overlay';
const MAIN = 'android/app/src/main';
const JAVA_DIR = path.join(MAIN, 'java', 'com', 'minhasfinancas', 'app');

fs.mkdirSync(JAVA_DIR, { recursive: true });

// 1) Código nativo (MainActivity + NotificationListenerService)
for (const f of ['MainActivity.java', 'NotifListenerService.java']) {
  fs.copyFileSync(path.join(SRC, f), path.join(JAVA_DIR, f));
  console.log('Copiado ' + f);
}

// 2) Declaração do serviço no AndroidManifest.xml
const manifestPath = path.join(MAIN, 'AndroidManifest.xml');
let xml = fs.readFileSync(manifestPath, 'utf8');
if (!xml.includes('NotifListenerService')) {
  const svc = fs.readFileSync(path.join(SRC, 'service.xml'), 'utf8');
  xml = xml.replace('</application>', svc + '    </application>');
  fs.writeFileSync(manifestPath, xml);
  console.log('Serviço registrado no AndroidManifest.xml');
} else {
  console.log('Serviço já registrado');
}

console.log('Leitor de notificações instalado com sucesso.');

// 3) Assets web no app Android (favicon/manifest/ícones PWA)
//    sw.js fica de fora de propósito: o app nativo não usa service worker.
const www = 'www';
if (fs.existsSync(www)) {
  for (const f of ['icon.svg', 'manifest.webmanifest']) {
    if (fs.existsSync(f)) fs.copyFileSync(f, path.join(www, f));
  }
  if (fs.existsSync('webicons')) {
    fs.mkdirSync(path.join(www, 'webicons'), { recursive: true });
    for (const f of fs.readdirSync('webicons')) {
      fs.copyFileSync(path.join('webicons', f), path.join(www, 'webicons', f));
    }
  }
  console.log('Assets web copiados para www/');
}
