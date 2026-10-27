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
      flush: h.includes('else{autoSync()'),
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

  // 10. Bloqueio por PIN
  console.log('\n[10] Bloqueio por PIN');
  await page.evaluate(() => {
    window.alert = m => { window.__alerts = (window.__alerts || []).concat(String(m).slice(0, 90)); };
    window.prompt = () => window.__promptVal;
    window.__alerts = [];
  });
  const p1 = await page.evaluate(async () => {
    setLockCfg({ h: await hashPin('1234'), r: 'WXYZ-2345' });
    lockShow();
    return { shown: !$('#lks').hidden, dots: $('#lk_dots').textContent.length, pad: $('#lk_pad').children.length };
  });
  check('PIN ativo → tela de bloqueio aparece', p1.shown === true, JSON.stringify(p1));
  check('teclado numérico montado (12 teclas)', p1.pad === 12, 'pad=' + p1.pad);
  check('indicador dos 4 dígitos', p1.dots === 4, 'dots=' + p1.dots);
  const p2 = await page.evaluate(async () => {
    await lockKey('9'); await lockKey('9'); await lockKey('9'); await lockKey('9');
    return { shown: !$('#lks').hidden, err: $('#lk_err').textContent, pin: lockPin };
  });
  check('PIN errado → recusa e limpa', p2.shown === true && p2.err.includes('incorreto') && p2.pin === '', JSON.stringify(p2));
  const p3 = await page.evaluate(async () => {
    await lockKey('1'); await lockKey('2'); await lockKey('3'); await lockKey('4');
    return { shown: !$('#lks').hidden };
  });
  check('PIN certo → desbloqueia', p3.shown === false, JSON.stringify(p3));
  const p4 = await page.evaluate(async () => {
    setLockCfg(null);
    lockSheet();                                    // sem PIN → fluxo de ativação
    $('#f_p1').value = '12'; $('#f_p2').value = '12';
    $('#bs').onclick();
    await new Promise(r => setTimeout(r, 80));
    const shortErr = $('#er') ? $('#er').textContent : '';
    const open1 = !$('#ov').hidden;
    $('#f_p1').value = '5678'; $('#f_p2').value = '9999';
    $('#bs').onclick();
    await new Promise(r => setTimeout(r, 80));
    const diffErr = $('#er') ? $('#er').textContent : '';
    $('#f_p1').value = '5678'; $('#f_p2').value = '5678';
    $('#bs').onclick();
    await new Promise(r => setTimeout(r, 120));
    const cfg = lockCfg();
    return { shortErr, open1, diffErr, closed: $('#ov').hidden, hasCfg: !!(cfg && cfg.h), rec: cfg ? cfg.r : '' };
  });
  check('ativação: PIN curto é recusado', p4.shortErr.includes('4 números') && p4.open1, JSON.stringify(p4));
  check('ativação: PINs diferentes são recusados', p4.diffErr.includes('não conferem'), JSON.stringify(p4));
  check('ativação: salva hash + código de recuperação', p4.closed && p4.hasCfg && /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(p4.rec), JSON.stringify(p4));
  const p5 = await page.evaluate(() => {
    window.__promptVal = 'WRONG-CODE';
    lockShow();
    lockForgot();
    const stillLocked = !$('#lks').hidden && !!lockCfg();
    window.__promptVal = (lockCfg() || {}).r;
    lockForgot();
    return { stillLocked, removed: !lockCfg(), hidden: $('#lks').hidden };
  });
  check('código de recuperação errado → mantém bloqueio', p5.stillLocked === true, JSON.stringify(p5));
  check('código certo → remove o bloqueio', p5.removed === true && p5.hidden === true, JSON.stringify(p5));
  const p6 = await page.evaluate(async () => {
    setLockCfg({ h: await hashPin('1111'), r: 'AAAA-BBBB' });
    const payload = cloudPayload();
    const fin1 = localStorage.getItem('fin1') || '';
    const h = lockCfg().h;
    const r = {
      payloadLeak: payload.includes('fin_lock') || payload.includes(h),
      fin1Leak: fin1.includes('fin_lock') || fin1.includes(h),
      hashStable: (await hashPin('1111')) === h
    };
    setLockCfg(null);
    return r;
  });
  check('PIN fica SÓ no aparelho (não vai pra nuvem nem pro fin1)', !p6.payloadLeak && !p6.fin1Leak, JSON.stringify(p6));
  check('hash estável (mesmo PIN → mesmo hash)', p6.hashStable, JSON.stringify(p6));
  check('Sem erros JS no bloco de PIN', errors.length === 0, errors.join(' | '));

  // 11. Orçamento por categoria
  console.log('\n[11] Orçamento por categoria');
  const b1 = await page.evaluate(() => {
    budSheet();
    $('#fb0').value = '800,50';          // Alimentação (válido)
    $('#fb1').value = 'abc';             // Transporte (inválido)
    $('#bs').onclick();
    const err1 = $('#er') ? $('#er').textContent : '';
    const open1 = !$('#ov').hidden;
    $('#fb1').value = '-50';             // negativo
    $('#bs').onclick();
    const err2 = $('#er') ? $('#er').textContent : '';
    $('#fb1').value = '';                // vazio = sem limite
    $('#fb2').value = '1500';            // Moradia
    $('#bs').onclick();
    return { err1, open1, err2, closed: $('#ov').hidden, bud: JSON.parse(JSON.stringify(S.bud || {})) };
  });
  check('orçamento: valor inválido recusa', b1.err1.includes('inválido') && b1.open1, JSON.stringify(b1));
  check('orçamento: valor negativo recusa', b1.err2.includes('negativo'), JSON.stringify(b1));
  check('orçamento: valores válidos salvos (vírgula decimal)', b1.closed && b1.bud['Alimentação'] === 800.5 && b1.bud['Moradia'] === 1500, JSON.stringify(b1));
  const b2 = await page.evaluate(() => {
    S.tx.push({ id: Date.now(), type: 'out', name: 'Teste orçamento', amt: 700, cat: 'Alimentação', date: today() });
    save();
    tab = 'home'; render();
    const html = document.getElementById('app').innerHTML;
    const txt = document.body.innerText;
    return { hasSection: txt.includes('Orçamento de'), pct: html.includes('87%'), alert80: html.includes('#F2B84B'), bar: html.includes('Faltam') };
  });
  check('Resumo mostra a seção "Orçamento de {mês}"', b2.hasSection, JSON.stringify(b2));
  check('progresso calculado (700 de 800,50 = 87%)', b2.pct, JSON.stringify(b2));
  check('cor de alerta ≥80% (#F2B84B) + texto faltam', b2.alert80 && b2.bar, JSON.stringify(b2));
  const b3 = await page.evaluate(() => {
    S.tx.push({ id: Date.now() + 1, type: 'out', name: 'Estouro testado', amt: 150, cat: 'Alimentação', date: today() });
    save();
    tab = 'home'; render();
    const html = document.getElementById('app').innerHTML;
    const txt = document.body.innerText;
    return { pct: html.includes('106%'), estourou: txt.includes('Estourou em'), danger: html.includes('var(--ex)') };
  });
  check('estouro (>100%) → cor de perigo + "Estourou em"', b3.pct && b3.estourou && b3.danger, JSON.stringify(b3));
  const b4 = await page.evaluate(() => {
    const err = applyBackup({ tx: [], buys: [], cards: [], ev: [] });   // backup antigo, sem bud
    return { err, bud: S.bud, isObj: typeof S.bud === 'object' && S.bud !== null };
  });
  check('backup antigo (sem orçamento) → S.bud vira objeto', b4.err === '' && b4.isObj, JSON.stringify(b4));
  const b5 = await page.evaluate(() => { tab = 'hist'; render(); return document.body.innerText });
  check('botões no Histórico (orçamento/versões/bloqueio)', b5.includes('Orçamento por categoria') && b5.includes('Histórico de versões') && b5.includes('bloqueio por PIN'), b5.slice(0, 60));
  check('Sem erros JS no bloco de orçamento', errors.length === 0, errors.join(' | '));

  // 12. Histórico de versões na nuvem (desfazer)
  console.log('\n[12] Histórico de versões (desfazer)');
  const v1 = await page.evaluate(async () => {
    window.__confirmVal = true;
    window.confirm = () => window.__confirmVal;
    window.alert = () => {};
    window.__st.user = 200;
    window.__st.list = [{ id: 'G1', files: { 'minhas-financas.json': {} } }];
    if (!syncCfg()) { const e = await syncConnect('TOK_HIST'); if (e) return { err: e }; }
    cloudHist = [];
    S = { tx: [{ id: 1, type: 'in', name: 'versão A local', amt: 100, cat: 'Outros', date: '2026-10-26' }], buys: [], cards: [], ev: [], bud: {}, upd: 0 };
    save();
    window.__st.remote = JSON.stringify({ v: 1, upd: Date.now() + 60000, data: {
      tx: [{ id: 5, type: 'out', name: 'versão B da nuvem', amt: 10, cat: 'Outros', date: '2026-10-26' }], buys: [], cards: [], ev: [], bud: {} } });
    const c = syncCfg(); c.lastSync = Date.now() - 99999; setSyncCfg(c);
    const r = await syncNow();   // conflito → usuário escolhe local → pushLocal(p) guarda a nuvem anterior
    return { err: '', r, patches: window.__st.patches.length };
  });
  check('conflito com escolha local → envia', v1.err === '' && v1.r === 'conflito-enviado', JSON.stringify(v1));
  const v2 = await page.evaluate(() => {
    const last = JSON.parse(window.__st.patches[window.__st.patches.length - 1].files['minhas-financas.json'].content);
    return { v: last.v, histN: (last.hist || []).length, histTx: last.hist && last.hist[0] && last.hist[0].data.tx[0].name, curTx: last.data.tx[0].name };
  });
  check('payload virou v2 com histórico', v2.v === 2 && v2.histN === 1, JSON.stringify(v2));
  check('versão substituída guardada (dá pra desfazer)', v2.histTx === 'versão B da nuvem', JSON.stringify(v2));
  check('versão atual na nuvem é a local', v2.curTx === 'versão A local', JSON.stringify(v2));
  const v3 = await page.evaluate(async () => {
    tab = 'hist'; render();
    histVerSheet();
    await new Promise(r => setTimeout(r, 300));
    const rows = document.querySelectorAll('#sh .r').length;
    const btn = !!document.querySelector('#sh button[onclick^="restoreVer"]');
    const txt = document.querySelector('#sh').innerText;
    const noSalvar = !document.querySelector('#bs');
    return { rows, btn, noSalvar, txt: txt.slice(0, 100) };
  });
  check('lista as versões salvas com botão Restaurar', v3.rows === 1 && v3.btn, JSON.stringify(v3));
  check('folha é somente-leitura (sem botão Salvar)', v3.noSalvar, JSON.stringify(v3));
  const v4 = await page.evaluate(async () => {
    window.confirm = () => true;
    await restoreVer(0);
    await new Promise(r => setTimeout(r, 300));
    return { name: S.tx[0] && S.tx[0].name, n: S.tx.length, closed: $('#ov').hidden, histN: cloudHist.length };
  });
  check('restaurar aplica a versão antiga', v4.name === 'versão B da nuvem' && v4.n === 1 && v4.closed, JSON.stringify(v4));
  check('versão atual guardada antes de restaurar (pode voltar atrás)', v4.histN >= 2, 'histN=' + v4.histN);
  const v5 = await page.evaluate(async () => {
    await new Promise(r => setTimeout(r, 300));
    const last = JSON.parse(window.__st.patches[window.__st.patches.length - 1].files['minhas-financas.json'].content);
    return { v: last.v, curTx: last.data.tx[0].name, histN: (last.hist || []).length };
  });
  check('restauração propagada para a nuvem', v5.v === 2 && v5.curTx === 'versão B da nuvem', JSON.stringify(v5));
  const v6 = await page.evaluate(() => {
    cloudHist = [];
    const mk = n => ({ tx: Array.from({ length: n }, (_, i) => ({ id: i })), buys: [], cards: [], ev: [], bud: {} });
    for (let i = 0; i < 20; i++) pushHist(mk(i + 1), 1000 + i);
    const cap = cloudHist.length;
    cloudHist = [];
    return cap;
  });
  check('limite de 15 versões (as mais antigas caem)', v6 === 15, 'cap=' + v6);
  check('Sem erros JS no bloco de versões', errors.length === 0, errors.join(' | '));

  console.log('\n=============================');
  console.log('Resultado: ' + pass + ' passaram, ' + fail + ' falharam');
  if (errors.length) console.log('Erros JS:\n' + errors.join('\n'));
  console.log('=============================');

  await browser.close();
  process.exit(fail ? 1 : 0);
})();
