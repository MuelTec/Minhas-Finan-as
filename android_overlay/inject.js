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
