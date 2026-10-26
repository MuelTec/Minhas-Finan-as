// Teste completo do app de finanças
const puppeteer = require('puppeteer-core');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await page.goto('file:///' + path.resolve('financas.html').replace(/\\/g, '/'), { waitUntil: 'load' });

  let pass = 0, fail = 0;
  const check = (name, cond, extra = '') => {
    if (cond) { pass++; console.log('  PASS: ' + name); }
    else { fail++; console.log('  FAIL: ' + name + (extra ? ' -> ' + extra : '')); }
  };

  // 1. Sem erros de JS
  console.log('\n[1] Erros de carregamento');
  check('Sem erros de JS', errors.length === 0, errors.join(' | '));

  // 2. parseNotif - unitários
  console.log('\n[2] parseNotif (análise de notificações)');
  const cases = [
    { txt: 'Compra aprovada no cartão final 1234 - R$ 45,90 - Supermercado Pão de Açúcar',
      exp: { type: 'out', amt: 45.9, cat: 'Alimentação' }, nameHas: 'Supermercado' },
    { txt: 'PIX recebido de Maria - R$ 250,00',
      exp: { type: 'in', amt: 250, cat: 'Outros' }, nameHas: 'Maria' },
    { txt: 'Você recebeu um Pix de R$ 75,50 de João',
      exp: { type: 'in', amt: 75.5 }, nameHas: 'João' },
    { txt: 'Pagamento de boleto R$ 189,90 com vencimento hoje',
      exp: { type: 'out', amt: 189.9 } },
    { txt: 'Saque no valor de R$ 200,00 - hoje',
      exp: { type: 'out', amt: 200 } },
    { txt: 'TED enviada para Pedro - R$ 300,00',
      exp: { type: 'out', amt: 300 } },
    { txt: 'Salário de outubro - R$ 3.500,00',
      exp: { type: 'in', amt: 3500, cat: 'Salário' } },
    { txt: 'Pix enviado no valor de R$ 150,00 para João em 15/10/2026',
      exp: { type: 'out', amt: 150 }, date: '2026-10-15', nameHas: 'João' },
    { txt: 'Compra na Amazon de R$ 89,99 ontem',
      exp: { type: 'out', amt: 89.99 } },
    { txt: 'texto sem valor algum',
      exp: null }
  ];
  for (const c of cases) {
    const r = await page.evaluate(t => parseNotif(t), c.txt);
    if (c.exp === null) {
      check('rejeita: ' + c.txt.slice(0, 30), r === null, JSON.stringify(r));
      continue;
    }
    let ok = r && r.type === c.exp.type && Math.abs(r.amt - c.exp.amt) < 0.005;
    if (ok && c.exp.cat) ok = r.cat === c.exp.cat;
    if (ok && c.exp.date) ok = r.date === c.exp.date;
    if (ok && c.nameHas) ok = r.name.toLowerCase().includes(c.nameHas.toLowerCase());
    check((ok ? '' : '(r=' + JSON.stringify(r) + ') ') + c.txt.slice(0, 45), ok);
  }

  // 3. Fluxo UI: importar notificação -> formulário pré-preenchido -> salvar
  console.log('\n[3] Fluxo de importação pela interface');
  await page.evaluate(() => { tab = 'tx'; render(); });
  await page.click('button[onclick="importNotif()"]');
  await page.waitForFunction(() => !document.querySelector('#ov').hidden && document.querySelector('#f_x'), { timeout: 3000 });
  check('Folga de importação abriu', true);
  await page.type('#f_x', 'Compra aprovada no cartão final 4321 - R$ 42,50 - Farmácia São Paulo');
  await page.click('#bs'); // Analisar
  await page.waitForFunction(() => document.querySelector('#f_t'), { timeout: 3000 });
  const pre = await page.evaluate(() => ({
    type: document.querySelector('#f_t').value,
    name: document.querySelector('#f_n').value,
    amt: document.querySelector('#f_a').value,
    cat: document.querySelector('#f_c').value
  }));
  check('Formulário pré-preenchido (saída)', pre.type === 'out', JSON.stringify(pre));
  check('Nome extraído', /Farmácia/i.test(pre.name), pre.name);
  check('Valor formatado', pre.amt === '42,5', pre.amt);
  check('Categoria Saúde', pre.cat === 'Saúde', pre.cat);
  await page.click('#bs'); // Salvar lançamento
  await page.waitForFunction(() => document.querySelector('#ov').hidden, { timeout: 3000 });
  const saved = await page.evaluate(() => ({
    n: S.tx.length,
    last: S.tx[S.tx.length - 1],
    ls: !!localStorage.getItem('fin1')
  }));
  check('Lançamento salvo em S.tx', saved.n === 1 && Math.abs(saved.last.amt - 42.5) < 0.005, JSON.stringify(saved.last));
  check('Salvo no localStorage', saved.ls);

  // 4. Validação de erro: texto sem valor
  console.log('\n[4] Validação de erro');
  await page.click('button[onclick="importNotif()"]');
  await page.waitForFunction(() => document.querySelector('#f_x'), { timeout: 3000 });
  await page.type('#f_x', 'sem valor aqui');
  await page.click('#bs');
  const err = await page.evaluate(() => document.querySelector('#er').textContent);
  check('Mensagem de erro exibida', err.includes('valor'), err);
  await page.click('#bc'); // Cancelar

  // 5. Regressão: navegação e lançamento manual
  console.log('\n[5] Regressão (abas e lançamento manual)');
  for (const t of ['home', 'tx', 'hist', 'card', 'ag']) {
    const ok = await page.evaluate(k => { try { tab = k; render(); return true } catch (e) { return false } }, t);
    check('Aba ' + t + ' renderiza', ok);
  }
  const backupBtn = await page.evaluate(() => { tab = 'hist'; render(); return !!document.querySelector('button[onclick="exportBackup()"]') });
  check('Botão de backup presente no Histórico', backupBtn);
  await page.evaluate(() => { tab = 'tx'; render(); });
  await page.click('button[onclick="txSheet()"]');
  await page.waitForFunction(() => document.querySelector('#f_n'), { timeout: 3000 });
  await page.type('#f_n', 'Teste manual');
  await page.type('#f_a', '10,25');
  await page.click('#bs');
  await page.waitForFunction(() => document.querySelector('#ov').hidden, { timeout: 3000 });
  const manual = await page.evaluate(() => S.tx.length);
  check('Lançamento manual salvo (total=2)', manual === 2, 'total=' + manual);

  // 6. Captura automática com AndroidBridge simulado
  console.log('\n[6] Captura automática (AndroidBridge simulado)');
  await page.evaluate(() => {
    window.AndroidBridge = {
      _q: [{ text: 'Compra aprovada no cartão final 9999 - R$ 77,00 - Padaria Central' }],
      takeQueue() { const q = this._q; this._q = []; return JSON.stringify(q); },
      isListenerEnabled() { return true },
      openNotificationSettings() { window.__settingsOpened = true }
    };
    tab = 'tx'; render();
  });
  const st1 = await page.evaluate(() => notifStatus());
  check('Status "captura ativa"', st1.includes('Captura automática ativa'), st1.slice(0, 60));
  await page.evaluate(() => pullNotifs());
  await page.waitForFunction(() => document.querySelector('#f_a'), { timeout: 3000 });
  const auto = await page.evaluate(() => ({
    amt: document.querySelector('#f_a').value,
    name: document.querySelector('#f_n').value
  }));
  check('Auto-preenchido com 77,00', auto.amt === '77', 'amt=' + auto.amt);
  check('Nome Padaria extraído', /Padaria/i.test(auto.name), auto.name);
  check('Mensagem "automático" visível', await page.evaluate(() => document.querySelector('#er').textContent.includes('automaticamente')));
  // Notificação chega com sheet aberto → enfileira
  await page.evaluate(() => {
    window.AndroidBridge._q = [{ text: 'PIX recebido de Pedro - R$ 10,00' }];
    pullNotifs();
  });
  const pend = await page.evaluate(() => pendingAuto.length);
  check('Enfileirou 1 pendente', pend === 1, 'pend=' + pend);
  // Salvar o atual → o pendente abre sozinho
  await page.click('#bs');
  await page.waitForFunction(() => document.querySelector('#f_a') && document.querySelector('#f_a').value === '10', { timeout: 3000 });
  check('Próximo abriu automaticamente (R$ 10,00)', true);
  await page.click('#bc'); // cancela
  await page.waitForFunction(() => document.querySelector('#ov').hidden, { timeout: 3000 });
  const pend2 = await page.evaluate(() => pendingAuto.length);
  check('Pendente consumido', pend2 === 0, 'pend=' + pend2);
  const txCount = await page.evaluate(() => S.tx.length);
  check('Transação automática salva (total=3)', txCount === 3, 'total=' + txCount);
  // Listener desativado → botão de ativar
  await page.evaluate(() => { window.AndroidBridge.isListenerEnabled = () => false; tab = 'tx'; render(); });
  const st2 = await page.evaluate(() => notifStatus());
  check('Botão "Ativar captura" quando desativado', st2.includes('Ativar captura automática'));
  // Volta das configurações do Android com o interruptor ligado → status atualiza sozinho
  await page.evaluate(() => {
    window.AndroidBridge.isListenerEnabled = () => true;
    window.dispatchEvent(new Event('focus'));
  });
  const autoRefresh = await page.evaluate(() =>
    document.body.innerText.includes('Captura automática ativa'));
  check('Status atualiza sozinho ao voltar das configurações', autoRefresh);
  // Sem bridge (navegador/iOS) → sem status, sem erro
  await page.evaluate(() => { delete window.AndroidBridge; tab = 'tx'; render(); });
  const st3 = await page.evaluate(() => notifStatus());
  check('Sem bridge → sem status', st3 === '');
  check('Sem erros JS após captura', errors.length === 0, errors.join(' | '));

  // 7. Restaurar backup (importação) + requisitos PWA/iOS
  console.log('\n[7] Restaurar backup e PWA');
  const backupOk = await page.evaluate(() => {
    const bak = { tx: [{ id: 91, type: 'in', name: 'Pix teste', amt: 10, cat: 'Outros', date: '2026-10-20' },
                       { id: 92, type: 'out', name: 'Mercado', amt: 55.5, cat: 'Alimentação', date: '2026-10-21' }],
                  buys: [], cards: [], ev: [] };
    const err = applyBackup(bak);
    return { err, n: S.tx.length, ls: JSON.parse(localStorage.getItem('fin1')).tx.length };
  });
  check('Backup válido restaura (2 lançamentos)', backupOk.err === '' && backupOk.n === 2, JSON.stringify(backupOk));
  check('Restauração persistida no localStorage', backupOk.ls === 2, 'ls=' + backupOk.ls);
  const bakInvalid = await page.evaluate(() => ({
    nullErr: applyBackup(null),
    noTxErr: applyBackup({ foo: 1 }),
    arrErr: applyBackup([1, 2]),
    n: S.tx.length
  }));
  check('Backup nulo rejeitado', bakInvalid.nullErr.includes('inválido'), bakInvalid.nullErr);
  check('JSON sem tx rejeitado', bakInvalid.noTxErr.includes('inválido'), bakInvalid.noTxErr);
  check('Array rejeitado', bakInvalid.arrErr.includes('inválido'), bakInvalid.arrErr);
  check('Dados preservados após tentativa inválida', bakInvalid.n === 2, 'n=' + bakInvalid.n);
  const restoreBtn = await page.evaluate(() => { tab = 'hist'; render(); return !!document.querySelector('button[onclick="importBackup()"]') });
  check('Botão "Restaurar Backup" no Histórico', restoreBtn);
  const pwa = await page.evaluate(() => {
    const h = document.documentElement.outerHTML;
    return {
      touchIcon: !!document.querySelector('link[rel="apple-touch-icon"][href$=".png"]'),
      manifest: h.includes("lm.href='manifest.webmanifest'") || !!document.querySelector('link[rel="manifest"]'),
      iosCapable: h.includes('apple-mobile-web-app-capable'),
      themeColor: h.includes('theme-color'),
      swReg: h.includes("serviceWorker'.register") || h.includes('serviceWorker.register') || h.includes("register('sw.js')"),
      restoreFn: typeof importBackup === 'function' && typeof applyBackup === 'function'
    };
  });
  check('apple-touch-icon aponta para PNG', pwa.touchIcon);
  check('link do manifest presente', pwa.manifest);
  check('meta iOS standalone presente', pwa.iosCapable);
  check('meta theme-color presente', pwa.themeColor);
  check('registro do service worker no código', pwa.swReg);
  check('funções de backup/restore definidas', pwa.restoreFn);
  const fsMod = require('fs');
  check('manifest.webmanifest válido e completo',
    fsMod.existsSync('manifest.webmanifest') &&
    (() => { const m = JSON.parse(fsMod.readFileSync('manifest.webmanifest', 'utf8')); return m.display === 'standalone' && m.start_url && m.icons.length >= 2; })());
  check('sw.js existe', fsMod.existsSync('sw.js'));
  check('index.html raiz redireciona', fsMod.existsSync('index.html') &&
    fsMod.readFileSync('index.html', 'utf8').includes('financas.html'));
  check('ícone apple-touch 180px existe', fsMod.existsSync('webicons/apple-touch-icon.png'));
  check('Sem erros JS no bloco PWA', errors.length === 0, errors.join(' | '));

  console.log('\n=============================');
  console.log('Resultado: ' + pass + ' passaram, ' + fail + ' falharam');
  if (errors.length) console.log('Erros JS:\n' + errors.join('\n'));
  console.log('=============================');

  await browser.close();
  process.exit(fail ? 1 : 0);
})();
