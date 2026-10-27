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

  // 8. Sincronização entre aparelhos (GitHub Gist simulado)
  console.log('\n[8] Sincronização entre aparelhos');
  await page.evaluate(() => {
    window.__noAutoSync = true;
    localStorage.removeItem('fin_sync');
    window.__confirmVal = false;
    window.confirm = () => window.__confirmVal;
    window.__st = { user: 200, list: [], remote: null, posts: [], patches: [] };
    window.fetch = async (url, opt) => {
      const u = String(url), m = (opt && opt.method) || 'GET';
      const res = (ok, body, status) => ({ ok, status: status || (ok ? 200 : 401), json: async () => body || {} });
      if (u.includes('/api.github.com/user'))
        return window.__st.user === 200 ? res(true, { login: 'mueltec' }) : res(false);
      if (m === 'POST') {
        window.__st.posts.push(JSON.parse(opt.body));
        return res(true, { id: 'G1', files: { 'minhas-financas.json': {} } });
      }
      if (m === 'PATCH') {
        const body = JSON.parse(opt.body);
        window.__st.patches.push(body);
        window.__st.remote = body.files['minhas-financas.json'].content;
        return res(true, {});
      }
      if (u.includes('/gists?')) return res(true, window.__st.list);
      return res(true, { files: { 'minhas-financas.json': { content: window.__st.remote } } });
    };
  });
  const s1 = await page.evaluate(() => syncConnect(''));
  check('Conexão sem token recusa', s1.includes('Cole o token'), s1);
  const s2 = await page.evaluate(() => { window.__st.user = 401; return syncConnect('TOKEN_INVALIDO'); });
  const s2cfg = await page.evaluate(() => ({ cfg: syncCfg(), n: S.tx.length }));
  check('Token inválido → erro 401', s2.includes('inválido'), s2);
  check('Token inválido → sem config salva', s2cfg.cfg === null, JSON.stringify(s2cfg.cfg));
  const s3 = await page.evaluate(async () => {
    window.__st.user = 200; window.__st.list = [];
    const err = await syncConnect('TOK_OK');
    return { err, cfg: syncCfg(), posts: window.__st.posts.length,
             sentTx: window.__st.posts.length ? JSON.parse(window.__st.posts[0].files['minhas-financas.json'].content).data.tx.length : -1 };
  });
  check('1º aparelho: cria gist privado', s3.err === '' && s3.cfg && s3.cfg.gistId === 'G1', JSON.stringify(s3));
  check('1º aparelho: envia dados locais', s3.sentTx === 2, 'tx enviadas=' + s3.sentTx);
  const s4 = await page.evaluate(async () => {
    // 2º aparelho: gist já existe na nuvem com dados → adota a nuvem
    window.__st.list = [{ id: 'G1', files: { 'minhas-financas.json': {} } }];
    window.__st.remote = JSON.stringify({ v: 1, upd: Date.now() - 1000, data: {
      tx: [{ id: 999, type: 'in', name: 'da nuvem', amt: 42, cat: 'Outros', date: '2026-10-26' }], buys: [], cards: [], ev: [] } });
    window.__confirmVal = false;
    const err = await syncConnect('TOK_OK_2');
    return { err, posts: window.__st.posts.length, name: S.tx[0] && S.tx[0].name, n: S.tx.length, cfg: syncCfg() };
  });
  check('2º aparelho: reencontra o gist (sem criar outro)', s4.err === '' && s4.posts === 1, JSON.stringify(s4));
  check('2º aparelho: adota dados da nuvem', s4.n === 1 && s4.name === 'da nuvem', JSON.stringify(s4));
  const s5 = await page.evaluate(async () => {
    S.tx[0].name = 'local alterado'; save();
    return await syncNow();
  });
  const s5patch = await page.evaluate(() => JSON.parse(window.__st.patches[window.__st.patches.length - 1].files['minhas-financas.json'].content).data.tx[0].name);
  check('Local modificado → enviado para a nuvem', s5 === 'enviado' && s5patch === 'local alterado', s5 + ' | ' + s5patch);
  const s6 = await page.evaluate(async () => {
    // remoto fica MUITO mais novo e local também mudou → conflito
    window.__st.remote = JSON.stringify({ v: 1, upd: Date.now() + 999999, data: {
      tx: [{ id: 777, type: 'out', name: 'nuvem venceu', amt: 1, cat: 'Outros', date: '2026-10-26' }], buys: [], cards: [], ev: [] } });
    window.__confirmVal = true; // usuário escolhe o aparelho
    const c = syncCfg(); c.lastSync = Date.now() - 5000; setSyncCfg(c);
    S.tx[0].name = 'conflito local'; save();
    const r = await syncNow();
    return { r, name: S.tx[0].name };
  });
  check('Conflito (usuário escolhe local) → envia local', s6.r === 'conflito-enviado' && s6.name === 'conflito local', JSON.stringify(s6));
  const s6b = await page.evaluate(async () => {
    window.__st.remote = JSON.stringify({ v: 1, upd: Date.now() + 999999, data: {
      tx: [{ id: 776, type: 'out', name: 'nuvem venceu', amt: 1, cat: 'Outros', date: '2026-10-26' }], buys: [], cards: [], ev: [] } });
    window.__confirmVal = false; // usuário escolhe a nuvem
    const c = syncCfg(); c.lastSync = Date.now() - 5000; setSyncCfg(c);
    S.tx[0].name = 'conflito local 2'; save();
    const r = await syncNow();
    return { r, name: S.tx[0] && S.tx[0].name };
  });
  check('Conflito (usuário escolhe nuvem) → baixa nuvem', s6b.r === 'conflito-nuvem' && s6b.name === 'nuvem venceu', JSON.stringify(s6b));
  const s7 = await page.evaluate(() => { tab = 'hist'; render(); return document.body.innerText });
  check('UI conectada mostra status e botões', s7.includes('Sincronização ativa') && s7.includes('Sincronizar agora'), s7.slice(0, 80));
  const s8 = await page.evaluate(() => {
    window.confirmVal = true; window.__confirmVal = true;
    syncDisconnect();
    tab = 'hist'; render();
    return { cfg: syncCfg(), hasForm: !!document.querySelector('#f_tok'), txt: document.body.innerText };
  });
  check('Desconectar limpa a config', s8.cfg === null, JSON.stringify(s8.cfg));
  check('UI desconectada mostra campo de token', s8.hasForm && s8.txt.includes('Conectar e sincronizar'));
  const s9 = await page.evaluate(() => syncNow());
  check('syncNow sem conexão é neutro', s9 === null, String(s9));
  check('Sem erros JS no bloco de sincronização', errors.length === 0, errors.join(' | '));

  // 9. Sincronização fluida (imediata e sem requisições inúteis)
  console.log('\n[9] Sincronização fluida');
  const t1 = await page.evaluate(() => {
    save();                       // sincroniza a referência do conteúdo
    S.upd = 999999;               // marca artificial
    save();                       // nada mudou → deve ignorar
    return S.upd;
  });
  check('save sem mudança real é ignorado (sem sync)', t1 === 999999, 'upd=' + t1);
  const t2 = await page.evaluate(async () => {
    window.__st.user = 200; window.__st.list = [];
    const cerr = await syncConnect('TOK_FLUID2');   // reconecta (sem token não há o que agendar)
    window.__noAutoSync = false;
    S.tx[0].amt = 777;
    save();
    const armed = syncTimer != null;
    clearTimeout(syncTimer); syncTimer = null;
    window.__noAutoSync = true;
    return { cerr, armed, upd: S.upd, ls: JSON.parse(localStorage.getItem('fin1')).tx[0].amt };
  });
  check('alteração agenda sync imediato (~1,2s)', t2.armed === true && t2.cerr === '', JSON.stringify(t2));
  check('alteração persistida no aparelho', t2.ls === 777, JSON.stringify(t2));
  const t4 = await page.evaluate(async () => {
    window.__noAutoSync = false;
    window.__st.user = 200; window.__st.list = [];
    const err = await syncConnect('TOK_FLUID');
    if (err) return { err };
    window.__st.remote = JSON.stringify({ v: 1, upd: Date.now() + 999999, data: {
      tx: [{ id: 1, type: 'in', name: 'NAO_DEVE_ENTRAR', amt: 9, cat: 'Outros', date: '2026-10-26' }], buys: [], cards: [], ev: [] } });
    txSheet();                    // usuário está preenchendo um formulário
    const before = S.tx[0].name;
    autoSync();                   // deve ser ignorado enquanto a folha estiver aberta
    await new Promise(r => setTimeout(r, 250));
    const after = S.tx[0].name;
    close();
    clearTimeout(syncTimer); syncTimer = null;
    return { err: '', before, after, changed: before !== after };
  });
  check('autoSync NÃO mexe nos dados com formulário aberto', t4.err === '' && t4.changed === false, JSON.stringify(t4));
  const t5 = await page.evaluate(async () => {
    window.__st.remote = JSON.stringify({ v: 1, upd: Date.now() + 999999, data: {
      tx: [{ id: 2, type: 'in', name: 'nuvem deve entrar', amt: 5, cat: 'Outros', date: '2026-10-26' }], buys: [], cards: [], ev: [] } });
    const r = await syncNow();
    window.__noAutoSync = true;
    return { r, name: S.tx[0] && S.tx[0].name };
  });
  check('sem formulário → baixa atualização da nuvem', t5.r === 'atualizado' && t5.name === 'nuvem deve entrar', JSON.stringify(t5));
  const t6 = await page.evaluate(() => {
    const h = document.documentElement.outerHTML;
    return {
      open: h.includes('if(syncCfg())autoSync()'),
      flush: h.includes('else autoSync()'),
      debounce: h.includes('autoSync(),1200'),
      queue: h.includes('entra na fila'),
      guard: h.includes("$('#ov')&&!$('#ov').hidden)return")
    };
  });
  check('abertura já sincroniza (sem atraso)', t6.open, JSON.stringify(t6));
  check('envia ao minimizar o app (iOS)', t6.flush);
  check('debounce curto de 1,2s após salvar', t6.debounce);
  check('fila quando o sync está ocupado', t6.queue);
  check('guarda de formulário aberto no código', t6.guard);
  check('Sem erros JS no bloco de fluidez', errors.length === 0, errors.join(' | '));

  console.log('\n=============================');
  console.log('Resultado: ' + pass + ' passaram, ' + fail + ' falharam');
  if (errors.length) console.log('Erros JS:\n' + errors.join('\n'));
  console.log('=============================');

  await browser.close();
  process.exit(fail ? 1 : 0);
})();
