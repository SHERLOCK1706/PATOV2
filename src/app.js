(function () {
  'use strict';
  const E = window.PatoEngine, IMP = window.PatoImport;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const brl = v => (v == null || isNaN(v)) ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const n2 = v => (v == null || isNaN(v)) ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const n3 = v => (v == null || isNaN(v)) ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  const pct = v => (v == null || isNaN(v)) ? '—' : (v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
  const sget = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const sset = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } };

  const VIEWS = [
    ['painel', 'Painel'], ['sep', 'Dados de entrada'], ['projeto', 'Projeto e SNV'], ['inventario', 'Inventário'], ['icp', 'ICP e histórico'],
    ['transportes', 'Transportes e DMT'], ['precos', 'Preços e cotações'], ['sep', 'Resultado'], ['planilha', 'Planilha PATO'], ['validacoes', 'Validações'],
    ['conferencia', 'Conferência'], ['saidas', 'Saídas e exportação'], ['sep', 'Referência'], ['biblioteca', 'Biblioteca técnica'], ['requisitos', 'Requisitos e modelo'],
  ];
  const PART_OF = { projeto: 'projeto', adm: 'projeto', parametros: 'projeto', justificativas: 'projeto', inventario: 'inventario', icp: 'icp', linhas: 'linhas', grupos: 'linhas', transportes: 'transportes', croqui: 'apoio', fit: 'apoio', desempenho: 'apoio', rocada: 'apoio', undia: 'apoio', binomio: 'apoio', cotacoes: 'apoio', precos: 'precos', snvRef: 'snv', gabarito: 'gabarito' };
  const PARTS = { projeto: ['projeto', 'adm', 'parametros', 'justificativas'], inventario: ['inventario'], icp: ['icp'], linhas: ['linhas', 'grupos'], transportes: ['transportes'], apoio: ['croqui', 'fit', 'desempenho', 'rocada', 'undia', 'binomio', 'cotacoes'], snv: ['snvRef'], gabarito: ['gabarito'] };
  const CHUNK = 1200;

  let db = null, user = null, assets = null, downloads = null, canWrite = true;
  let projetos = []; let PID = null; let S = null; let R = null; let VAL = []; let CMP = null;
  const dirty = new Set(); let saving = false; let saveTimer = null; let saveMsg = '';
  let biblioteca = []; let unsubBib = null;
  const ui = { filtro: '', origem: '', soComProblema: false, aDefinir: false, derivados: true, sentido: 'todos', valStatus: 'todos', precoBusca: '', linhasDestaque: null, abc: 'sd' };

  // ---------------- utilitários ----------------
  function toast(msg, ms) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, ms || 3200); }
  function setSave(msg) { saveMsg = msg; const el = $('#savestate'); if (el) el.textContent = msg; }
  function view() { const h = (location.hash || '').slice(1); return VIEWS.some(v => v[0] === h) ? h : 'painel'; }
  function recompute() {
    if (!S) { R = null; VAL = []; CMP = null; return; }
    try { R = E.compute(S); VAL = E.validar(S, R); CMP = S.gabarito && S.gabarito.linhas ? E.comparar(S, R, S.gabarito) : null; }
    catch (e) { console.error(e); R = null; VAL = []; toast('Erro no cálculo: ' + e.message, 6000); }
  }
  function getPath(path) { const k = path.split('|'); let o = S; for (const p of k) { if (o == null) return undefined; o = o[p]; } return o; }
  function setPath(path, val) { const k = path.split('|'); let o = S; for (let i = 0; i < k.length - 1; i++) { if (o[k[i]] == null) o[k[i]] = {}; o = o[k[i]]; } o[k[k.length - 1]] = val; markDirty(PART_OF[k[0]] || 'projeto'); }
  function markDirty(part) { dirty.add(part); setSave('Alterações não salvas'); clearTimeout(saveTimer); saveTimer = setTimeout(salvar, 1500); }
  const parseNum = v => { if (typeof v === 'number') return v; const s = String(v).trim().replace(/\s/g, ''); if (s === '') return null; const t = /,\d+$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, ''); const x = Number(t); return isNaN(x) ? null : x; };

  // ---------------- persistência ----------------
  async function carregarLista() {
    if (!db) return;
    const snap = await db.collection('projetos').get();
    projetos = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
  }
  async function abrirProjeto(pid) {
    if (!db) return;
    const meta = projetos.find(p => p.id === pid); if (!meta) return;
    setSave('Abrindo projeto…');
    const st = {};
    const partes = meta.partes || Object.keys(PARTS);
    for (const p of partes) {
      if (p === 'precos') continue;
      const d = await db.doc('projetos/' + pid + '/partes/' + p).get(); if (d.exists) Object.assign(st, d.data());
    }
    st.precos = {};
    for (let i = 0; i < (meta.precosChunks || 1); i++) { const d = await db.doc('projetos/' + pid + '/partes/precos_' + i).get(); if (d.exists) Object.assign(st.precos, d.data().precos || {}); }
    st.cotacoes = st.cotacoes || []; st.justificativas = st.justificativas || {}; st.parametros = st.parametros || {};
    S = st; PID = pid; dirty.clear(); sset('pato.pid', pid); recompute(); setSave('Salvo');
  }
  async function salvar() {
    if (!S || !dirty.size) return;
    if (!db || !canWrite) { setSave(db ? 'Somente leitura: alterações ficam nesta tela' : 'Sem base conectada: alterações ficam nesta tela'); return; }
    if (saving) { clearTimeout(saveTimer); saveTimer = setTimeout(salvar, 800); return; }
    saving = true; setSave('Salvando…');
    const pend = [...dirty]; dirty.clear();
    try {
      let meta = projetos.find(p => p.id === PID) || {};
      for (const part of pend) {
        if (part === 'precos') {
          const codes = Object.keys(S.precos || {}); const n = Math.max(1, Math.ceil(codes.length / CHUNK));
          for (let i = 0; i < n; i++) { const o = {}; codes.slice(i * CHUNK, (i + 1) * CHUNK).forEach(c => o[c] = S.precos[c]); await db.doc('projetos/' + PID + '/partes/precos_' + i).set({ precos: o }); }
          for (let i = n; i < (meta.precosChunks || 0); i++) await db.doc('projetos/' + PID + '/partes/precos_' + i).delete();
          meta.precosChunks = n;
        } else {
          const o = {}; PARTS[part].forEach(k => { if (S[k] !== undefined) o[k] = S[k]; });
          await db.doc('projetos/' + PID + '/partes/' + part).set(JSON.parse(JSON.stringify(o)));
        }
      }
      const partes = [...new Set([...(meta.partes || []), ...Object.keys(PARTS).filter(p => PARTS[p].some(k => S[k] !== undefined))])];
      meta = { nome: S.projeto.nome || PID, rodovia: S.projeto.rodovia || '', segmento: S.projeto.segmento || '', partes, precosChunks: meta.precosChunks || 1, atualizadoEm: new Date().toISOString(), origem: meta.origem || '' };
      await db.doc('projetos/' + PID).set(meta);
      const i = projetos.findIndex(p => p.id === PID); if (i >= 0) projetos[i] = Object.assign({ id: PID }, meta); else projetos.push(Object.assign({ id: PID }, meta));
      setSave('Salvo às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      pend.forEach(p => dirty.add(p));
      if (e && e.code === 'invalid_argument') { canWrite = false; setSave('Sem permissão para salvar: alterações ficam nesta tela'); }
      else if (e && e.code === 'quota_exceeded') setSave('Base cheia: apague projetos antigos para salvar');
      else setSave('Não foi possível salvar agora. Nova tentativa em instantes.');
      if (!e || !['invalid_argument', 'quota_exceeded'].includes(e.code)) { clearTimeout(saveTimer); saveTimer = setTimeout(salvar, 5000); }
    } finally { saving = false; }
  }
  async function criarProjeto(estado, origem) {
    const base = (estado.projeto.rodovia + '-km' + String(estado.projeto.kmIni || 0).replace('.', '-') + '-' + String(estado.projeto.kmFim || 0).replace('.', '-')).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'projeto';
    let pid = base, k = 2; while (projetos.some(p => p.id === pid)) pid = base + '-' + (k++);
    S = estado; PID = pid; S.cotacoes = S.cotacoes || []; S.justificativas = S.justificativas || {};
    projetos.push({ id: pid, nome: S.projeto.nome, rodovia: S.projeto.rodovia, segmento: S.projeto.segmento, partes: Object.keys(PARTS), precosChunks: 1, origem });
    Object.keys(PARTS).forEach(p => dirty.add(p)); dirty.add('precos'); sset('pato.pid', pid);
    recompute(); await salvar(); render();
  }

  // ---------------- importação de arquivos ----------------
  function escolherArquivo(accept) {
    return new Promise(res => { const f = $('#filepick'); f.value = ''; f.accept = accept || '.xlsx,.xlsm,.xls,.csv'; f.onchange = () => res(f.files[0] || null); f.click(); });
  }
  async function lerPlanilha(file) {
    if (!window.XLSX) throw new Error('O leitor de planilhas não carregou. Recarregue a página.');
    const buf = await file.arrayBuffer();
    return XLSX.read(buf, { cellFormula: true, cellDates: true, type: 'array' });
  }
  const ACOES_IMPORT = {
    async pato() {
      const f = await escolherArquivo('.xlsx,.xlsm'); if (!f) return;
      toast('Lendo ' + f.name + '. Planilhas grandes levam alguns segundos.', 8000);
      await new Promise(r => setTimeout(r, 50));
      const wb = await lerPlanilha(f);
      const { estado, avisos } = IMP.importarPATO(wb, XLSX);
      estado.projeto.arquivoOrigem = f.name;
      await criarProjeto(estado, 'Importado de ' + f.name);
      location.hash = 'conferencia';
      toast('Projeto criado a partir de ' + f.name + (avisos.length ? '. ' + avisos.length + ' aviso(s) na importação.' : '.'), 6000);
    },
    async inventario() {
      const f = await escolherArquivo(); if (!f) return; const wb = await lerPlanilha(f);
      const itens = IMP.importarInventarioAvulso(wb, XLSX); let n = 0;
      Object.keys(itens).forEach(k => { if (!S.inventario[k]) S.inventario[k] = { rotulo: k, unidade: itens[k].unidade || '', grupo: 'Importado' }; S.inventario[k].valor = itens[k].valor; S.inventario[k].fonte = 'Importado de ' + f.name; n++; });
      markDirty('inventario'); recompute(); render(); toast(n + ' itens do inventário atualizados a partir de ' + f.name + '.');
    },
    async icp() {
      const f = await escolherArquivo(); if (!f) return; const wb = await lerPlanilha(f);
      const lev = IMP.importarICPAvulso(wb, XLSX); if (!lev.length) throw new Error('Nenhuma linha de levantamento encontrada.');
      S.icp.levantamento = lev; markDirty('icp'); recompute(); render(); toast(lev.length + ' trechos de levantamento importados de ' + f.name + '.');
    },
    async historico() {
      const f = await escolherArquivo(); if (!f) return; const wb = await lerPlanilha(f);
      const h = IMP.importarHistorico(wb, XLSX); const agg = {};
      h.forEach(x => { const id = (S.icp.regras.find(r => r.id === x.servico || r.servico.toUpperCase() === x.servico) || {}).id; if (!id) return; const a = agg[id] || (agg[id] = { valor: 0, contrato: [], medicao: [] }); a.valor += x.quantidade; if (x.contrato) a.contrato.push(x.contrato); if (x.medicao) a.medicao.push(x.medicao); });
      Object.keys(agg).forEach(id => { S.icp.historico[id] = { valor: Math.round(agg[id].valor * 1000) / 1000, contrato: [...new Set(agg[id].contrato)].join(', '), medicao: [...new Set(agg[id].medicao)].join(', '), memoria: 'Importado de ' + f.name, fonte: 'Importado' }; });
      markDirty('icp'); recompute(); render(); toast('Histórico atualizado para ' + Object.keys(agg).length + ' serviço(s).');
    },
    async snv() {
      const f = await escolherArquivo(); if (!f) return; const wb = await lerPlanilha(f);
      let ref = IMP.importarSNV(wb, XLSX);
      const br = String(S.projeto.rodovia || '').match(/\d{3}/); if (br) { const f2 = ref.filter(r => String(r.codigo).startsWith(br[0])); if (f2.length) ref = f2; }
      const uf = S.projeto.uf || 'MT'; const f3 = ref.filter(r => String(r.codigo).toUpperCase().includes('B' + uf)); if (f3.length) ref = f3;
      S.snvRef = ref; markDirty('snv'); recompute(); render(); toast(ref.length + ' segmentos do SNV carregados para conferência.');
    },
    async precos() { abrirImportPrecos(); },
    async cotacoes() {
      const f = await escolherArquivo(); if (!f) return; const wb = await lerPlanilha(f);
      const c = IMP.importarCotacoes(wb, XLSX); S.cotacoes = (S.cotacoes || []).concat(c.map(x => Object.assign(x, { fonte: f.name })));
      markDirty('apoio'); recompute(); render(); toast(c.length + ' cotações acrescentadas.');
    },
  };

  // ---------------- exportação ----------------
  async function exportarXLSX() {
    if (!downloads) { toast('O download de arquivos não está disponível nesta visualização.'); return; }
    const wb = XLSX.utils.book_new(); const P = S.projeto;
    const cab = [['MINISTÉRIO DOS TRANSPORTES'], ['DEPARTAMENTO NACIONAL DE INFRAESTRUTURA DE TRANSPORTES'], ['SUPERINTENDÊNCIA REGIONAL NO ESTADO DE ' + (P.uf === 'MT' ? 'MATO GROSSO' : P.uf || '')], [],
      ['RODOVIA:', P.rodovia], ['TRECHO:', P.trecho], ['SUBTRECHO:', P.subtrecho], ['SEGMENTO:', P.segmento], ['EXTENSÃO (km):', P.extensao], ['SNV:', P.snv + ' (versão ' + P.snvVersao + ')'], ['DATA-BASE:', P.dataBase], ['PRAZO (anos):', P.prazoAnos], []];
    const pato = cab.concat([['ITEM', 'ORIGEM', 'CÓDIGO', 'DISCRIMINAÇÃO', 'INVENTÁRIO', 'UND', 'NÍVEL DE ESFORÇO', 'UND/UND', 'QUANT. DE TRABALHO', 'UND', 'PREÇO UNIT. SEM DESONERAÇÃO', 'PARCIAL SEM DESONERAÇÃO', 'PREÇO UNIT. COM DESONERAÇÃO', 'PARCIAL COM DESONERAÇÃO']]);
    const grpTot = {}; R.resumo.forEach(g => grpTot[g.item] = g);
    R.ordem.forEach(o => {
      if (o.tipo === 'g') { const t = grpTot[o.item]; pato.push([o.item, '', '', o.titulo, '', '', '', '', '', '', '', t ? t.sd : '', '', t ? t.cd : '']); return; }
      const L = S.linhas.find(x => x.id === o.id), r = R.linhas[o.id];
      pato.push([L.item, L.origem, L.codigo, L.descricao || (S.precos[L.codigo] || {}).descricao, r.base, L.unidadeBase || '', r.fator, (L.unidade || '') + '/' + (L.unidadeBase || ''), r.qtd, L.unidade || '', r.puSD, r.sd, r.puCD, r.cd]);
    });
    pato.push([], ['', '', '', 'CONSERVAÇÃO RODOVIÁRIA', '', '', '', '', '', '', '', R.totais.conservaSD, '', R.totais.conservaCD], ['', '', '', 'DEMAIS SERVIÇOS DE MANUTENÇÃO (DSM)', '', '', '', '', '', '', '', R.totais.dsmSD, '', R.totais.dsmCD], ['', '', '', 'TOTAL GERAL DO ORÇAMENTO', '', '', '', '', '', '', '', R.totais.sd, '', R.totais.cd], ['', '', '', 'CONDIÇÃO MAIS VANTAJOSA', R.totais.condicao === 'sd' ? 'SEM DESONERAÇÃO' : 'COM DESONERAÇÃO']);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pato), 'PATO');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cab.concat([['ITEM', 'FAMÍLIA DE SERVIÇOS', 'SEM DESONERAÇÃO (R$)', '%', 'COM DESONERAÇÃO (R$)', '%']], R.resumo.map(g => [g.item, g.titulo, g.sd, g.pSD, g.cd, g.pCD]), [['', 'TOTAL', R.totais.sd, 1, R.totais.cd, 1]])), 'RESUMO');
    const ab = R.contrato[ui.abc];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cab.concat([['CÓDIGO', 'DISCRIMINAÇÃO', 'QUANT. CONTRATUAL', 'UND', 'PREÇO UNIT.', 'PARCIAL', '%', '% ACUM.', 'FAIXA']], ab.itens.map(i => [i.codigo, i.descricao, i.qtd, i.unidade, i.pu, i.total, i.p, i.acum, i.faixa]), [['', 'TOTAL', '', '', '', ab.total]])), 'CURVA_ABC');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['ID', 'REFERÊNCIA', 'VERIFICAÇÃO', 'SITUAÇÃO', 'DETALHE']].concat(VAL.map(v => [v.id, v.art, v.titulo, v.status.toUpperCase(), v.detalhe]))), 'VALIDACOES');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['ITEM', 'CÓDIGO', 'ORIGEM', 'MODO', 'EXPRESSÃO DA BASE', 'EXPRESSÃO DO FATOR', 'JUSTIFICATIVA', 'FÓRMULA NA PLANILHA DE ORIGEM (F)', '(H)', '(J)']].concat(S.linhas.map(L => [L.item, L.codigo, L.origem, L.modo === 'icp' ? 'ICP: ' + L.icpRegra : L.modo, L.baseExpr, L.fatorExpr, L.justificativa || '', (L.memoriaPlanilha || {}).F, (L.memoriaPlanilha || {}).H, (L.memoriaPlanilha || {}).J]))), 'MEMORIA');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['SERVIÇO', 'KM DE FAIXA', 'NÍVEL DE ESFORÇO', 'MULTIPLICADOR', 'CÁLCULO', 'HISTÓRICO', 'ADOTADO', 'CRITÉRIO', 'UND']].concat(S.icp.regras.map(rg => { const x = R.icp.regras[rg.id]; return [x.servico, x.km, x.ne, x.mult, x.calc, x.historico, x.adotado, x.criterio, x.unidade]; }))), 'ICP');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['CHAVE', 'ELEMENTO', 'VALOR', 'UND', 'FONTE']].concat(Object.keys(S.inventario).map(k => [k, S.inventario[k].rotulo, S.inventario[k].valor, S.inventario[k].unidade, S.inventario[k].fonte]))), 'INVENTARIO');
    const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    try { await downloads.save({ filename: 'PATO_' + (P.rodovia || '').replace(/\W+/g, '') + '_km' + P.kmIni + '_' + P.kmFim + '_gerado.xlsx', data: new Blob([out]) }); toast('Planilha enviada para download.'); }
    catch (e) { toast(e && e.code === 'declined' ? 'Download cancelado.' : 'Não foi possível baixar: ' + (e && e.message || e)); }
  }
  async function exportarJSON() {
    if (!downloads) { toast('O download de arquivos não está disponível nesta visualização.'); return; }
    try { await downloads.save({ filename: 'projeto_' + PID + '.json', data: JSON.stringify(S, null, 1) }); } catch (e) { if (e && e.code !== 'declined') toast('Não foi possível baixar: ' + e.message); }
  }

  // ---------------- componentes ----------------
  const pill = s => '<span class="pill ' + s + '">' + ({ ok: 'Atende', alerta: 'Atenção', erro: 'Não atende', info: 'Info' }[s] || s) + '</span>';
  const contagem = () => { const c = { ok: 0, alerta: 0, erro: 0 }; VAL.forEach(v => c[v.status] = (c[v.status] || 0) + 1); return c; };
  function navHTML() {
    const c = contagem(); const cur = view();
    let h = '', n = 0, sel = '';
    VIEWS.forEach(([id, nome]) => {
      if (id === 'sep') { h += '<div class="sep">' + esc(nome) + '</div>'; return; }
      n++;
      let dot = ''; if (id === 'validacoes' && S) dot = c.erro ? '<span class="dot bad">' + c.erro + '</span>' : c.alerta ? '<span class="dot warn">' + c.alerta + '</span>' : '';
      h += '<a href="#' + id + '"' + (cur === id ? ' aria-current="page"' : '') + '><span class="n">' + String(n).padStart(2, '0') + '</span>' + esc(nome) + dot + '</a>';
      sel += '<option value="' + id + '"' + (cur === id ? ' selected' : '') + '>' + esc(nome) + '</option>';
    });
    $('#nav').innerHTML = h; $('#mobnav').innerHTML = sel;
  }
  function topo(titulo, sub, acoes) {
    const opts = projetos.map(p => '<option value="' + esc(p.id) + '"' + (p.id === PID ? ' selected' : '') + '>' + esc(p.nome || p.id) + '</option>').join('');
    return '<div class="top"><div><div class="meta">' + (S ? esc(S.projeto.rodovia + ' · ' + S.projeto.segmento) : '') + '</div><h1>' + esc(titulo) + '</h1>' + (sub ? '<p class="muted">' + sub + '</p>' : '') + '</div><div class="row">' + (acoes || '') + '<button class="btn" data-act="novo">Novo PATO</button>' +
      (projetos.length > 1 ? '<label class="f">Projeto<select data-act="trocar">' + opts + '</select></label>' : '') + '</div></div>';
  }
  function semProjeto() {
    return topo('Nenhum projeto aberto') + '<div class="empty"><h2>Comece por uma planilha PATO</h2><p class="muted">Importe uma planilha no modelo da SR/MT (abas CAPA, PATO, BD, RESUMO_INVENT, ICP e CALCULO_ICP). O sistema lê inventário, ICP, transportes, preços e a própria planilha como gabarito de conferência.</p><div class="row" style="justify-content:center"><button class="btn pri" data-imp="pato">Importar planilha PATO (.xlsx)</button><button class="btn" data-act="novo">Criar um PATO do zero</button></div>' +
      (db ? '' : '<p class="note w">A base de projetos não está disponível nesta visualização. A importação funciona, mas os dados ficam só nesta tela.</p>') + '</div>';
  }

  // ---------------- telas ----------------
  const T = {};
  T.painel = () => {
    const P = S.projeto, t = R.totais, c = contagem();
    const prob = VAL.filter(v => v.status !== 'ok').sort((a, b) => (a.status === 'erro' ? 0 : 1) - (b.status === 'erro' ? 0 : 1));
    const ctr = R.contrato[t.condicao];
    const flow = [
      ['1', 'Inventário', Object.keys(S.inventario).length + ' elementos', '#inventario'],
      ['2', 'Quantificação', S.icp.levantamento.length + ' km levantados no ICP', '#icp'],
      ['3', 'Preço', Object.keys(S.precos).length + ' preços · ' + S.transportes.length + ' transportes', '#precos'],
      ['4', 'Planilha', S.linhas.length + ' linhas em ' + R.resumo.length + ' grupos', '#planilha'],
      ['5', 'Saídas', 'Resumo, curva ABC e contrato', '#saidas'],
    ];
    return topo(P.nome, esc((P.trecho || '') + (P.subtrecho ? ' · ' + P.subtrecho : '')), '<button class="btn" data-imp="pato">Importar outra planilha</button>') +
      '<div class="kpis">' +
      '<div class="kpi"><span>Orçamento anual sem desoneração</span><b>' + brl(t.sd) + '</b></div>' +
      '<div class="kpi"><span>Orçamento anual com desoneração</span><b>' + brl(t.cd) + '</b></div>' +
      '<div class="kpi"><span>Condição mais vantajosa</span><b>' + (t.condicao === 'sd' ? 'Sem desoneração' : 'Com desoneração') + '</b></div>' +
      '<div class="kpi"><span>Contrato · ' + P.prazoAnos + ' ano(s)</span><b>' + brl(ctr.total) + '</b></div>' +
      '<div class="kpi"><span>DSM sobre o orçamento</span><b>' + pct(t.pDSM) + '</b></div></div>' +
      '<div class="flow">' + flow.map(f => '<a class="st" href="' + f[3] + '" style="text-decoration:none;color:inherit"><span class="chip">Etapa ' + f[0] + '</span><b>' + f[1] + '</b><span>' + esc(f[2]) + '</span></a>').join('') + '</div>' +
      checklist() +
      '<div class="grid2"><div class="card"><div class="card-h"><h2>Pendências da Res. 8/2023</h2><span class="row">' + pill('erro') + ' ' + c.erro + ' ' + pill('alerta') + ' ' + c.alerta + ' ' + pill('ok') + ' ' + c.ok + '</span></div>' +
      (prob.length ? prob.slice(0, 8).map(v => '<div class="row" style="align-items:flex-start;flex-wrap:nowrap">' + pill(v.status) + '<div><b>' + esc(v.titulo) + '</b><div class="muted" style="font-size:.84rem">' + esc(v.detalhe) + '</div></div></div>').join('') : '<p class="muted">Nenhuma pendência.</p>') +
      '<a class="btn sm" href="#validacoes">Ver todas as ' + VAL.length + ' verificações</a></div>' +
      '<div class="card"><h2>Conferência com a planilha de origem</h2>' + (CMP ? '<div class="kpis"><div class="kpi"><span>Linhas iguais</span><b>' + CMP.linhasOk + ' de ' + CMP.linhasTotal + '</b></div><div class="kpi"><span>Total sem desoneração</span><b>' + (CMP.totais[0].ok ? 'Igual' : 'Diferente') + '</b></div></div>' +
        '<div class="bar"><i style="width:' + (CMP.linhasTotal ? 100 * CMP.linhasOk / CMP.linhasTotal : 0) + '%"></i></div>' +
        (CMP.subtotais.length ? '<p class="note w">A planilha de origem tem ' + CMP.subtotais.length + ' subtotal(is) que não fecha(m) com as próprias linhas. Diferença no item ' + esc(CMP.subtotais.map(s => s.item + ' (' + (s.condicao === 'sd' ? 'sem' : 'com') + ' desoneração): ' + brl(s.diferenca)).join('; ')) + '.</p>' : '') +
        '<a class="btn sm" href="#conferencia">Abrir a conferência</a>' : '<p class="muted">Este projeto não tem planilha de origem para comparar.</p>') +
      '<dl class="kv"><dt>SNV</dt><dd>' + esc(P.snv) + ' · versão ' + esc(P.snvVersao) + '</dd><dt>Data-base</dt><dd>' + esc(P.dataBase) + '</dd><dt>Unidade local</dt><dd>' + esc(P.unidadeLocal || '—') + '</dd><dt>Arquivo de origem</dt><dd>' + esc(P.arquivoOrigem || '—') + '</dd></dl></div></div>';
  };

  T.projeto = () => {
    const P = S.projeto; const f = (lab, path, type, extra) => '<label class="f">' + lab + '<input ' + (type === 'num' ? 'class="n" inputmode="decimal" style="width:100%;text-align:left"' : '') + ' type="' + (type === 'num' ? 'text' : type || 'text') + '" data-edit="' + path + '" data-type="' + (type || 'text') + '" value="' + esc(type === 'num' ? n3(getPath(path)) : getPath(path) || '') + '"' + (extra || '') + '></label>';
    const segs = (P.segmentos || []);
    const ref = S.snvRef || [];
    const conf = ref.length ? segs.map(s => { const o = ref.find(x => String(x.codigo).toUpperCase() === String(s.snv).toUpperCase()); const ok = o && Math.abs(o.kmIni - s.kmIni) < 0.05 && Math.abs(o.kmFim - s.kmFim) < 0.05; return '<tr><td class="mono">' + esc(s.snv) + '</td><td class="r num">' + n3(s.kmIni) + ' – ' + n3(s.kmFim) + '</td><td class="r num">' + (o ? n3(o.kmIni) + ' – ' + n3(o.kmFim) : '—') + '</td><td>' + esc(o ? o.superficie || '' : '') + '</td><td>' + pill(ok ? 'ok' : 'erro') + '</td></tr>'; }).join('') : '';
    const vizinhos = ref.length ? ref.filter(x => x.kmFim > P.kmIni && x.kmIni < P.kmFim && !segs.some(s => String(s.snv).toUpperCase() === String(x.codigo).toUpperCase())) : [];
    return topo('Projeto e SNV', 'Cabeçalho do plano de trabalho, segmentos do SNV e conferência com a versão vigente (art. 20 e art. 33, I, a).') +
      '<div class="card"><h2>Cabeçalho</h2><div class="form">' + f('Nome do projeto', 'projeto|nome') + f('Rodovia', 'projeto|rodovia') + f('Trecho', 'projeto|trecho') + f('Subtrecho', 'projeto|subtrecho') + f('Segmento', 'projeto|segmento') +
      f('km inicial', 'projeto|kmIni', 'num') + f('km final', 'projeto|kmFim', 'num') + f('Extensão (km)', 'projeto|extensao', 'num') + f('SNV', 'projeto|snv') + f('Versão do SNV', 'projeto|snvVersao') + f('Unidade local', 'projeto|unidadeLocal') +
      '<label class="f">Tipo de rodovia<select data-edit="projeto|tipo" data-type="text"><option value="pavimentada"' + (P.tipo === 'pavimentada' ? ' selected' : '') + '>Pavimentada</option><option value="nao-pavimentada"' + (P.tipo !== 'pavimentada' ? ' selected' : '') + '>Não pavimentada</option></select></label>' +
      f('Data-base (mês)', 'projeto|dataBase', 'month') + f('Início da licitação', 'projeto|aberturaLicitacao', 'date') + f('Prazo do contrato (anos)', 'projeto|prazoAnos', 'num') + f('Data do inventário', 'projeto|dataInventario', 'date') +
      f('Engenheiro supervisor (coef.)', 'adm|engenheiroCoef', 'num') + '</div><p class="note">O início da licitação decide a verificação do art. 22: a data-base pode ter no máximo 1 ano até essa data.</p></div>' +
      '<div class="card flat"><div class="card-h" style="padding:14px 16px 0"><h2>Segmentos do SNV</h2><div class="row"><button class="btn sm" data-act="addSeg">Acrescentar segmento</button><button class="btn sm" data-imp="snv">Importar planilha do SNV para conferir</button></div></div><div class="tbl short"><table><thead><tr><th>Código SNV</th><th>Tipo de pista</th><th class="r">km inicial</th><th class="r">km final</th><th>Revestimento</th><th class="r">Faixas</th><th class="r">Largura (m)</th><th></th></tr></thead><tbody>' +
      segs.map((s, i) => '<tr><td><input class="cell mono" data-edit="projeto|segmentos|' + i + '|snv" value="' + esc(s.snv) + '"></td><td><input class="cell" data-edit="projeto|segmentos|' + i + '|tipoPista" value="' + esc(s.tipoPista || '') + '"></td><td class="r"><input class="cell n" data-type="num" data-edit="projeto|segmentos|' + i + '|kmIni" value="' + n3(s.kmIni) + '"></td><td class="r"><input class="cell n" data-type="num" data-edit="projeto|segmentos|' + i + '|kmFim" value="' + n3(s.kmFim) + '"></td><td><input class="cell" data-edit="projeto|segmentos|' + i + '|revestimento" value="' + esc(s.revestimento || '') + '"></td><td class="r num">' + esc(s.faixas || '') + '</td><td class="r num">' + n2(s.largura) + '</td><td><button class="btn sm" data-act="delSeg" data-i="' + i + '">Remover</button></td></tr>').join('') +
      '</tbody></table></div></div>' +
      (ref.length ? '<div class="card flat"><div style="padding:14px 16px 0"><h2>Conferência com o SNV importado</h2><p class="muted">' + ref.length + ' segmentos carregados.</p></div><div class="tbl short"><table><thead><tr><th>Segmento</th><th class="r">km no projeto</th><th class="r">km no SNV</th><th>Superfície</th><th>Situação</th></tr></thead><tbody>' + conf + '</tbody></table></div>' +
        (vizinhos.length ? '<p class="note w" style="margin:12px 16px">Segmentos do SNV dentro do trecho que não estão no projeto: ' + esc(vizinhos.map(v => v.codigo + ' (km ' + v.kmIni + '–' + v.kmFim + ')').join('; ')) + '.</p>' : '') + '</div>'
        : '<p class="note">Para conferir códigos e quilometragem, baixe a planilha do SNV vigente na página <a href="https://www.gov.br/dnit/pt-br/assuntos/atlas-e-mapas/pnv-e-snv" target="_blank" rel="noopener">PNV e SNV</a> do DNIT e importe aqui.</p>');
  };

  T.inventario = () => {
    const inv = S.inventario; const usos = {};
    S.linhas.forEach(L => (String(L.baseExpr) + ' ' + String(L.fatorExpr)).replace(/inv\("([^"]+)"\)/g, (m, k) => { (usos[k] = usos[k] || []).push(L.item); }));
    (S.desempenho ? S.desempenho.linhas : []).forEach(l => String(l.qtdTotalExpr || '').replace(/inv\("([^"]+)"\)/g, (m, k) => { (usos[k] = usos[k] || []).push('GD'); }));
    const grupos = {}; Object.keys(inv).forEach(k => (grupos[inv[k].grupo || 'Outros'] = grupos[inv[k].grupo || 'Outros'] || []).push(k));
    return topo('Inventário', 'Elementos geradores de conservação (Anexos II e III). Os valores alimentam diretamente as quantidades da planilha e do grupo de desempenho.', '<button class="btn" data-imp="inventario">Importar inventário</button>') +
      '<p class="note">Aceita a aba RESUMO_INVENT (ou "RESUMO DO INVENTÁRIO") do modelo da SR/MT, ou uma tabela com as colunas chave, valor e unidade.</p>' +
      Object.keys(grupos).map(g => '<div class="card flat"><div style="padding:14px 16px 0"><h2>' + esc(g) + '</h2></div><div class="tbl short"><table><thead><tr><th>Elemento</th><th>Chave</th><th class="r">Valor</th><th>Und</th><th>Usado em</th><th>Fonte</th></tr></thead><tbody>' +
        grupos[g].map(k => '<tr><td>' + esc(inv[k].rotulo) + '</td><td class="mono">' + esc(k) + '</td><td class="r"><input class="cell n" data-type="num" data-edit="inventario|' + esc(k) + '|valor" value="' + n3(inv[k].valor) + '"></td><td>' + esc(inv[k].unidade) + '</td><td>' + (usos[k] ? usos[k].slice(0, 6).map(i => '<span class="chip">' + esc(i) + '</span>').join(' ') + (usos[k].length > 6 ? ' +' + (usos[k].length - 6) : '') : '<span class="muted">—</span>') + '</td><td class="muted" style="font-size:.78rem">' + esc(inv[k].fonte || '') + '</td></tr>').join('') + '</tbody></table></div></div>').join('');
  };

  T.icp = () => {
    const P = S.icp.parametros; const rg = R.icp.regras;
    const lev = R.icp.levantamento.filter(r => ui.sentido === 'todos' || r.sentido === ui.sentido);
    const resumo = {}; R.icp.levantamento.forEach(r => { const k = r.sentido; resumo[k] = resumo[k] || { BOM: 0, REGULAR: 0, RUIM: 0, 'PÉSSIMO': 0, km: 0 }; resumo[k][r.condicao] += r.ext; resumo[k].km += r.ext; });
    const intervs = [...new Set(S.icp.levantamento.flatMap(r => [r.intervPrim, r.intervSec]).filter(Boolean))];
    const sel = (i, campo, v) => '<select data-edit="icp|levantamento|' + i + '|' + campo + '"><option value=""></option>' + intervs.map(x => '<option' + (x === v ? ' selected' : '') + '>' + esc(x) + '</option>').join('') + '</select>';
    return topo('ICP e histórico', 'Quantidades de reparo, tapa-buraco, remendo, fresagem e microrrevestimento a partir do levantamento do pavimento (art. 19 e Anexo XXVII).', '<button class="btn" data-imp="icp">Importar levantamento</button><button class="btn" data-imp="historico">Importar histórico</button>') +
      '<p class="note">O ICM-Web é um sistema interno do DNIT e não pode ser consultado a partir desta página. Exporte o levantamento em planilha (colunas km inicial, km final, sentido, panela, remendo, trinca e intervenções) e importe aqui.</p>' +
      '<div class="card"><h2>Parâmetros</h2><div class="form"><label class="f">Método de soma das faixas<select data-edit="icp|parametros|metodo"><option value="planilha"' + (P.metodo === 'planilha' ? ' selected' : '') + '>Faixa crescente × multiplicador (como na planilha original)</option><option value="faixas"' + (P.metodo === 'faixas' ? ' selected' : '') + '>Soma das duas faixas levantadas</option></select></label>' +
      '<label class="f">Largura da faixa (m)<input class="n" style="width:100%;text-align:left" data-type="num" data-edit="icp|parametros|larguraFaixa" value="' + n3(P.larguraFaixa) + '"></label><label class="f">Multiplicador do método da planilha<input class="n" style="width:100%;text-align:left" data-type="num" data-edit="icp|parametros|fatorFaixas" value="' + n3(P.fatorFaixas) + '"></label></div></div>' +
      '<div class="card flat"><div style="padding:14px 16px 0"><h2>Regras de quantificação</h2><p class="muted">Quantidade adotada = maior valor entre o cálculo pelo ICP e o histórico executado.</p></div><div class="tbl short"><table><thead><tr><th>Serviço</th><th class="r">km de faixa</th><th class="r">Nível de esforço</th><th>Critério do NE</th><th class="r">Mult.</th><th class="r">Cálculo ICP</th><th class="r">Histórico</th><th>Contrato / medição do histórico</th><th class="r">Adotado</th><th>Origem</th></tr></thead><tbody>' +
      S.icp.regras.map(r => { const x = rg[r.id]; const h = S.icp.historico[r.id] || {}; return '<tr><td><b>' + esc(r.servico) + '</b></td><td class="r num">' + n3(x.km) + '</td><td class="r num">' + n3(x.ne) + ' ' + esc(r.unidade) + '/kmf</td><td class="muted" style="font-size:.8rem">' + esc(r.neFonte) + '</td><td class="r num">' + n3(x.mult) + '</td><td class="r num">' + n3(x.calc) + '</td><td class="r"><input class="cell n" data-type="num" data-edit="icp|historico|' + r.id + '|valor" value="' + n3(h.valor) + '"></td><td><input class="cell" placeholder="contrato" data-edit="icp|historico|' + r.id + '|contrato" value="' + esc(h.contrato || '') + '"><input class="cell" placeholder="medição/período" data-edit="icp|historico|' + r.id + '|medicao" value="' + esc(h.medicao || '') + '">' + (h.memoria && !h.contrato ? '<div class="mono muted" style="font-size:.7rem">' + esc(h.memoria) + '</div>' : '') + '</td><td class="r num"><b>' + n3(x.adotado) + '</b> ' + esc(r.unidade) + '</td><td><span class="chip">' + x.criterio + '</span></td></tr>'; }).join('') + '</tbody></table></div></div>' +
      '<div class="card flat"><div class="card-h" style="padding:14px 16px 0"><h2>Levantamento por km</h2><div class="tabs">' + [['todos', 'Todas'], ['C', 'Crescente'], ['D', 'Decrescente']].map(([k, l]) => '<button data-act="sentido" data-v="' + k + '" aria-pressed="' + (ui.sentido === k) + '">' + l + '</button>').join('') + '</div></div>' +
      '<div style="padding:0 16px" class="row">' + Object.keys(resumo).map(k => '<span class="muted">' + (k === 'C' ? 'Crescente' : 'Decrescente') + ': ' + n3(resumo[k].km) + ' km · bom ' + n3(resumo[k].BOM) + ' · regular ' + n3(resumo[k].REGULAR) + ' · ruim ' + n3(resumo[k].RUIM) + ' · péssimo ' + n3(resumo[k]['PÉSSIMO']) + '</span>').join('') + '</div>' +
      '<div class="tbl"><table><thead><tr><th>Sentido</th><th class="r">km</th><th>Panela</th><th>Remendo</th><th>Trinca</th><th class="r">ICP</th><th>Condição</th><th>Intervenção primária</th><th>Intervenção secundária</th></tr></thead><tbody>' +
      lev.map(r => { const i = S.icp.levantamento.findIndex(x => x.kmIni === r.kmIni && x.kmFim === r.kmFim && x.sentido === r.sentido); return '<tr><td>' + (r.sentido === 'C' ? 'Cresc.' : 'Decr.') + '</td><td class="r num">' + n3(r.kmIni) + ' – ' + n3(r.kmFim) + '</td><td>' + r.panela + '</td><td>' + r.remendo + '</td><td>' + r.trinca + '</td><td class="r num">' + n3(r.icp) + '</td><td>' + r.condicao + '</td><td>' + sel(i, 'intervPrim', r.intervPrim) + '</td><td>' + sel(i, 'intervSec', r.intervSec) + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
  };

  function linhaFlags() { const f = {}; VAL.forEach(v => { if (v.status !== 'ok') (v.ref || []).forEach(id => (f[id] = f[id] || []).push(v.id)); }); return f; }
  T.planilha = () => {
    const flags = linhaFlags(); const q = ui.filtro.trim().toUpperCase();
    const origens = [...new Set(S.linhas.map(L => L.origem).filter(Boolean))].sort();
    const grpTot = {}; R.resumo.forEach(g => grpTot[g.item] = g);
    let body = '';
    R.ordem.forEach(o => {
      if (o.tipo === 'g') {
        if (q || ui.origem || ui.soComProblema || ui.aDefinir) return;
        const t = grpTot[o.item];
        body += '<tr class="' + (o.nivel === 1 ? 'g1' : 'g') + '"><td>' + esc(o.item) + '</td><td colspan="9">' + esc(o.titulo) + '</td><td class="r num">' + (t ? n2(t.sd) : '') + '</td><td></td><td class="r num">' + (t ? n2(t.cd) : '') + '</td></tr>';
        return;
      }
      const L = S.linhas.find(x => x.id === o.id), r = R.linhas[o.id];
      const depth = L.item.split('.').length;
      if (!ui.derivados && depth > 3 && !q) return;
      if (q && !(L.item + ' ' + L.codigo + ' ' + (L.descricao || '')).toUpperCase().includes(q)) return;
      if (ui.origem && L.origem !== ui.origem) return;
      if (ui.soComProblema && !flags[L.id] && !r.erro && !r.semPreco) return;
      if (ui.aDefinir && !(L.aPreencher && !r.base)) return;
      if (ui.linhasDestaque && !ui.linhasDestaque.includes(L.id)) return;
      body += '<tr class="clk ' + (depth > 3 ? (depth > 4 ? 'sub2' : 'sub') : '') + (flags[L.id] || r.erro ? ' hl' : '') + '" data-act="linha" data-id="' + L.id + '"><td class="mono">' + esc(L.item) + '</td><td><span class="chip">' + esc(L.origem || '—') + '</span></td><td class="mono">' + esc(L.codigo) + '</td><td class="desc">' + esc(L.descricao || (S.precos[L.codigo] || {}).descricao || '') + (flags[L.id] ? ' <span class="pill alerta">' + flags[L.id].join(' ') + '</span>' : '') + (r.erro ? ' <span class="pill erro">erro</span>' : '') + (L.aPreencher && !r.base ? ' <span class="pill erro">a definir</span>' : '') + '</td>' +
        '<td class="r num">' + n3(r.base) + '</td><td>' + esc(L.unidadeBase || '') + '</td><td class="r num">' + n3(r.fator) + '</td><td class="r num"><b>' + n3(r.qtd) + '</b></td><td>' + esc(L.unidade || '') + '</td><td class="r num">' + n2(r.puSD) + '</td><td class="r num">' + n2(r.sd) + '</td><td class="r num">' + n2(r.puCD) + '</td><td class="r num">' + n2(r.cd) + '</td></tr>';
    });
    const t = R.totais;
    return topo('Planilha PATO', 'Quantidades de 12 meses com preços sem e com desoneração (art. 33, j, r e s; art. 41). Clique numa linha para ver a memória de cálculo e editar.') +
      (ui.linhasDestaque ? '<p class="note w">Mostrando só as linhas apontadas pela verificação. <button class="btn sm" data-act="limparDestaque">Mostrar todas</button></p>' : '') +
      '<div class="row"><input type="search" placeholder="Buscar item, código ou serviço" data-ui="filtro" value="' + esc(ui.filtro) + '" style="min-width:240px"><select data-ui="origem"><option value="">Todas as origens</option>' + origens.map(o => '<option' + (ui.origem === o ? ' selected' : '') + '>' + esc(o) + '</option>').join('') + '</select>' +
      '<label class="row"><input type="checkbox" data-ui="derivados"' + (ui.derivados ? ' checked' : '') + '> Insumos derivados</label><label class="row"><input type="checkbox" data-ui="soComProblema"' + (ui.soComProblema ? ' checked' : '') + '> Só linhas com apontamento</label>' + (S.linhas.some(L => L.aPreencher) ? '<label class="row"><input type="checkbox" data-ui="aDefinir"' + (ui.aDefinir ? ' checked' : '') + '> Só quantidades a definir</label>' : '') + '<span style="flex:1"></span><button class="btn sm" data-act="addLinha">Acrescentar serviço</button><button class="btn sm" data-act="addDSM">Acrescentar grupo de DSM</button></div>' +
      '<div class="card flat"><div class="tbl"><table><thead><tr><th>Item</th><th>Origem</th><th>Código</th><th>Discriminação</th><th class="r">Inventário</th><th>Und</th><th class="r">Nível de esforço</th><th class="r">Quantidade</th><th>Und</th><th class="r">PU sem deson.</th><th class="r">Parcial sem deson.</th><th class="r">PU com deson.</th><th class="r">Parcial com deson.</th></tr></thead><tbody>' + body + '</tbody></table></div></div>' +
      '<div class="kpis"><div class="kpi"><span>Conservação rodoviária</span><b>' + brl(t.conservaSD) + '</b><span>' + brl(t.conservaCD) + ' com desoneração</span></div><div class="kpi"><span>DSM</span><b>' + brl(t.dsmSD) + '</b><span>' + brl(t.dsmCD) + ' com desoneração</span></div><div class="kpi"><span>Total geral</span><b>' + brl(t.sd) + '</b><span>' + brl(t.cd) + ' com desoneração</span></div></div>';
  };

  function abrirLinha(id) {
    const L = S.linhas.find(x => x.id === id), r = R.linhas[id]; const g = CMP && S.gabarito.linhas[id];
    const p = S.precos[L.codigo] || {};
    const vs = VAL.filter(v => (v.ref || []).includes(id) && v.status !== 'ok');
    $('#drawer').innerHTML = '<div class="overlay" data-act="fechar"><div class="drawer" role="dialog" aria-label="Linha ' + esc(L.item) + '" data-stop="1">' +
      '<div class="card-h"><div><span class="chip">' + esc(L.item) + '</span> <span class="chip">' + esc(L.codigo) + '</span><h2 style="margin-top:6px">' + esc(L.descricao || p.descricao || '') + '</h2></div><button class="btn sm" data-act="fechar">Fechar</button></div>' +
      vs.map(v => '<p class="note w"><b>' + esc(v.id + ' · ' + v.titulo) + '</b><br>' + esc(v.detalhe) + '</p>').join('') +
      '<dl class="kv"><dt>Base</dt><dd class="num">' + n3(r.base) + ' ' + esc(L.unidadeBase || '') + '</dd><dt>Fator</dt><dd class="num">' + n3(r.fator) + '</dd><dt>Quantidade</dt><dd class="num"><b>' + n3(r.qtd) + ' ' + esc(L.unidade || '') + '</b> (' + (L.modo === 'icp' ? 'regra do ICP ' + esc(L.icpRegra) : (L.modo === 'round' ? 'arredondada' : 'truncada') + ' em ' + (L.casas == null ? 3 : L.casas) + ' casas') + ')</dd>' +
      '<dt>Preço sem desoneração</dt><dd class="num">' + n2(r.puSD) + ' → ' + brl(r.sd) + '</dd><dt>Preço com desoneração</dt><dd class="num">' + n2(r.puCD) + ' → ' + brl(r.cd) + '</dd><dt>Fonte do preço</dt><dd>' + esc(p.fonte || (L.codigo === 'GD' ? 'Grupo de desempenho (calculado)' : '—')) + '</dd>' +
      (g ? '<dt>Planilha de origem</dt><dd class="num">' + n3(g.qtd) + ' · ' + brl(g.sd) + ' · ' + brl(g.cd) + '</dd>' : '') + '</dl>' +
      '<div class="card"><h3>Memória de cálculo</h3>' +
      '<label class="f">Origem da quantidade<input data-l="origem" value="' + esc(L.origem || '') + '" list="origens"></label><datalist id="origens">' + ['INVENTÁRIO', 'ICP', 'HISTÓRICO', 'SICRO', 'PROD SICRO', 'RESOLUÇÃO', 'NOTA TÉCNICA', 'ESTIMATIVA', 'MANUAL', 'SMT', 'PRAZO PATO'].map(o => '<option value="' + o + '">').join('') + '</datalist>' +
      (L.sugestao ? '<p class="note">Quantidade no modelo de origem: <span class="mono">' + esc(L.sugestao) + '</span>. Informe a memória de cálculo deste trecho. <button class="btn sm" data-act="usarSug" data-id="' + id + '">Usar a do modelo</button></p>' : '') +
      '<label class="f">Expressão da base<textarea rows="2" data-l="baseExpr">' + esc(L.baseExpr) + '</textarea></label>' +
      (L.modo === 'icp' ? '<p class="note">A quantidade vem da regra ' + esc(L.icpRegra) + ' na tela ICP e histórico. O fator mostrado é a quantidade dividida pela base.</p>' : '<label class="f">Expressão do fator (nível de esforço ou taxa)<textarea rows="2" data-l="fatorExpr">' + esc(L.fatorExpr) + '</textarea></label>') +
      '<label class="f">Justificativa técnica (art. 18 e art. 24)<textarea rows="3" data-l="justificativa" style="font-family:var(--f-body)">' + esc(L.justificativa || '') + '</textarea></label>' +
      '<div class="row"><button class="btn pri" data-act="salvarLinha" data-id="' + id + '">Aplicar</button><button class="btn" data-act="delLinha" data-id="' + id + '">Excluir linha</button><span class="muted" id="lerr"></span></div>' +
      '<details><summary>Como escrever as expressões</summary><ul style="margin:6px 0 0;padding-left:18px;font-size:.84rem;display:grid;gap:2px"><li><span class="mono">inv("pista_CA")</span> valor do inventário</li><li><span class="mono">qtd("L21")</span>, <span class="mono">base("L21")</span>, <span class="mono">fator("L21")</span> outra linha</li><li><span class="mono">icp("RP")</span> quantidade adotada pelo ICP; <span class="mono">icpKm("RP")</span> km de faixa</li><li><span class="mono">transp("…")</span> momento de transporte; <span class="mono">undia("CONSERVA",codigo)</span> sinalização de obras</li><li>Variáveis: <span class="mono">ext</span>, <span class="mono">prazo</span>, <span class="mono">PI</span>, <span class="mono">neRocada</span>; operadores + − × ÷ ^ e parênteses</li></ul></details>' +
      (L.memoriaPlanilha ? '<details><summary>Fórmulas na planilha de origem</summary><dl class="kv mono" style="font-size:.76rem;margin-top:6px"><dt>F</dt><dd>' + esc(L.memoriaPlanilha.F) + '</dd><dt>H</dt><dd>' + esc(L.memoriaPlanilha.H) + '</dd><dt>J</dt><dd>' + esc(L.memoriaPlanilha.J) + '</dd></dl></details>' : '') + '</div></div></div>';
  }

  T.transportes = () => {
    const fit = Object.values(R.fit);
    const blocos = Object.values(R.transportes);
    const croq = Object.keys(S.croqui);
    return topo('Transportes e DMT', 'Croqui de ocorrências (Anexo IX), fator de interferência de tráfego (Anexo VI) e momentos de transporte (Anexo VIII).') +
      '<div class="card flat"><div style="padding:14px 16px 0"><h2>Croqui de ocorrências e DMT</h2><p class="muted">LN leito natural · RP revestimento primário · P pavimentada (total) · Pu trecho urbano. A parcela rural é P − Pu.</p></div><div class="tbl"><table><thead><tr><th>Material</th><th>Origem</th><th>Destino</th><th class="r">LN</th><th class="r">RP</th><th class="r">P</th><th class="r">Pu</th></tr></thead><tbody>' +
      croq.map(k => { const c = S.croqui[k]; const inp = col => '<td class="r"><input class="cell n" data-type="num" data-edit="croqui|' + esc(k) + '|' + col + '" value="' + n3(c[col]) + '"></td>'; return '<tr><td>' + esc(c.material) + '</td><td>' + esc(c.origem) + '</td><td>' + esc(c.destino) + '</td>' + inp('LN') + inp('RP') + inp('P') + inp('Pu') + '</tr>'; }).join('') + '</tbody></table></div></div>' +
      '<div class="card flat"><div style="padding:14px 16px 0"><h2>Fator de interferência de tráfego</h2><p class="muted">FIT = 1 + (A1 + A2) ÷ (DMTp × 60), com A1 = 70 + 0,0035 × VMDf e A2 = 60 × DMTu.</p></div><div class="tbl short"><table><thead><tr><th>Frente</th><th>Código</th><th>Insumo e percurso</th><th class="r">VMDf</th><th class="r">DMTp</th><th class="r">DMTu</th><th class="r">A1</th><th class="r">A2</th><th class="r">FIT</th></tr></thead><tbody>' +
      S.fit.map((f, i) => { const x = R.fit[f.frente + '|' + String(f.chave).trim().toUpperCase()] || {}; return '<tr><td>' + esc(f.frente) + '</td><td class="mono">' + esc(f.codigo) + '</td><td>' + esc(f.chave) + '</td><td class="r"><input class="cell n" data-type="num" data-edit="fit|' + i + '|vmdf" value="' + n3(f.vmdf) + '"></td><td class="r num">' + n3(x.dmtp) + '</td><td class="r num">' + n3(x.dmtu) + '</td><td class="r num">' + n3(x.a1) + '</td><td class="r num">' + n3(x.a2) + '</td><td class="r num"><b>' + (x.fit ? x.fit.toLocaleString('pt-BR', { maximumFractionDigits: 4 }) : '—') + '</b></td></tr>'; }).join('') + '</tbody></table></div></div>' +
      blocos.map(b => '<details class="card"><summary>' + esc(b.frente) + ' · ' + esc(b.codigo) + ' · ' + esc(b.descricao || '') + ' — <span class="num">' + n3(b.total) + ' tkm</span></summary><div class="tbl short" style="margin-top:8px"><table><thead><tr><th>Serviço</th><th>Material</th><th>Percurso</th><th class="r">Quantidade</th><th class="r">Consumo (t/und)</th><th class="r">DMT</th><th class="r">FIT</th><th class="r">Momento (tkm)</th></tr></thead><tbody>' +
        b.linhas.map(l => '<tr' + (l.semCroqui ? ' class="hl"' : '') + '><td class="mono">' + esc(l.servico) + '</td><td>' + esc(l.material) + '</td><td>' + esc(l.origem + ' → ' + l.destino) + '</td><td class="r num">' + n3(l.qtd) + '</td><td class="r num">' + l.consumo.toLocaleString('pt-BR', { maximumFractionDigits: 5 }) + '</td><td class="r num">' + n3(l.dmt) + '</td><td class="r num">' + l.fit.toLocaleString('pt-BR', { maximumFractionDigits: 4 }) + '</td><td class="r num">' + n3(l.momento) + '</td></tr>').join('') + '</tbody></table></div></details>').join('');
  };

  T.precos = () => {
    const usados = new Set(S.linhas.map(L => L.codigo)); const q = ui.precoBusca.trim().toUpperCase();
    const cod = Object.keys(S.precos).filter(c => !q || (c + ' ' + (S.precos[c].descricao || '')).toUpperCase().includes(q)).sort((a, b) => (usados.has(b) - usados.has(a)) || a.localeCompare(b));
    return topo('Preços e cotações', 'Banco de preços (SICRO), binômio de materiais betuminosos (art. 46) e cotações de pétreos e areia (art. 45).', '<button class="btn" data-imp="precos">Importar preços</button><button class="btn" data-imp="cotacoes">Importar cotações</button>') +
      '<p class="note">Os preços aceitam a aba BD do modelo ou uma tabela com código, descrição, unidade, preço sem desoneração e com desoneração (por exemplo, o relatório sintético do SICRO para MT).</p>' +
      '<div class="card flat"><div class="card-h" style="padding:14px 16px 0"><h2>Banco de preços</h2><input type="search" data-ui="precoBusca" placeholder="Buscar código ou descrição" value="' + esc(ui.precoBusca) + '"></div><div class="tbl"><table><thead><tr><th>Código</th><th>Descrição</th><th>Und</th><th class="r">Sem desoneração</th><th class="r">Com desoneração</th><th>Fonte</th><th>Uso</th></tr></thead><tbody>' +
      cod.slice(0, 400).map(c => { const p = S.precos[c]; return '<tr><td class="mono">' + esc(c) + '</td><td>' + esc(p.descricao) + '</td><td>' + esc(p.unidade) + '</td><td class="r"><input class="cell n" data-type="num" data-edit="precos|' + esc(c) + '|sd" value="' + n2(p.sd) + '"></td><td class="r"><input class="cell n" data-type="num" data-edit="precos|' + esc(c) + '|cd" value="' + n2(p.cd) + '"></td><td class="muted" style="font-size:.78rem">' + esc(p.fonte) + '</td><td>' + (usados.has(c) ? '<span class="chip">na planilha</span>' : '') + '</td></tr>'; }).join('') +
      (cod.length > 400 ? '<tr><td colspan="7" class="muted">Mostrando 400 de ' + cod.length + '. Use a busca.</td></tr>' : '') + '</tbody></table></div></div>' +
      '<div class="card flat"><div style="padding:14px 16px 0"><h2>Binômio de materiais betuminosos</h2><p class="muted">Portaria DNIT nº 1.977/2017: o orçamento adota a origem de menor custo total (aquisição + transporte, com BDI).</p></div><div class="tbl short"><table><thead><tr><th>Material</th><th>Origem</th><th>Local</th><th class="r">Aquisição (R$/t)</th><th class="r">Transporte (R$/t)</th><th class="r">Total (R$/t)</th><th></th></tr></thead><tbody>' +
      S.binomio.map(b => { const tot = o => (o.aquisicao || 0) + (o.transporte || 0); const min = Math.min(...b.origens.map(tot)); return b.origens.map((o, i) => '<tr><td>' + (i === 0 ? '<b>' + esc(b.material) + '</b>' : '') + '</td><td class="mono">' + esc(o.origem) + '</td><td>' + esc(o.local + '/' + o.uf) + '</td><td class="r num">' + n2(o.aquisicao) + '</td><td class="r num">' + n2(o.transporte) + '</td><td class="r num">' + n2(tot(o)) + '</td><td>' + (tot(o) === min ? '<span class="pill ok">Menor custo</span>' : '') + '</td></tr>').join(''); }).join('') + '</tbody></table></div></div>' +
      cotacoesHTML();
  };
  function cotacoesHTML() {
    const mats = [...new Set(Object.values(S.croqui || {}).map(c => c.material).filter(Boolean))];
    return '<div class="card flat"><div style="padding:14px 16px 0"><h2>Cotações de pétreos e areia</h2><p class="muted">Registre ao menos uma cotação por material com a distância até a pista. "Usar no croqui" leva a DMT da cotação para o croqui de ocorrências.</p></div>' +
      '<div class="form" style="padding:0 16px"><label class="f">Material<input id="cMat" list="cMats"></label><datalist id="cMats">' + mats.map(m => '<option value="' + esc(m) + '">').join('') + '</datalist><label class="f">Fornecedor<input id="cForn"></label><label class="f">Município<input id="cMun"></label><label class="f">Preço<input id="cPreco" inputmode="decimal"></label><label class="f">Und<input id="cUn" value="t"></label><label class="f">Data<input id="cData" type="date"></label><label class="f">DMT pavimentada (km)<input id="cDp" inputmode="decimal"></label><label class="f">DMT não pavimentada (km)<input id="cDn" inputmode="decimal"></label></div>' +
      '<div class="row" style="padding:0 16px"><button class="btn pri" data-act="addCot">Acrescentar cotação</button></div>' +
      '<div class="tbl short"><table><thead><tr><th>Material</th><th>Fornecedor</th><th>Município</th><th class="r">Preço</th><th>Und</th><th>Data</th><th class="r">DMT pav.</th><th class="r">DMT não pav.</th><th>Fonte</th><th></th></tr></thead><tbody>' +
      ((S.cotacoes || []).length ? S.cotacoes.map((c, i) => '<tr><td>' + esc(c.material) + '</td><td>' + esc(c.fornecedor) + '</td><td>' + esc(c.municipio || '') + '</td><td class="r num">' + n2(c.preco) + '</td><td>' + esc(c.unidade) + '</td><td>' + esc(c.data) + '</td><td class="r num">' + n3(c.dmtPav) + '</td><td class="r num">' + n3(c.dmtNaoPav) + '</td><td class="muted" style="font-size:.78rem">' + esc(c.fonte || '') + '</td><td class="row" style="flex-wrap:nowrap"><button class="btn sm" data-act="cotCroqui" data-i="' + i + '">Usar no croqui</button><button class="btn sm" data-act="delCot" data-i="' + i + '">Remover</button></td></tr>').join('') : '<tr><td colspan="10" class="muted">Nenhuma cotação registrada.</td></tr>') + '</tbody></table></div></div>';
  }

  T.validacoes = () => {
    const c = contagem(); const lst = VAL.filter(v => ui.valStatus === 'todos' || v.status === ui.valStatus);
    return topo('Validações', 'Cada verificação aponta o artigo da Res. DNIT nº 8/2023 e as linhas afetadas. O resultado muda assim que um dado é corrigido.') +
      '<div class="tabs">' + [['todos', 'Todas (' + VAL.length + ')'], ['erro', 'Não atende (' + c.erro + ')'], ['alerta', 'Atenção (' + c.alerta + ')'], ['ok', 'Atende (' + c.ok + ')']].map(([k, l]) => '<button data-act="valStatus" data-v="' + k + '" aria-pressed="' + (ui.valStatus === k) + '">' + l + '</button>').join('') + '</div>' +
      '<div class="card flat">' + lst.map(v => '<div class="rule">' + pill(v.status) + '<div class="art">' + esc(v.id + ' · ' + v.art) + '</div><h3>' + esc(v.titulo) + '</h3><p>' + esc(v.detalhe) + (v.ref && v.ref.length ? ' <button class="btn sm" data-act="verLinhas" data-ids="' + esc(v.ref.join(',')) + '">Ver ' + v.ref.length + ' linha(s)</button>' : '') + '</p></div>').join('') + '</div>';
  };

  T.conferencia = () => {
    if (!CMP) return topo('Conferência') + '<div class="empty"><h2>Sem planilha de origem</h2><p class="muted">Projetos criados a partir de uma planilha PATO guardam os valores dela para conferir o cálculo.</p></div>';
    const byId = {}; S.linhas.forEach(L => byId[L.id] = L);
    return topo('Conferência com a planilha de origem', 'O motor recalcula todas as linhas a partir dos dados de entrada e compara com os valores gravados na planilha original. É o critério de aceite do sistema.') +
      '<div class="kpis"><div class="kpi"><span>Linhas iguais à planilha</span><b>' + CMP.linhasOk + ' de ' + CMP.linhasTotal + '</b></div>' + CMP.totais.map(t => '<div class="kpi"><span>' + esc(t.nome) + '</span><b>' + (t.ok ? 'Igual' : 'Diferente') + '</b><span class="num">' + brl(t.obtido) + '</span></div>').join('') + '</div>' +
      '<div class="card flat"><div style="padding:14px 16px 0"><h2>Totais</h2></div><div class="tbl short"><table><thead><tr><th>Total</th><th class="r">Planilha de origem</th><th class="r">Sistema</th><th class="r">Diferença</th><th></th></tr></thead><tbody>' +
      CMP.totais.map(t => '<tr><td>' + esc(t.nome) + '</td><td class="r num">' + n2(t.esperado) + '</td><td class="r num">' + n2(t.obtido) + '</td><td class="r num">' + n2(t.obtido - t.esperado) + '</td><td>' + pill(t.ok ? 'ok' : 'alerta') + '</td></tr>').join('') +
      (S.gabarito.totais.contratoSD ? (() => { const ct = E.compute(S, { dsmNoPrazo: true }).contrato.sd.total; return '<tr><td>Planilha contratual (' + S.projeto.prazoAnos + ' anos), no mesmo critério da origem</td><td class="r num">' + n2(S.gabarito.totais.contratoSD) + '</td><td class="r num">' + n2(ct) + '</td><td class="r num">' + n2(ct - S.gabarito.totais.contratoSD) + '</td><td>' + pill(Math.abs(ct - S.gabarito.totais.contratoSD) < 0.05 ? 'ok' : 'alerta') + '</td></tr>'; })() : '') + '</tbody></table></div></div>' +
      (CMP.subtotais.length ? '<div class="card"><h2>Subtotais da planilha de origem que não fecham</h2><p class="muted">As linhas batem uma a uma, mas o subtotal gravado na planilha não é a soma delas. O sistema usa a soma correta.</p><div class="tbl short"><table><thead><tr><th>Grupo</th><th>Condição</th><th class="r">Soma das linhas</th><th class="r">Subtotal na planilha</th><th class="r">Diferença</th></tr></thead><tbody>' +
        CMP.subtotais.map(s => '<tr><td>' + esc(s.item + ' · ' + s.titulo) + '</td><td>' + (s.condicao === 'sd' ? 'Sem desoneração' : 'Com desoneração') + '</td><td class="r num">' + n2(s.somaLinhas) + '</td><td class="r num">' + n2(s.subtotalPlanilha) + '</td><td class="r num"><b>' + n2(s.diferenca) + '</b></td></tr>').join('') + '</tbody></table></div></div>' : '') +
      '<div class="card flat"><div style="padding:14px 16px 0"><h2>Linhas com diferença</h2></div>' + (CMP.diffs.length ? '<div class="tbl short"><table><thead><tr><th>Item</th><th>Código</th><th>Campo</th><th class="r">Planilha</th><th class="r">Sistema</th></tr></thead><tbody>' + CMP.diffs.map(d => '<tr class="clk" data-act="linha" data-id="' + d.id + '"><td class="mono">' + esc(byId[d.id] ? byId[d.id].item : d.id) + '</td><td class="mono">' + esc(byId[d.id] ? byId[d.id].codigo : '') + '</td><td>' + esc({ qtd: 'Quantidade', sd: 'Parcial sem desoneração', cd: 'Parcial com desoneração' }[d.campo] || d.campo) + '</td><td class="r num">' + n3(d.esperado) + '</td><td class="r num">' + n3(d.obtido) + '</td></tr>').join('') + '</tbody></table></div>' : '<p class="muted" style="padding:0 16px 16px">Nenhuma. Todas as quantidades e parciais conferem com a planilha.</p>') + '</div>';
  };

  T.saidas = () => {
    const t = R.totais; const ab = R.contrato[ui.abc]; const dob = !!S.parametros.dsmMultiplicaPrazo;
    return topo('Saídas e exportação', 'Resumo do PATO, curva ABC (Anexo XXI) e planilha contratual para o prazo do contrato.', '<button class="btn pri" data-act="xlsx">Baixar planilha (.xlsx)</button><button class="btn" data-act="json">Baixar dados do projeto (.json)</button>') +
      '<div class="card flat"><div style="padding:14px 16px 0"><h2>Resumo do plano anual de trabalho e orçamento</h2></div><div class="tbl short"><table><thead><tr><th>Item</th><th>Família de serviços</th><th class="r">Sem desoneração</th><th class="r">%</th><th class="r">Com desoneração</th><th class="r">%</th></tr></thead><tbody>' +
      R.resumo.map(g => '<tr><td class="mono">' + esc(g.item) + '</td><td>' + esc(g.titulo) + '</td><td class="r num">' + n2(g.sd) + '</td><td class="r num">' + pct(g.pSD) + '</td><td class="r num">' + n2(g.cd) + '</td><td class="r num">' + pct(g.pCD) + '</td></tr>').join('') +
      '<tr class="g"><td></td><td>Total do PATO (12 meses)</td><td class="r num">' + n2(t.sd) + '</td><td class="r num">100%</td><td class="r num">' + n2(t.cd) + '</td><td class="r num">100%</td></tr></tbody></table></div></div>' +
      '<div class="card"><div class="card-h"><h2>Planilha contratual · ' + S.projeto.prazoAnos + ' ano(s)</h2><label class="row"><input type="checkbox" data-edit="parametros|dsmMultiplicaPrazo" data-type="bool"' + (dob ? ' checked' : '') + '> Multiplicar também os DSM pelo prazo (como na planilha original)</label></div>' +
      '<div class="kpis"><div class="kpi"><span>Contrato sem desoneração</span><b>' + brl(R.contrato.sd.total) + '</b></div><div class="kpi"><span>Contrato com desoneração</span><b>' + brl(R.contrato.cd.total) + '</b></div><div class="kpi"><span>Efeito de repetir os DSM</span><b>' + brl(R.contrato.difDSM[t.condicao]) + '</b></div></div>' +
      '<p class="note' + (dob ? ' w' : '') + '">' + (dob ? 'Os DSM são obras pontuais e não têm natureza continuada (art. 9º, § 3º). Multiplicá-los pelo prazo repete essas obras no segundo ano.' : 'Conservação multiplicada pelo prazo e DSM uma única vez, conforme o art. 9º, § 3º.') + '</p></div>' +
      '<div class="card flat"><div class="card-h" style="padding:14px 16px 0"><h2>Curva ABC do contrato</h2><div class="tabs"><button data-act="abc" data-v="sd" aria-pressed="' + (ui.abc === 'sd') + '">Sem desoneração</button><button data-act="abc" data-v="cd" aria-pressed="' + (ui.abc === 'cd') + '">Com desoneração</button></div></div><p class="muted" style="padding:0 16px">Faixa A até 80% do valor acumulado, B até 95%, C o restante.</p><div class="tbl"><table><thead><tr><th>Faixa</th><th>Código</th><th>Discriminação</th><th class="r">Quantidade</th><th>Und</th><th class="r">Preço unit.</th><th class="r">Parcial</th><th class="r">%</th><th class="r">% acum.</th></tr></thead><tbody>' +
      ab.itens.map(i => '<tr><td><span class="pill ' + (i.faixa === 'A' ? 'erro' : i.faixa === 'B' ? 'alerta' : 'info') + '">' + i.faixa + '</span></td><td class="mono">' + esc(i.codigo) + '</td><td>' + esc(i.descricao) + '</td><td class="r num">' + n3(i.qtd) + '</td><td>' + esc(i.unidade) + '</td><td class="r num">' + n2(i.pu) + '</td><td class="r num">' + n2(i.total) + '</td><td class="r num">' + pct(i.p) + '</td><td class="r num">' + pct(i.acum) + '</td></tr>').join('') + '</tbody></table></div></div>';
  };

  const BIB_CATS = ['Normas e resoluções', 'Manuais do IPR', 'Custos e SICRO', 'Álbuns de drenagem e projetos-tipo', 'Documentos do trecho'];
  T.biblioteca = () => {
    const por = {}; biblioteca.forEach(b => (por[b.categoria || 'Documentos do trecho'] = por[b.categoria || 'Documentos do trecho'] || []).push(b));
    return topo('Biblioteca técnica', 'Normas, manuais, álbuns de projeto-tipo e documentos do trecho em um só lugar.') +
      (assets ? '<div class="card"><h2>Acrescentar documento</h2><div class="form"><label class="f">Título<input id="bibTit" placeholder="Ex.: Álbum de projetos-tipo de drenagem (IPR 736)"></label><label class="f">Categoria<select id="bibCat">' + BIB_CATS.map(c => '<option>' + esc(c) + '</option>').join('') + '</select></label><label class="f">Link (opcional)<input id="bibLink" placeholder="https://www.gov.br/dnit/…"></label></div><div class="row"><button class="btn pri" data-act="bibUp">Enviar arquivo PDF ou imagem</button><button class="btn" data-act="bibLink">Salvar só o link</button><span class="muted" style="font-size:.82rem">Arquivos até 20 MB.</span></div></div>' : (db ? '<div class="card"><div class="form"><label class="f">Título<input id="bibTit"></label><label class="f">Categoria<select id="bibCat">' + BIB_CATS.map(c => '<option>' + esc(c) + '</option>').join('') + '</select></label><label class="f">Link<input id="bibLink" placeholder="https://"></label></div><div class="row"><button class="btn pri" data-act="bibLink">Salvar link</button><span class="muted" style="font-size:.82rem">O envio de arquivos fica disponível para quem pode editar esta página.</span></div></div>' : '')) +
      (biblioteca.length ? BIB_CATS.concat(Object.keys(por).filter(k => !BIB_CATS.includes(k))).filter(c => por[c]).map(c => '<div class="card"><h2>' + esc(c) + '</h2>' + por[c].sort((a, b) => String(a.titulo).localeCompare(String(b.titulo))).map(b => '<div class="row" style="justify-content:space-between;border-bottom:1px solid var(--line2);padding-bottom:6px"><div><a href="' + esc(b.url || b.link) + '" target="_blank" rel="noopener"><b>' + esc(b.titulo) + '</b></a><div class="muted" style="font-size:.8rem">' + esc(b.nota || (b.nome ? b.nome + ' · ' + Math.round((b.tamanho || 0) / 1024) + ' KB' : (b.link || ''))) + '</div></div>' + (b.assetId || b.link ? '<button class="btn sm" data-act="bibDel" data-id="' + esc(b.id) + '">Remover</button>' : '') + '</div>').join('') + '</div>').join('') : '<div class="empty"><h2>Biblioteca vazia</h2><p class="muted">Acrescente a Res. 8/2023, o Manual de Conservação (IPR 710), o álbum de drenagem (IPR 736) e os documentos do trecho.</p></div>');
  };

  T.requisitos = () => {
    const mods = [
      ['Cabeçalho e SNV', 'Calculado e conferido', 'Segmentos cobrem o trecho; conferência com a planilha oficial do SNV.'],
      ['Inventário (Anexos II e III)', 'Entrada importada', 'Resumo do inventário e quantidades de cadastro. Importação do modelo SR/MT ou tabela chave/valor.'],
      ['ICP e histórico (Anexo XXVII)', 'Calculado', 'ICP = 50·panela + 30·remendo + 20·trinca; km por intervenção; quantidade = máx(ICP, histórico).'],
      ['Roçada (DNIT 182/2018-PRO)', 'Calculado', 'Média ponderada pelo inverso da distância das estações pluviométricas.'],
      ['Grupo de desempenho I', 'Calculado', 'Preço mensal a partir de quantidade por km, nível de esforço, frequência e preços unitários.'],
      ['FIT (Anexo VI)', 'Calculado', 'FIT = 1 + (A1 + A2)/(DMTp·60).'],
      ['Transportes (Anexo VIII)', 'Calculado', 'Momento = quantidade × consumo × DMT × FIT, por caminhão e tipo de via.'],
      ['Linhas do PATO', 'Calculado', 'Base × fator com truncamento ou arredondamento; insumos derivados por taxa; preço pelo código.'],
      ['Totais, resumo, curva ABC e contrato', 'Calculado', 'Resumo por família, condição mais vantajosa, faixas A/B/C, contrato pelo prazo.'],
      ['Sinalização de obras (Anexo XIII)', 'Entrada importada', 'un.dia por dispositivo lido da planilha. Cálculo pela duração dos serviços: próxima etapa.'],
      ['Preços SICRO e binômio', 'Entrada importada', 'Banco de preços por código. Binômio com escolha do menor custo. Composições próprias: próxima etapa.'],
      ['Administração local, canteiro, usina e mobilização', 'Entrada importada', 'Preço lido da planilha auxiliar. Composição detalhada: próxima etapa.'],
      ['Prorrogação (Anexo XXIV) e adequação (Anexo XXV)', 'Planejado', 'Vantajosidade, desconto adicional e deflator do art. 96.'],
    ];
    const ent = [
      ['Projeto', 'nome, rodovia, trecho, subtrecho, segmento, kmIni, kmFim, extensao, snv, snvVersao, unidadeLocal, tipo, dataBase, aberturaLicitacao, prazoAnos, dataInventario'],
      ['Segmento SNV', 'snv, tipoPista, kmIni, kmFim, latIni, lonIni, latFim, lonFim, revestimento, faixas, largura'],
      ['Elemento de inventário', 'chave, rotulo, valor, unidade, grupo, fonte'],
      ['Levantamento ICP (por km)', 'sentido (C/D), kmIni, kmFim, panela, remendo, trinca (Alta, Média, Baixa, SR), intervPrim, intervSec'],
      ['Regra ICP', 'id, servico, classes [coluna, intervenção], neExpr, unidade, neFonte, somaRegras'],
      ['Histórico executado', 'regra, valor, contrato, medicao, memoria'],
      ['Linha do PATO', 'id, item, origem, codigo, descricao, baseExpr, unidadeBase, fatorExpr, unidade, modo (trunc, round, icp), casas, icpRegra, justificativa'],
      ['Grupo', 'item, titulo, linha'],
      ['Preço', 'codigo, descricao, unidade, sd, cd, fonte'],
      ['Croqui', 'chave (material+origem+destino), material, origem, destino, LN, RP, P, Pu'],
      ['FIT', 'frente, codigo, chave, vmdf'],
      ['Bloco de transporte', 'id, frente, codigo, descricao, linhas [servico, material, origem, destino, consumoExpr, faixaPATO, colunaDMT, usaFIT, fitFrente]'],
      ['Desempenho', 'codigo, grupo, qtdTotalExpr, ne, freqExpr, qtdPorKmExpr, unidade'],
      ['Binômio', 'material, origens [origem, uf, local, aquisicao, transporte]'],
      ['Cotação', 'material, codigoSicro, fornecedor, preco, unidade, densidade, data, dmtPav, dmtNaoPav, fonte'],
      ['Gabarito', 'linhas {id: base, fator, qtd, puSD, sd, puCD, cd}, totais, resumo, icp, transportes'],
      ['Documento da biblioteca', 'titulo, categoria, assetId ou link, nome, tamanho, enviadoEm'],
    ];
    const imp = [
      ['Planilha PATO completa', 'Abas CAPA, PATO, BD, RESUMO_INVENT, ICP, CALCULO_ICP e, se houver, CAD_SEG, CAD_PISTA, CROQUI, FIT, TRANSPORTES_CONSERVA, TRANSPORTES_DSM, DESEMPENHO, NE_ROCADA, UN_DIA, BINOMIO_ANP, RESUMO_PATO, QUANTIDADES'],
      ['Inventário', 'Aba RESUMO_INVENT do modelo, ou colunas chave, valor, unidade'],
      ['Levantamento ICP', 'Aba ICP do modelo, ou colunas km inicial, km final, sentido, panela, remendo, trinca, intervenção primária, intervenção secundária'],
      ['Histórico', 'Colunas serviço (RL, TP, RP, COR, FSD, FSC, MICRO), quantidade, contrato, medição'],
      ['SNV', 'Planilha oficial do SNV: código, km inicial, km final, extensão, superfície'],
      ['Preços', 'Aba BD do modelo, ou colunas código, descrição, unidade, preço sem desoneração, preço com desoneração'],
      ['Cotações', 'Colunas material, fornecedor, preço, unidade, data, município, DMT'],
    ];
    return topo('Requisitos e modelo de dados', 'Especificação viva do sistema: módulos, entidades, formatos de importação e regras. As regras abaixo são as mesmas que rodam na tela de validações.') +
      '<div class="card doc"><h2>Objetivo e critério de aceite</h2><p>Gerar o plano anual de trabalho e orçamento de contratos de conservação rodoviária conforme a Res. DNIT nº 8/2023, com cada quantidade rastreável até a sua origem. O sistema é aceito quando reproduz, linha a linha, uma planilha PATO aprovada usando apenas os dados de entrada dela. Na BR-158/MT (km 326,00 ao km 416,80) o motor confere ' + (CMP ? CMP.linhasOk + ' de ' + CMP.linhasTotal : '—') + ' linhas e o total sem desoneração.</p>' +
      '<h2>Fluxo (art. 19)</h2><ul><li>Inventário dos elementos geradores de conservação</li><li>Condição e intensidade dos serviços (ICP, roçada, desempenho)</li><li>Quantidades pelos níveis de esforço e pelo histórico</li><li>Quantificação dos DSM com memória direta</li><li>Preços, transportes, consolidação, validação e saídas</li></ul></div>' +
      '<div class="card flat"><div style="padding:14px 16px 0"><h2>Módulos</h2></div><div class="tbl short"><table><thead><tr><th>Módulo</th><th>Situação</th><th>Regra</th></tr></thead><tbody>' + mods.map(m => '<tr><td><b>' + esc(m[0]) + '</b></td><td>' + pill(m[1] === 'Calculado' || m[1] === 'Calculado e conferido' ? 'ok' : m[1] === 'Planejado' ? 'info' : 'alerta').replace(/>[^<]+<\/span>$/, '>' + esc(m[1]) + '</span>') + '</td><td>' + esc(m[2]) + '</td></tr>').join('') + '</tbody></table></div></div>' +
      '<div class="card flat"><div style="padding:14px 16px 0"><h2>Modelo de dados</h2><p class="muted">Cada projeto é guardado em partes: projeto, inventário, ICP, linhas, transportes, apoio, preços (em blocos de ' + CHUNK + ' códigos), SNV e gabarito.</p></div><div class="tbl short"><table><thead><tr><th>Entidade</th><th>Campos</th></tr></thead><tbody>' + ent.map(e => '<tr><td><b>' + esc(e[0]) + '</b></td><td class="mono" style="font-size:.76rem">' + esc(e[1]) + '</td></tr>').join('') + '</tbody></table></div></div>' +
      '<div class="card flat"><div style="padding:14px 16px 0"><h2>Regras de validação</h2></div>' + VAL.map(v => '<div class="rule"><span class="chip">' + esc(v.id) + '</span><div class="art">' + esc(v.art) + '</div><h3>' + esc(v.titulo) + '</h3></div>').join('') + '</div>' +
      '<div class="card flat"><div style="padding:14px 16px 0"><h2>Formatos de importação</h2></div><div class="tbl short"><table><thead><tr><th>Arquivo</th><th>Estrutura esperada</th></tr></thead><tbody>' + imp.map(e => '<tr><td><b>' + esc(e[0]) + '</b></td><td>' + esc(e[1]) + '</td></tr>').join('') + '</tbody></table></div></div>';
  };


  // ---------------- novo PATO a partir de um modelo ----------------
  function checklist() {
    if (!S.parametros || !S.parametros.modeloOrigem) return '';
    const inv = Object.values(S.inventario); const invOk = inv.filter(i => Number(i.valor) > 0).length;
    const lev = (S.icp.levantamento || []).length; const hist = Object.values(S.icp.historico || {}).filter(h => Number(h.valor) > 0).length;
    const pdb = S.parametros.precosDataBase === S.projeto.dataBase;
    const cot = (S.cotacoes || []).length;
    const dmt0 = []; Object.values(R.transportes).forEach(t => t.linhas.forEach(l => { if (l.qtd > 0 && !(l.dmt > 0)) dmt0.push(l.material); }));
    const vmd0 = (S.fit || []).filter(f => !(Number(f.vmdf) > 0)).length;
    const aDef = S.linhas.filter(L => L.aPreencher && !(R.linhas[L.id] && R.linhas[L.id].base)).length;
    const seg = (S.projeto.segmentos || []).length;
    const erros = VAL.filter(v => v.status === 'erro').length;
    const it = [
      [seg > 0, 'Segmentos do SNV cadastrados', seg + ' segmento(s)', '<a class="btn sm" href="#projeto">Abrir projeto</a>'],
      [invOk > 0, 'Inventário anexado', invOk + ' de ' + inv.length + ' elementos com valor', '<button class="btn sm" data-imp="inventario">Importar inventário</button>'],
      [lev > 0, 'Levantamento do pavimento (ICP)', lev + ' trechos', '<button class="btn sm" data-imp="icp">Importar levantamento</button>'],
      [hist > 0, 'Histórico executado (opcional)', hist + ' serviço(s) com histórico', '<button class="btn sm" data-imp="historico">Importar histórico</button>'],
      [pdb, 'Preços SICRO na data-base ' + (S.projeto.dataBase || '—'), pdb ? 'Banco na data-base do orçamento' : 'Banco atual na data-base ' + (S.parametros.precosDataBase || '—'), '<button class="btn sm" data-act="impPrecos">Importar preços</button>'],
      [cot > 0, 'Cotações de pétreos e areia', cot + ' cotação(ões)', '<a class="btn sm" href="#precos">Inserir cotações</a>'],
      [!dmt0.length && !vmd0, 'DMT do croqui e VMDf', (dmt0.length ? [...new Set(dmt0)].length + ' material(is) sem DMT' : 'DMT preenchidas') + (vmd0 ? ' · ' + vmd0 + ' sem VMDf' : ''), '<a class="btn sm" href="#transportes">Abrir transportes</a>'],
      [!aDef, 'Quantidades por memória de cálculo', aDef ? aDef + ' linha(s) a definir' : 'Todas informadas', '<button class="btn sm" data-act="verADefinir">Preencher</button>'],
      [!erros, 'Verificações da Res. 8/2023 sem erro', erros ? erros + ' verificação(ões) não atendida(s)' : 'Nenhum erro', '<a class="btn sm" href="#validacoes">Ver validações</a>'],
    ];
    const feitos = it.filter(x => x[0]).length;
    return '<div class="card"><div class="card-h"><h2>Para completar este PATO</h2><span class="muted">' + feitos + ' de ' + it.length + ' etapas · modelo de origem: ' + esc(S.parametros.modeloOrigem) + '</span></div><div class="bar"><i style="width:' + (100 * feitos / it.length) + '%"></i></div>' +
      it.map((x, i) => '<div class="row" style="justify-content:space-between;border-bottom:1px solid var(--line2);padding:6px 0"><div class="row" style="flex-wrap:nowrap"><span class="pill ' + (x[0] ? 'ok' : (i === 3 ? 'info' : 'alerta')) + '">' + (x[0] ? 'Feito' : 'Pendente') + '</span><div><b>' + esc(x[1]) + '</b><div class="muted" style="font-size:.82rem">' + esc(x[2]) + '</div></div></div>' + (x[0] && i !== 7 ? '' : x[3]) + '</div>').join('') +
      '<div class="row"><a class="btn pri" href="#saidas">Gerar a planilha preenchida</a><span class="muted" style="font-size:.84rem">A exportação traz PATO, resumo, curva ABC, validações e memória de cálculo.</span></div></div>';
  }
  function abrirNovo() {
    if (!projetos.length && !S) { toast('Importe primeiro uma planilha PATO aprovada para servir de modelo.', 6000); return; }
    const mod = projetos.length ? projetos.map(p => '<option value="' + esc(p.id) + '"' + (p.id === PID ? ' selected' : '') + '>' + esc(p.nome || p.id) + '</option>').join('') : '<option value="">Projeto aberto</option>';
    const hoje = new Date(); const mb = hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0');
    $('#drawer').innerHTML = '<div class="overlay" data-act="fechar"><div class="drawer" role="dialog" aria-label="Novo PATO" data-stop="1"><div class="card-h"><h2>Novo PATO</h2><button class="btn sm" data-act="fechar">Fechar</button></div>' +
      '<p class="muted">O novo plano herda do modelo a estrutura de serviços, as regras do ICP, o grupo de desempenho e os transportes. Inventário, levantamento, histórico, cotações, DMT e quantidades por memória de cálculo começam vazios para você preencher.</p>' +
      '<div class="form"><label class="f">Rodovia<input id="nRod" placeholder="BR-163/MT"></label><label class="f">km inicial<input id="nKi" inputmode="decimal"></label><label class="f">km final<input id="nKf" inputmode="decimal"></label>' +
      '<label class="f">Trecho<input id="nTr"></label><label class="f">Subtrecho<input id="nSub"></label><label class="f">Códigos SNV<input id="nSnv" placeholder="163BMT0100 - 163BMT0120"></label><label class="f">Versão do SNV<input id="nSnvV" placeholder="202501A"></label><label class="f">Unidade local<input id="nUL"></label>' +
      '<label class="f">Data-base (mês do SICRO)<input id="nDb" type="month" value="' + mb + '"></label><label class="f">Prazo do contrato (anos)<input id="nPz" inputmode="numeric" value="2"></label><label class="f">Largura da faixa (m)<input id="nLg" inputmode="decimal" value="3,6"></label>' +
      '<label class="f">Modelo de origem<select id="nMod">' + mod + '</select></label></div>' +
      '<label class="row"><input type="checkbox" id="nDSM"> Trazer também os DSM do modelo</label>' +
      '<div class="row"><button class="btn pri" data-act="criarNovo">Criar PATO</button><span class="muted" id="nErr"></span></div></div></div>';
  }
  async function carregarEstado(pid) {
    if (pid === PID && S) return JSON.parse(JSON.stringify(S));
    const meta = projetos.find(p => p.id === pid); const st = {};
    for (const p of (meta.partes || Object.keys(PARTS))) { if (/^precos/.test(p)) continue; const d = await db.doc('projetos/' + pid + '/partes/' + p).get(); if (d.exists) Object.assign(st, d.data()); }
    st.precos = {}; for (let i = 0; i < (meta.precosChunks || 1); i++) { const d = await db.doc('projetos/' + pid + '/partes/precos_' + i).get(); if (d.exists) Object.assign(st.precos, d.data().precos || {}); }
    return JSON.parse(JSON.stringify(st));
  }
  async function criarNovo() {
    const v = id => $('#' + id).value.trim(); const err = m => { $('#nErr').textContent = m; };
    const ki = parseNum(v('nKi')), kf = parseNum(v('nKf'));
    if (!v('nRod')) return err('Informe a rodovia.'); if (ki == null || kf == null || kf <= ki) return err('Informe km inicial e km final, com o final maior que o inicial.');
    if (!v('nDb')) return err('Escolha a data-base.');
    const M = await carregarEstado(v('nMod') || PID); const modNome = (M.projeto || {}).nome || 'modelo';
    const comDSM = $('#nDSM').checked;
    const ext = Math.round((kf - ki) * 1000) / 1000;
    const fmtKm = x => Number(x).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
    const segTxt = 'km ' + fmtKm(ki) + ' ao km ' + fmtKm(kf);
    const N = {};
    N.projeto = { nome: 'PATO ' + v('nRod') + ' ' + segTxt, rodovia: v('nRod'), trecho: v('nTr'), subtrecho: v('nSub'), segmento: segTxt, kmIni: ki, kmFim: kf, extensao: ext, snv: v('nSnv'), snvVersao: v('nSnvV'), prazoAnos: parseNum(v('nPz')) || 1, periodoMeses: 12, dataBase: v('nDb'), unidadeLocal: v('nUL'), uf: (v('nRod').match(/\/([A-Z]{2})/) || [])[1] || 'MT', tipo: 'pavimentada', aberturaLicitacao: '', dataInventario: '', segmentos: [] };
    N.adm = Object.assign({}, M.adm || {});
    N.parametros = { dsmMultiplicaPrazo: false, precosDataBase: (M.parametros || {}).precosDataBase || (M.projeto || {}).dataBase, bdiSD: (M.parametros || {}).bdiSD || null, bdiCD: (M.parametros || {}).bdiCD || null, modeloOrigem: modNome };
    N.justificativas = {};
    N.inventario = {}; Object.keys(M.inventario || {}).forEach(k => { N.inventario[k] = Object.assign({}, M.inventario[k], { valor: 0, fonte: 'A informar' }); });
    N.icp = JSON.parse(JSON.stringify(M.icp)); N.icp.levantamento = []; N.icp.parametros = Object.assign({}, N.icp.parametros, { larguraFaixa: parseNum(v('nLg')) || 3.6, metodo: 'faixas' });
    N.icp.historico = {}; N.icp.regras.forEach(r => N.icp.historico[r.id] = { valor: 0, contrato: '', medicao: '', memoria: '' });
    const grupos = (M.grupos || []).slice().sort((a, b) => a.linha - b.linha);
    const g02 = grupos.find(g => g.item === '02'); const corte = g02 && !comDSM ? g02.linha : Infinity;
    N.grupos = grupos.filter(g => g.linha < corte);
    N.linhas = (M.linhas || []).filter(L => L.linha < corte).map(L => {
      const X = Object.assign({}, L); delete X.memoriaPlanilha; delete X.justificativa;
      const soLiteral = X.modo !== 'icp' && !/[a-zA-Z_]/.test(String(X.baseExpr).replace(/[eE][+-]?\d/g, ''));
      if (soLiteral && X.origem !== 'PRAZO PATO') { X.aPreencher = true; X.sugestao = X.baseExpr; X.baseExpr = '0'; }
      return X;
    });
    N.transportes = (M.transportes || []).filter(b => comDSM || b.frente === 'CONSERVA');
    N.croqui = {}; Object.keys(M.croqui || {}).forEach(k => { if (!comDSM && /DSM/.test(k)) return; N.croqui[k] = Object.assign({}, M.croqui[k], { LN: 0, RP: 0, P: 0, Pu: 0 }); });
    N.fit = (M.fit || []).filter(f => comDSM || f.frente === 'CONSERVA').map(f => Object.assign({}, f, { vmdf: 0, fitPlanilha: null }));
    N.desempenho = JSON.parse(JSON.stringify(M.desempenho || null));
    N.rocada = JSON.parse(JSON.stringify(M.rocada || { estacoes: [] })); N.rocada.neAdotado = '';
    N.undia = JSON.parse(JSON.stringify(M.undia || {}));
    N.binomio = JSON.parse(JSON.stringify(M.binomio || []));
    N.precos = JSON.parse(JSON.stringify(M.precos || {}));
    N.cotacoes = [];
    $('#drawer').innerHTML = '';
    if (db) await criarProjeto(N, 'Criado do zero a partir de ' + modNome); else { S = N; PID = 'novo-' + Date.now(); recompute(); }
    location.hash = 'painel'; render(); toast('PATO criado. Siga as etapas do painel para completar.', 6000);
  }

  // ---------------- importação de preços com opções ----------------
  function abrirImportPrecos() {
    const P = S.parametros || {};
    $('#drawer').innerHTML = '<div class="overlay" data-act="fechar"><div class="drawer" role="dialog" aria-label="Importar preços" data-stop="1"><div class="card-h"><h2>Importar preços</h2><button class="btn sm" data-act="fechar">Fechar</button></div>' +
      '<p class="muted">Aceita a aba BD do modelo ou o relatório sintético do SICRO (código, descrição, unidade, custo). O SICRO publica custos sem BDI e arquivos separados para as condições sem e com desoneração.</p>' +
      '<div class="form"><label class="f">Data-base destes preços<input id="ipDb" type="month" value="' + esc(S.projeto.dataBase || '') + '"></label><label class="f">Os valores vão para<select id="ipCol"><option value="ambas">As duas condições (o arquivo já traz as duas colunas)</option><option value="sd">Só sem desoneração</option><option value="cd">Só com desoneração</option></select></label></div>' +
      '<label class="row"><input type="checkbox" id="ipBdi"> Os valores são custos sem BDI: aplicar o BDI</label>' +
      '<div class="form"><label class="f">BDI sem desoneração (%)<input id="ipBs" inputmode="decimal" value="' + (P.bdiSD ? n2(P.bdiSD * 100) : '') + '"></label><label class="f">BDI com desoneração (%)<input id="ipBc" inputmode="decimal" value="' + (P.bdiCD ? n2(P.bdiCD * 100) : '') + '"></label></div>' +
      '<div class="row"><button class="btn pri" data-act="impPrecosGo">Escolher arquivo</button></div><p class="note">Itens de administração local, canteiro, usina, mobilização, grupo de desempenho e betuminosos (AM e TM) não vêm do SICRO e continuam com o valor atual até serem revistos.</p></div></div>';
  }
  async function impPrecosGo() {
    const col = $('#ipCol').value, dbase = $('#ipDb').value, bdi = $('#ipBdi').checked;
    const bs = (parseNum($('#ipBs').value) || 0) / 100, bc = (parseNum($('#ipBc').value) || 0) / 100;
    if (bdi && (!bs || !bc)) { toast('Informe os dois percentuais de BDI.'); return; }
    const f = await escolherArquivo(); if (!f) return; const wb = await lerPlanilha(f);
    const p = IMP.importarPrecos(wb, XLSX); const codes = Object.keys(p); if (!codes.length) throw new Error('Nenhum preço encontrado.');
    const tr = x => x == null ? null : Math.trunc(x * 100 + 1e-9) / 100;
    codes.forEach(c => {
      const o = S.precos[c] || { descricao: p[c].descricao, unidade: p[c].unidade };
      const vsd = p[c].sd, vcd = p[c].cd;
      if (col === 'ambas' || col === 'sd') o.sd = bdi ? tr(vsd * (1 + bs)) : vsd;
      if (col === 'ambas' || col === 'cd') o.cd = bdi ? tr((col === 'cd' ? vsd : vcd) * (1 + bc)) : (col === 'cd' ? vsd : vcd);
      o.descricao = o.descricao || p[c].descricao; o.unidade = o.unidade || p[c].unidade; o.fonte = 'SICRO ' + dbase + ' · ' + f.name + (bdi ? ' (BDI aplicado)' : '');
      S.precos[c] = o;
    });
    if (dbase) S.parametros.precosDataBase = dbase;
    if (bdi) { S.parametros.bdiSD = bs; S.parametros.bdiCD = bc; }
    markDirty('precos'); markDirty('projeto'); $('#drawer').innerHTML = ''; recompute(); render();
    toast(codes.length + ' preços importados de ' + f.name + '.');
  }

  // ---------------- acrescentar serviço ----------------
  function abrirAddLinha() {
    const gs = (S.grupos || []).filter(g => g.item.split('.').length >= 2).sort((a, b) => a.linha - b.linha);
    $('#drawer').innerHTML = '<div class="overlay" data-act="fechar"><div class="drawer" role="dialog" aria-label="Acrescentar serviço" data-stop="1"><div class="card-h"><h2>Acrescentar serviço</h2><button class="btn sm" data-act="fechar">Fechar</button></div>' +
      '<div class="form"><label class="f">Grupo<select id="aG">' + gs.map(g => '<option value="' + esc(g.id) + '">' + esc(g.item + ' · ' + g.titulo) + '</option>').join('') + '</select></label>' +
      '<label class="f">Código (banco de preços)<input id="aC" list="aCods" placeholder="4915757"></label><datalist id="aCods">' + Object.keys(S.precos).slice(0, 2000).map(c => '<option value="' + esc(c) + '">' + esc((S.precos[c].descricao || '').slice(0, 80)) + '</option>').join('') + '</datalist>' +
      '<label class="f">Origem da quantidade<input id="aO" list="origens2" value="NOTA TÉCNICA"></label><datalist id="origens2">' + ['INVENTÁRIO', 'ICP', 'HISTÓRICO', 'SICRO', 'PROD SICRO', 'RESOLUÇÃO', 'NOTA TÉCNICA', 'ESTIMATIVA', 'MANUAL'].map(o => '<option value="' + o + '">').join('') + '</datalist>' +
      '<label class="f">Unidade da base<input id="aU" placeholder="m, m³, un"></label></div>' +
      '<label class="f">Expressão da base<textarea id="aB" rows="2" placeholder="Ex.: inv(&quot;bueiro&quot;) ou 12*35"></textarea></label><label class="f">Fator (nível de esforço ou taxa)<textarea id="aF" rows="1">1</textarea></label>' +
      '<label class="f">Justificativa técnica<textarea id="aJ" rows="3" style="font-family:var(--f-body)"></textarea></label><div class="row"><button class="btn pri" data-act="addLinhaGo">Acrescentar</button><span class="muted" id="aErr"></span></div></div></div>';
  }
  function addLinhaGo() {
    const gid = $('#aG').value, cod = $('#aC').value.trim(); const g = S.grupos.find(x => x.id === gid);
    if (!g || !cod) { $('#aErr').textContent = 'Escolha o grupo e o código.'; return; }
    const ord = S.grupos.concat(S.linhas.map(L => ({ linha: L.linha, item: L.item }))).sort((a, b) => a.linha - b.linha);
    const prox = ord.find(x => x.linha > g.linha && (x.item.split('.').length <= g.item.split('.').length) && !x.item.startsWith(g.item + '.'));
    const dentro = S.linhas.filter(L => L.linha > g.linha && (!prox || L.linha < prox.linha));
    const ult = dentro.length ? Math.max(...dentro.map(L => L.linha)) : g.linha;
    const lim = prox ? prox.linha : ult + 1;
    const linha = ult + (lim - ult) / 2;
    const filhos = dentro.filter(L => L.item.split('.').length === g.item.split('.').length + 1).map(L => parseInt(L.item.split('.').pop(), 10)).filter(n => !isNaN(n));
    const item = g.item + '.' + String((filhos.length ? Math.max(...filhos) : 0) + 1).padStart(2, '0');
    const id = 'N' + Date.now();
    const p = S.precos[cod] || {};
    S.linhas.push({ id, linha, item, origem: $('#aO').value.trim(), codigo: cod, descricao: p.descricao || '', unidade: p.unidade || '', unidadeBase: $('#aU').value.trim() || p.unidade || '', baseExpr: $('#aB').value.trim() || '0', fatorExpr: $('#aF').value.trim() || '1', modo: 'trunc', casas: 3, justificativa: $('#aJ').value.trim() });
    recompute();
    if (R.linhas[id] && R.linhas[id].erro) { const e = R.linhas[id].erro; S.linhas.pop(); recompute(); $('#aErr').textContent = 'Expressão inválida: ' + e; return; }
    markDirty('linhas'); $('#drawer').innerHTML = ''; render(); toast('Serviço ' + item + ' acrescentado.');
  }
  function addDSM() {
    const gs = S.grupos.slice().sort((a, b) => a.linha - b.linha);
    const maxL = Math.max(0, ...S.linhas.map(L => L.linha), ...gs.map(g => g.linha));
    if (!gs.some(g => g.item === '02')) S.grupos.push({ id: 'G02', item: '02', titulo: 'DEMAIS SERVIÇOS DE MANUTENÇÃO - DSM', linha: maxL + 10 });
    const n = gs.filter(g => /^02\.\d\d$/.test(g.item)).length + 1;
    const it = '02.' + String(n).padStart(2, '0');
    S.grupos.push({ id: 'G' + it.replace('.', '_') + '_' + Date.now(), item: it, titulo: 'DSM ' + n + ' - informe a localização e o serviço', linha: maxL + 20 });
    markDirty('linhas'); recompute(); render(); toast('Grupo ' + it + ' criado. Edite o título e acrescente os serviços com memória de cálculo e localização (art. 40).');
  }

  // ---------------- render ----------------
  function render() {
    navHTML();
    const v = view(); const el = $('#view'); const y = window.scrollY;
    if (!S) { el.innerHTML = semProjeto(); return; }
    if (!R) recompute();
    try { el.innerHTML = (T[v] || T.painel)(); } catch (e) { console.error(e); el.innerHTML = '<div class="empty"><h2>Não foi possível montar esta tela</h2><p class="muted">' + esc(e.message) + '</p></div>'; }
    window.scrollTo(0, y);
  }

  // ---------------- eventos ----------------
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'mobnav') { location.hash = t.value; return; }
    if (t.dataset.act === 'trocar') { (async () => { await salvar(); await abrirProjeto(t.value); render(); })(); return; }
    if (t.dataset.ui) { ui[t.dataset.ui] = t.type === 'checkbox' ? t.checked : t.value; render(); return; }
    if (t.dataset.edit) {
      const ty = t.dataset.type || 'text'; let v = ty === 'bool' ? t.checked : t.value;
      if (ty === 'num') { v = parseNum(t.value); if (v == null) { toast('Valor numérico inválido: ' + t.value); render(); return; } }
      setPath(t.dataset.edit, v); recompute(); render();
    }
  });
  document.addEventListener('input', e => { const t = e.target; if (t.dataset.ui === 'filtro' || t.dataset.ui === 'precoBusca') { ui[t.dataset.ui] = t.value; clearTimeout(render._t); render._t = setTimeout(() => { const pos = t.selectionStart; render(); const n = document.querySelector('[data-ui="' + t.dataset.ui + '"]'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) { } } }, 250); } });
  document.addEventListener('click', async e => {
    const imp = e.target.closest('[data-imp]');
    if (imp) { try { await ACOES_IMPORT[imp.dataset.imp](); } catch (err) { console.error(err); toast(err.message || String(err), 7000); } return; }
    const a = e.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'fechar') { if (e.target.closest('[data-stop]') && !e.target.closest('button[data-act="fechar"]')) return; $('#drawer').innerHTML = ''; return; }
    const act = a.dataset.act;
    if (act === 'novo') return abrirNovo();
    if (act === 'criarNovo') { try { await criarNovo(); } catch (err) { console.error(err); $('#nErr') && ($('#nErr').textContent = err.message); } return; }
    if (act === 'impPrecos') return abrirImportPrecos();
    if (act === 'impPrecosGo') { try { await impPrecosGo(); } catch (err) { toast(err.message || String(err), 7000); } return; }
    if (act === 'addLinha') return abrirAddLinha();
    if (act === 'addLinhaGo') return addLinhaGo();
    if (act === 'addDSM') return addDSM();
    if (act === 'verADefinir') { ui.aDefinir = true; ui.filtro = ''; ui.origem = ''; ui.soComProblema = false; location.hash = 'planilha'; return render(); }
    if (act === 'usarSug') { const L = S.linhas.find(x => x.id === a.dataset.id); const ta = document.querySelector('#drawer [data-l="baseExpr"]'); if (L && ta) ta.value = L.sugestao; return; }
    if (act === 'delLinha') {
      if (a.dataset.confirm !== '1') { a.dataset.confirm = '1'; a.textContent = 'Confirmar exclusão'; return; }
      const id = a.dataset.id; const ref = S.linhas.filter(L => L.id !== id && new RegExp('"' + id + '"').test(L.baseExpr + L.fatorExpr));
      if (ref.length) { $('#lerr').textContent = 'Não excluída: as linhas ' + ref.map(L => L.item).join(', ') + ' dependem dela.'; return; }
      S.linhas = S.linhas.filter(L => L.id !== id); markDirty('linhas'); $('#drawer').innerHTML = ''; recompute(); render(); toast('Linha excluída.'); return;
    }
    if (act === 'addCot') {
      const g = id => $('#' + id).value.trim();
      if (!g('cMat') || !g('cForn') || parseNum(g('cPreco')) == null) { toast('Informe material, fornecedor e preço.'); return; }
      S.cotacoes = S.cotacoes || []; S.cotacoes.push({ material: g('cMat'), fornecedor: g('cForn'), municipio: g('cMun'), preco: parseNum(g('cPreco')), unidade: g('cUn') || 't', data: g('cData'), dmtPav: parseNum(g('cDp')), dmtNaoPav: parseNum(g('cDn')), fonte: 'Inserida manualmente' });
      markDirty('apoio'); recompute(); render(); toast('Cotação acrescentada.'); return;
    }
    if (act === 'delCot') { S.cotacoes.splice(Number(a.dataset.i), 1); markDirty('apoio'); recompute(); return render(); }
    if (act === 'cotCroqui') {
      const c = S.cotacoes[Number(a.dataset.i)]; const m = String(c.material).toUpperCase(); let n = 0;
      Object.keys(S.croqui).forEach(k => { const x = S.croqui[k]; if (String(x.material).toUpperCase() === m && !/USINA/i.test(x.destino || '')) { if (c.dmtPav != null) x.P = c.dmtPav; if (c.dmtNaoPav != null) x.RP = c.dmtNaoPav; n++; } });
      if (!n) { toast('Nenhuma linha do croqui com o material ' + c.material + '.'); return; }
      markDirty('apoio'); recompute(); render(); toast('DMT de ' + c.material + ' aplicada em ' + n + ' percurso(s) do croqui.'); return;
    }
    if (act === 'linha') return abrirLinha(a.dataset.id);
    if (act === 'salvarLinha') {
      const L = S.linhas.find(x => x.id === a.dataset.id); const d = $('#drawer'); const backup = JSON.stringify(L);
      d.querySelectorAll('[data-l]').forEach(i => L[i.dataset.l] = i.value.trim());
      recompute();
      if (R && R.linhas[L.id] && R.linhas[L.id].erro) { Object.assign(L, JSON.parse(backup)); recompute(); $('#lerr').textContent = 'Não aplicado: ' + R.erros.slice(-1)[0]; return; }
      markDirty('linhas'); d.innerHTML = ''; render(); toast('Linha ' + L.item + ' atualizada.'); return;
    }
    if (act === 'sentido') { ui.sentido = a.dataset.v; return render(); }
    if (act === 'valStatus') { ui.valStatus = a.dataset.v; return render(); }
    if (act === 'abc') { ui.abc = a.dataset.v; return render(); }
    if (act === 'verLinhas') { ui.linhasDestaque = a.dataset.ids.split(','); ui.filtro = ''; ui.origem = ''; ui.soComProblema = false; ui.derivados = true; location.hash = 'planilha'; return render(); }
    if (act === 'limparDestaque') { ui.linhasDestaque = null; return render(); }
    if (act === 'addSeg') { S.projeto.segmentos = S.projeto.segmentos || []; S.projeto.segmentos.push({ snv: '', tipoPista: 'PISTA SIMPLES', kmIni: S.projeto.kmIni, kmFim: S.projeto.kmFim }); markDirty('projeto'); recompute(); return render(); }
    if (act === 'delSeg') { S.projeto.segmentos.splice(Number(a.dataset.i), 1); markDirty('projeto'); recompute(); return render(); }
    if (act === 'xlsx') return exportarXLSX();
    if (act === 'json') return exportarJSON();
    if (act === 'bibUp') {
      const tit = $('#bibTit').value.trim(), cat = $('#bibCat').value, link = $('#bibLink').value.trim();
      const f = await escolherArquivo('.pdf,image/*'); if (!f) return;
      try { toast('Enviando ' + f.name + '…', 10000); const up = await assets.upload(f); await db.collection('biblioteca').add({ titulo: tit || f.name.replace(/\.[^.]+$/, ''), categoria: cat, assetId: up.id, url: up.url, nome: f.name, tamanho: up.sizeBytes, tipo: up.contentType, link: link || '', enviadoEm: new Date().toISOString() }); toast('Documento acrescentado.'); }
      catch (err) { toast('Não foi possível enviar: ' + (err.message || err.code), 7000); }
      return;
    }
    if (act === 'bibLink') {
      const tit = $('#bibTit').value.trim(), cat = $('#bibCat').value, link = $('#bibLink').value.trim();
      if (!/^https?:\/\//.test(link)) { toast('Informe um link começando com https://'); return; }
      try { await db.collection('biblioteca').add({ titulo: tit || link, categoria: cat, link, enviadoEm: new Date().toISOString() }); toast('Link salvo.'); } catch (err) { toast('Não foi possível salvar: ' + (err.message || err.code)); }
      return;
    }
    if (act === 'bibDel') {
      const b = biblioteca.find(x => x.id === a.dataset.id); if (!b) return;
      if (a.dataset.confirm !== '1') { a.dataset.confirm = '1'; a.textContent = 'Confirmar remoção'; setTimeout(() => { if (a.isConnected) { a.dataset.confirm = ''; a.textContent = 'Remover'; } }, 4000); return; }
      try { if (b.assetId && assets) { try { await assets.delete(b.assetId); } catch (x) { } } await db.doc('biblioteca/' + b.id).delete(); toast('Documento removido.'); } catch (err) { toast('Não foi possível remover: ' + (err.message || err.code)); }
    }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#drawer').innerHTML) $('#drawer').innerHTML = ''; });
  window.addEventListener('hashchange', () => { $('#drawer').innerHTML = ''; if (view() !== 'planilha') ui.linhasDestaque = null; render(); window.scrollTo(0, 0); });
  window.addEventListener('beforeunload', () => { if (dirty.size) salvar(); });

  // ---------------- início ----------------
  (async function init() {
    render();
    const c = window.claude;
    if (c && c.use) {
      const [d, u, a, dl] = await Promise.all(['db', 'user', 'assets', 'downloads'].map(n => c.use(n).catch(() => null)));
      db = d; user = u; assets = a; downloads = dl;
      if (user && user.can) { try { const w = await user.can('data.write'); if (w === false) canWrite = false; } catch (e) { } }
    }
    if (db) {
      try {
        await carregarLista();
        const pref = sget('pato.pid'); const pid = projetos.find(p => p.id === pref) ? pref : (projetos[0] && projetos[0].id);
        if (pid) await abrirProjeto(pid); else setSave(canWrite ? 'Nenhum projeto salvo' : 'Somente leitura');
        unsubBib = db.collection('biblioteca').onSnapshot(s => { biblioteca = s.docs.map(x => Object.assign({ id: x.id }, x.data())); if (view() === 'biblioteca') render(); }, () => { });
      } catch (e) { console.error(e); setSave('Base de projetos indisponível agora'); }
    } else setSave('Base de projetos indisponível nesta visualização');
    render();
  })();
})();
