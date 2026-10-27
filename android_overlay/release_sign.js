// Prepara a assinatura RELEASE do APK no build do CI.
// - Materializa o keystore a partir do secret ANDROID_KEYSTORE_B64
// - Injeta signingConfigs.release no android/app/build.gradle
// Roda logo antes do ./gradlew assembleRelease (ver .github/workflows/build-apk.yml)
const fs = require('fs');
const path = require('path');

const b64 = process.env.ANDROID_KEYSTORE_B64;
const sp = process.env.ANDROID_KEYSTORE_PASS;
const alias = process.env.ANDROID_KEY_ALIAS;
const kp = process.env.ANDROID_KEY_PASS || sp;

if (!b64 || !sp || !alias) {
  console.error('[release_sign] Faltam secrets: ANDROID_KEYSTORE_B64, ANDROID_KEYSTORE_PASS, ANDROID_KEY_ALIAS');
  process.exit(1);
}

// 1) Keystore
const ksPath = path.join('android', 'minhasfinancas.keystore');
fs.writeFileSync(ksPath, Buffer.from(b64, 'base64'));
console.log('[release_sign] Keystore materializado (' + fs.statSync(ksPath).size + ' bytes)');

// 2) build.gradle: signingConfigs + ligação no buildType release
const gPath = path.join('android', 'app', 'build.gradle');
let g = fs.readFileSync(gPath, 'utf8');

if (g.includes('signingConfigs')) {
  console.log('[release_sign] build.gradle já possui signingConfigs — nada a fazer');
  process.exit(0);
}

const m = g.match(/(\n)([ \t]*)buildTypes[ \t]*\{([ \t]*\n)([ \t]*)release[ \t]*\{/);
if (!m) {
  console.error('[release_sign] Não encontrei "buildTypes { ... release {" em build.gradle');
  process.exit(1);
}
const ind = m[2];
const signingBlock =
  `\n${ind}signingConfigs {` +
  `\n${ind}    release {` +
  `\n${ind}        storeFile file("../minhasfinancas.keystore")` +
  `\n${ind}        storePassword '${sp}'` +
  `\n${ind}        keyAlias '${alias}'` +
  `\n${ind}        keyPassword '${kp}'` +
  `\n${ind}    }` +
  `\n${ind}}`;
const releaseLine = `\n${m[4]}    signingConfig signingConfigs.release`;
g = g.replace(m[0], signingBlock + m[0] + releaseLine);

fs.writeFileSync(gPath, g);
console.log('[release_sign] Assinatura release configurada em build.gradle');
