/* Motor de cálculo do PATO — Res. DNIT nº 8/2023
   Funciona no navegador (window.PatoEngine) e no Node (module.exports). */
(function (root) {
  'use strict';

  // ---------- aritmética compatível com o Excel ----------
  function fix15(x) { return Number(Number(x).toPrecision(15)); }
  function trunc(x, d) { const f = Math.pow(10, d); return Math.trunc(fix15(x * f)) / f; }
  function round(x, d) { const f = Math.pow(10, d); const v = fix15(x * f); return (v < 0 ? -Math.round(-v) : Math.round(v)) / f; }
  function roundup(x) { const v = fix15(x); return v < 0 ? -Math.ceil(-v) : Math.ceil(v); }
  const norm = s => String(s == null ? '' : s).trim().toUpperCase();

  // ---------- avaliador de expressões (sem eval) ----------
  function tokenize(src) {
    const t = []; let i = 0; const s = String(src);
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if (/[0-9.]/.test(c)) { let j = i; while (j < s.length && /[0-9.eE]/.test(s[j]) && !(/[eE]/.test(s[j]) && !/[0-9+-]/.test(s[j + 1] || ''))) j++; t.push({ k: 'n', v: parseFloat(s.slice(i, j)) }); i = j; continue; }
      if (/[A-Za-z_]/.test(c)) { let j = i; while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++; t.push({ k: 'id', v: s.slice(i, j) }); i = j; continue; }
      if (c === '"' || c === "'") { let j = i + 1; while (j < s.length && s[j] !== c) j++; t.push({ k: 's', v: s.slice(i + 1, j) }); i = j + 1; continue; }
      if ('+-*/^(),'.includes(c)) { t.push({ k: c }); i++; continue; }
      throw new Error('Caractere inválido na expressão: ' + c);
    }
    return t;
  }
  function parse(src) {
    const t = tokenize(src); let p = 0;
    const peek = () => t[p], eat = k => { if (!t[p] || t[p].k !== k) throw new Error('Esperado ' + k + ' em: ' + src); return t[p++]; };
    function prim() {
      const x = peek(); if (!x) throw new Error('Expressão incompleta: ' + src);
      if (x.k === 'n') { p++; return { n: x.v }; }
      if (x.k === 's') { p++; return { s: x.v }; }
      if (x.k === '-') { p++; return { neg: pow() }; }
      if (x.k === '+') { p++; return pow(); }
      if (x.k === '(') { p++; const e = add(); eat(')'); return e; }
      if (x.k === 'id') {
        p++;
        if (peek() && peek().k === '(') { p++; const args = []; if (peek().k !== ')') { args.push(add()); while (peek().k === ',') { p++; args.push(add()); } } eat(')'); return { f: x.v, args }; }
        return { v: x.v };
      }
      throw new Error('Token inesperado em: ' + src);
    }
    function pow() { let l = prim(); while (peek() && peek().k === '^') { p++; l = { op: '^', l, r: prim() }; } return l; }
    function mul() { let l = pow(); while (peek() && (peek().k === '*' || peek().k === '/')) { const o = t[p++].k; l = { op: o, l, r: pow() }; } return l; }
    function add() { let l = mul(); while (peek() && (peek().k === '+' || peek().k === '-')) { const o = t[p++].k; l = { op: o, l, r: mul() }; } return l; }
    const e = add(); if (p < t.length) throw new Error('Sobrou texto na expressão: ' + src); return e;
  }
  const cache = new Map();
  function compile(src) { const k = String(src); if (!cache.has(k)) cache.set(k, parse(k === '' ? '0' : k)); return cache.get(k); }
  function evalNode(n, ctx) {
    if ('n' in n) return n.n;
    if ('s' in n) return n.s;
    if ('neg' in n) return -evalNode(n.neg, ctx);
    if ('op' in n) {
      const a = evalNode(n.l, ctx), b = evalNode(n.r, ctx);
      switch (n.op) { case '+': return a + b; case '-': return a - b; case '*': return a * b; case '/': return b === 0 ? 0 : a / b; case '^': return Math.pow(a, b); }
    }
    if ('v' in n) { if (!(n.v in ctx.vars)) throw new Error('Variável desconhecida: ' + n.v); return ctx.vars[n.v]; }
    if ('f' in n) {
      const fn = ctx.fns[n.f]; if (!fn) throw new Error('Função desconhecida: ' + n.f);
      return fn.apply(null, n.args.map(a => evalNode(a, ctx)));
    }
    throw new Error('Nó inválido');
  }
  function evaluate(src, ctx) { return evalNode(compile(src), ctx); }

  // ---------- módulos ----------
  function calcICP(st) {
    const P = st.icp.parametros || {}; const metodo = P.metodo || 'planilha';
    const mult = metodo === 'planilha' ? (Number(P.fatorFaixas) || 2) : 1;
    const rows = (st.icp.levantamento || []).filter(r => metodo === 'planilha' ? r.sentido !== 'D' : true);
    const pts = { Alta: 1, 'Média': 0.5, Baixa: 0.25, SR: 0 };
    const lev = (st.icp.levantamento || []).map(r => {
      const icp = 50 * (pts[r.panela] || 0) + 30 * (pts[r.remendo] || 0) + 20 * (pts[r.trinca] || 0);
      return Object.assign({}, r, { ext: Math.abs(r.kmFim - r.kmIni), icp, condicao: icp < 30 ? 'BOM' : icp < 50 ? 'REGULAR' : icp < 70 ? 'RUIM' : 'PÉSSIMO' });
    });
    const sumCls = cls => {
      let s = 0;
      rows.forEach(r => { const ext = Math.abs(r.kmFim - r.kmIni); if (cls.some(([col, val]) => norm(col === 'W' ? r.intervPrim : r.intervSec) === norm(val))) s += ext; });
      return s;
    };
    const vars = { largura: Number(P.larguraFaixa) || 3.6 };
    const res = {};
    (st.icp.regras || []).forEach(rg => { if (!rg.somaRegras) res[rg.id] = { km: roundup(sumCls(rg.classes || [])) }; });
    (st.icp.regras || []).forEach(rg => { if (rg.somaRegras) res[rg.id] = { km: rg.somaRegras.reduce((a, id) => a + (res[id] ? res[id].km : 0), 0) }; });
    (st.icp.regras || []).forEach(rg => {
      const ne = evaluate(rg.neExpr, { vars, fns: {} });
      const r = res[rg.id]; r.ne = ne; r.mult = mult; r.calc = ne * r.km * mult;
      const h = (st.icp.historico || {})[rg.id] || {}; r.historico = Number(h.valor) || 0;
      r.adotado = Math.max(r.calc, r.historico); r.criterio = r.adotado === r.calc ? 'ICP' : 'Histórico';
      r.servico = rg.servico; r.unidade = rg.unidade; r.neFonte = rg.neFonte;
    });
    return { metodo, mult, regras: res, levantamento: lev };
  }

  function calcRocada(st) {
    const es = (st.rocada && st.rocada.estacoes) || [];
    let a = 0, b = 0; es.forEach(e => { if (e.distancia > 0) { a += e.nere / e.distancia; b += 1 / e.distancia; } });
    const nerp = b ? a / b : 0;
    const sugerido = Math.round(nerp) + 1;
    const adotado = st.rocada && st.rocada.neAdotado != null && st.rocada.neAdotado !== '' ? Number(st.rocada.neAdotado) : (st.rocada && st.rocada.nePlanilha) || sugerido;
    return { nerp, sugerido, adotado };
  }

  function lookupCroqui(st, chave) {
    const k = norm(chave); const c = st.croqui || {};
    for (const key in c) if (norm(key) === k) return c[key];
    return null;
  }
  function calcFIT(st) {
    const out = {};
    (st.fit || []).forEach(f => {
      const c = lookupCroqui(st, f.chave);
      const dmtp = c ? Number(c.P) || 0 : 0, dmtu = c ? Number(c.Pu) || 0 : 0;
      const a1 = 70 + 0.0035 * (Number(f.vmdf) || 0), a2 = 60 * dmtu;
      const fit = dmtp > 0 ? 1 + (a1 + a2) / (dmtp * 60) : 1;
      out[f.frente + '|' + norm(f.chave)] = { fit, dmtp, dmtu, a1, a2, vmdf: f.vmdf, codigo: f.codigo, chave: f.chave, frente: f.frente };
    });
    return out;
  }

  function compute(st, opts) {
    opts = opts || {};
    const proj = st.projeto || {};
    const ext = Number(proj.extensao) || 0;
    const prazo = Number(proj.prazoAnos) || 1;
    const icp = calcICP(st);
    const rocada = calcRocada(st);
    const fitTab = calcFIT(st);
    const linhas = st.linhas || [];
    const byId = {}; linhas.forEach(L => byId[L.id] = L);
    const memo = {}; const busy = {};
    const erros = [];
    const precos = st.precos || {};

    const transpMemo = {};
    function transp(id) {
      if (id in transpMemo) return transpMemo[id].total;
      const blk = (st.transportes || []).find(b => b.id === id);
      if (!blk) { erros.push('Bloco de transporte não encontrado: ' + id); return 0; }
      let total = 0; const det = [];
      blk.linhas.forEach(l => {
        let q = 0;
        if (l.faixaPATO) linhas.forEach(L => { if (L.linha >= l.faixaPATO[0] && L.linha <= l.faixaPATO[1] && String(L.codigo) === String(l.servico)) q += line(L.id).qtd; });
        const consumo = evaluate(l.consumoExpr || '0', ctxBase());
        const c = lookupCroqui(st, l.chave);
        const dmt = c && l.colunaDMT ? (Number(c[l.colunaDMT]) || 0) : 0;
        let fit = 1;
        if (l.usaFIT) { const f = fitTab[l.fitFrente + '|' + norm(l.chave)]; fit = f ? f.fit : 1; }
        else if (l.fitFixo != null) fit = l.fitFixo;
        const momento = trunc(q * consumo * dmt * fit, 3);
        total += momento;
        det.push({ servico: l.servico, material: l.material, origem: l.origem, destino: l.destino, qtd: q, consumo, dmt, fit, momento, semCroqui: !c });
      });
      transpMemo[id] = { id, codigo: blk.codigo, frente: blk.frente, descricao: blk.descricao, total, linhas: det };
      return total;
    }

    function desempenho() {
      const D = st.desempenho; if (!D) return null;
      const ctx = ctxBase();
      let sd = 0, cd = 0; const det = [];
      D.linhas.forEach(l => {
        let qkm;
        if (l.auxiliar) qkm = evaluate(l.qtdPorKmExpr, ctx);
        else {
          const tot = evaluate(l.qtdTotalExpr, ctx);
          const freq = evaluate(l.freqExpr, ctx);
          qkm = ext ? trunc(tot * l.ne * freq / ext, 3) : 0;
          l._tot = tot; l._freq = freq;
        }
        const p = precos[l.codigo] || {};
        const psd = Number(p.sd) || 0, pcd = Number(p.cd) || 0;
        sd += qkm * psd; cd += qkm * pcd;
        det.push({ codigo: l.codigo, descricao: p.descricao || '', grupo: l.grupo, memoria: l.memoria, unidade: l.unidade, qtdTotal: l._tot, ne: l.ne, freq: l._freq, qtdPorKm: qkm, puSD: psd, puCD: pcd, kmAnoSD: qkm * psd, kmAnoCD: qkm * pcd, auxiliar: !!l.auxiliar });
      });
      const kmMesSD = trunc(sd / 12, 2), kmMesCD = trunc(cd / 12, 2);
      return { linhas: det, kmAnoSD: sd, kmAnoCD: cd, kmMesSD, kmMesCD, mesSD: trunc(kmMesSD * ext, 2), mesCD: trunc(kmMesCD * ext, 2) };
    }
    const gd = desempenho();
    const precoDe = (codigo, col) => {
      if (codigo === (st.desempenho && st.desempenho.codigo) && gd) return col === 'sd' ? gd.mesSD : gd.mesCD;
      const p = precos[codigo]; return p ? Number(p[col]) || 0 : null;
    };

    function ctxBase(L) {
      return {
        vars: { prazo, ext, PI: Math.PI, neRocada: rocada.adotado, largura: Number((st.icp.parametros || {}).larguraFaixa) || 0, codigo: L ? L.codigo : '' },
        fns: {
          inv: k => { const i = (st.inventario || {})[k]; if (!i) { erros.push('Inventário sem a chave ' + k); return 0; } return Number(i.valor) || 0; },
          icp: id => icp.regras[id] ? icp.regras[id].adotado : 0,
          icpKm: id => icp.regras[id] ? icp.regras[id].km : 0,
          transp: id => transp(id),
          undia: (fr, cod) => { const t = (st.undia || {})[fr] || {}; return Number(t[String(cod)]) || 0; },
          qtd: id => line(id).qtd, base: id => line(id).base, fator: id => line(id).fator,
        },
      };
    }
    function line(id) {
      if (memo[id]) return memo[id];
      const L = byId[id]; if (!L) { erros.push('Linha inexistente: ' + id); return { qtd: 0, base: 0, fator: 0 }; }
      if (busy[id]) { erros.push('Referência circular na linha ' + L.item); return { qtd: 0, base: 0, fator: 0 }; }
      busy[id] = true;
      const ctx = ctxBase(L);
      let base = 0, fator = 0, qtd = 0, err = null;
      try {
        base = evaluate(L.baseExpr, ctx);
        if (L.modo === 'icp') { qtd = icp.regras[L.icpRegra] ? icp.regras[L.icpRegra].adotado : 0; fator = base ? qtd / base : 0; }
        else {
          fator = evaluate(L.fatorExpr === '' || L.fatorExpr == null ? '1' : L.fatorExpr, ctx);
          qtd = L.modo === 'round' ? round(base * fator, L.casas == null ? 3 : L.casas) : trunc(base * fator, L.casas == null ? 3 : L.casas);
        }
      } catch (e) { err = e.message; erros.push('Linha ' + L.item + ': ' + e.message); }
      const puSD = precoDe(L.codigo, 'sd'), puCD = precoDe(L.codigo, 'cd');
      const r = { id, base, fator, qtd, puSD, puCD, sd: puSD == null ? 0 : trunc(qtd * puSD, 2), cd: puCD == null ? 0 : trunc(qtd * puCD, 2), semPreco: puSD == null || puCD == null, erro: err };
      memo[id] = r; busy[id] = false; return r;
    }
    linhas.forEach(L => line(L.id));
    (st.transportes || []).forEach(b => transp(b.id));

    // estrutura de grupos pela ordem das linhas
    const grupos = (st.grupos || []).slice().sort((a, b) => a.linha - b.linha);
    const all = grupos.map(g => ({ tipo: 'g', linha: g.linha, g })).concat(linhas.map(L => ({ tipo: 'l', linha: L.linha, L }))).sort((a, b) => a.linha - b.linha);
    const res = {}; let top = null, sub = null; const ordem = [];
    all.forEach(x => {
      if (x.tipo === 'g') {
        const nivel = x.g.item.split('.').length;
        if (nivel === 1) { top = x.g; sub = null; }
        else if (nivel === 2) { sub = x.g; }
        ordem.push({ tipo: 'g', id: x.g.id, item: x.g.item, titulo: x.g.titulo, nivel });
        return;
      }
      const L = x.L; const r = memo[L.id];
      r.familia = top ? top.item : L.item.slice(0, 2); r.grupo = sub ? sub.item : null; r.grupoTitulo = sub ? sub.titulo : '';
      res[L.id] = r; ordem.push({ tipo: 'l', id: L.id });
    });
    const resumo = []; const idx = {};
    grupos.forEach(g => { if (g.item.split('.').length === 2) { idx[g.item] = { item: g.item, titulo: g.titulo, sd: 0, cd: 0, familia: g.item.slice(0, 2) }; resumo.push(idx[g.item]); } });
    let conservaSD = 0, conservaCD = 0, dsmSD = 0, dsmCD = 0;
    linhas.forEach(L => {
      const r = res[L.id]; if (!r) return;
      if (r.grupo && idx[r.grupo]) { idx[r.grupo].sd += r.sd; idx[r.grupo].cd += r.cd; }
      if (r.familia === '02') { dsmSD += r.sd; dsmCD += r.cd; } else { conservaSD += r.sd; conservaCD += r.cd; }
    });
    const totSD = conservaSD + dsmSD, totCD = conservaCD + dsmCD;
    resumo.forEach(g => { g.pSD = totSD ? g.sd / totSD : 0; g.pCD = totCD ? g.cd / totCD : 0; });
    const condicao = totSD <= totCD ? 'sd' : 'cd';

    // planilha contratual e curva ABC (por código)
    const dsmNoPrazo = opts.dsmNoPrazo != null ? opts.dsmNoPrazo : !!(st.parametros && st.parametros.dsmMultiplicaPrazo);
    function contratual(col, dobra) {
      if (dobra == null) dobra = dsmNoPrazo;
      const agg = {};
      linhas.forEach(L => {
        const r = res[L.id]; const mult = r.familia === '02' && !dobra ? 1 : prazo;
        const a = agg[L.codigo] || (agg[L.codigo] = { codigo: L.codigo, descricao: L.descricao || (precos[L.codigo] || {}).descricao, unidade: L.unidade, qtd: 0, pu: col === 'sd' ? r.puSD : r.puCD });
        a.qtd += r.qtd * mult;
      });
      const itens = Object.values(agg).map(a => Object.assign(a, { qtd: fix15(a.qtd), total: trunc((a.pu || 0) * fix15(a.qtd), 2) }));
      const total = itens.reduce((s, a) => s + a.total, 0);
      itens.sort((a, b) => b.total - a.total);
      let acc = 0; itens.forEach(a => { a.p = total ? a.total / total : 0; acc += a.p; a.acum = acc; a.faixa = acc <= 0.8 + 1e-12 ? 'A' : acc <= 0.95 + 1e-12 ? 'B' : 'C'; });
      return { itens, total };
    }
    const contratoSD = contratual('sd'), contratoCD = contratual('cd');
    const difDSM = { sd: contratual('sd', true).total - contratual('sd', false).total, cd: contratual('cd', true).total - contratual('cd', false).total };

    return {
      icp, rocada, fit: fitTab, desempenho: gd, transportes: transpMemo, linhas: res, ordem,
      resumo, totais: { conservaSD, conservaCD, dsmSD, dsmCD, sd: totSD, cd: totCD, condicao, pDSM: (condicao === 'sd' ? dsmSD / totSD : dsmCD / totCD) || 0 },
      contrato: { sd: contratoSD, cd: contratoCD, dsmNoPrazo, prazo, difDSM }, erros,
    };
  }

  // ---------- regras de validação (Res. DNIT nº 8/2023) ----------
  const ASFALTO = /^AM/;
  function validar(st, R, hoje) {
    const out = []; const add = (id, art, titulo, status, detalhe, ref) => out.push({ id, art, titulo, status, detalhe, ref: ref || [] });
    const P = st.projeto || {}; const linhas = st.linhas || [];
    const brl = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    hoje = hoje || new Date();

    // R01 data-base x abertura
    if (P.dataBase) {
      const [y, m] = P.dataBase.split('-').map(Number); const lim = new Date(y + 1, m - 1, 1);
      const ref = P.aberturaLicitacao ? new Date(P.aberturaLicitacao + 'T00:00:00') : hoje;
      const dentro = ref <= lim; const limTxt = lim.toLocaleDateString('pt-BR');
      add('R01', 'Art. 22, parágrafo único', 'Data-base com no máximo 1 ano até o início da licitação', dentro ? (P.aberturaLicitacao ? 'ok' : 'alerta') : 'erro',
        'Data-base ' + String(m).padStart(2, '0') + '/' + y + '; o prazo de 1 ano vai até ' + limTxt + '. ' + (P.aberturaLicitacao ? 'Início da licitação informado: ' + P.aberturaLicitacao.split('-').reverse().join('/') + '.' : (dentro ? 'Informe a data de início da licitação para confirmar.' : 'Esse prazo já passou e o início da licitação não foi informado. Se o processo ainda não começou, o orçamento precisa ir para o SICRO mais recente.')));
    } else add('R01', 'Art. 22, parágrafo único', 'Data-base com no máximo 1 ano até o início da licitação', 'erro', 'Data-base não informada.');

    // R02 DSM
    const pd = R.totais.pDSM;
    add('R02', 'Art. 6º, III', 'DSM limitados a 25% do orçamento inicial', pd <= 0.25 ? 'ok' : 'erro', 'DSM somam ' + brl(R.totais.condicao === 'sd' ? R.totais.dsmSD : R.totais.dsmCD) + ', ou ' + (pd * 100).toFixed(2).replace('.', ',') + '% do orçamento.');

    // R03 prazo
    const pz = Number(P.prazoAnos);
    add('R03', 'Art. 9º', 'Prazo de execução múltiplo de 1 ano', pz >= 1 && Number.isInteger(pz) ? 'ok' : 'erro', 'Prazo informado: ' + (P.prazoAnos || '—') + ' ano(s).');

    // R04 contrato: DSM no prazo
    const dif = R.contrato.difDSM ? R.contrato.difDSM[R.totais.condicao] : 0;
    add('R04', 'Art. 9º, § 3º', 'DSM não são de natureza continuada', R.contrato.dsmNoPrazo && R.contrato.prazo > 1 ? 'erro' : 'ok',
      R.contrato.dsmNoPrazo && R.contrato.prazo > 1 ? 'A planilha contratual multiplica também os DSM pelo prazo de ' + R.contrato.prazo + ' anos, repetindo obras pontuais. Isso acrescenta ' + brl(dif) + ' ao valor do contrato.' : 'Os DSM entram uma única vez na planilha contratual' + (dif > 0.01 ? ' (multiplicá-los pelo prazo acrescentaria ' + brl(dif) + ').' : '.'));

    // R05 grupo de desempenho I
    const temGD = linhas.some(L => L.codigo === 'GD');
    add('R05', 'Art. 5º, § 1º', 'Grupo de desempenho I obrigatório em rodovia pavimentada', P.tipo !== 'pavimentada' || temGD ? 'ok' : 'erro', temGD ? 'Item GD presente na planilha.' : 'Item de conservação da faixa de domínio por desempenho não encontrado.');

    // R06 origem
    const semOrigem = linhas.filter(L => !L.origem);
    add('R06', 'Art. 24, § 1º', 'Toda quantidade com origem declarada', semOrigem.length ? 'alerta' : 'ok', semOrigem.length ? semOrigem.length + ' linha(s) sem origem: ' + semOrigem.slice(0, 8).map(L => L.item).join(', ') + (semOrigem.length > 8 ? '…' : '') : 'Todas as ' + linhas.length + ' linhas declaram a origem.', semOrigem.map(L => L.id));

    // R07 acostamento fora de tapa-buraco / remendo
    const pav = linhas.filter(L => /^(4915757|4915631|4915632)$/.test(L.codigo));
    const comAcost = pav.filter(L => /acost_/.test(L.baseExpr || ''));
    add('R07', 'Art. 17, § 2º', 'Tapa-buraco e remendo calculados só sobre a pista', comAcost.length ? 'erro' : 'ok', comAcost.length ? 'A base usa acostamento nas linhas ' + comAcost.map(L => L.item).join(', ') + '.' : 'Base de cálculo restrita à faixa de pista nas ' + pav.length + ' linhas de reparo, tapa-buraco e remendo.', comAcost.map(L => L.id));

    // R08 mão de obra / equipamento como item
    const insumo = linhas.filter(L => /^[PE]\d{4}$/.test(L.codigo));
    add('R08', 'Art. 21', 'Sem mão de obra ou equipamento como item da planilha', insumo.length ? 'erro' : 'ok', insumo.length ? 'Itens de insumo direto: ' + insumo.map(L => L.codigo).join(', ') : 'Nenhum insumo de mão de obra ou equipamento lançado como item.', insumo.map(L => L.id));

    // R09 insumos asfálticos separados
    const am = linhas.filter(L => ASFALTO.test(L.codigo));
    const semTM = am.filter(L => !linhas.some(T => T.codigo === 'TM' + L.codigo.slice(2) && Math.abs(T.linha - L.linha) <= 2));
    add('R09', 'Art. 48, parágrafo único', 'Aquisição e transporte de betuminosos em itens próprios', semTM.length ? 'alerta' : 'ok', am.length + ' itens de aquisição de material betuminoso' + (semTM.length ? '; sem transporte ao lado: ' + semTM.map(L => L.item).join(', ') : ', todos com o transporte correspondente.'), semTM.map(L => L.id));

    // R10 binômio
    const bin = st.binomio || [];
    const poucos = bin.filter(b => (b.origens || []).length < 3);
    add('R10', 'Art. 46', 'Binômio com ao menos 3 origens por material betuminoso', !bin.length ? 'alerta' : poucos.length ? 'erro' : 'ok', !bin.length ? 'Nenhum binômio cadastrado.' : poucos.length ? 'Menos de 3 origens: ' + poucos.map(b => b.material).join('; ') : bin.length + ' materiais, todos com 3 ou mais origens.');

    // R11 engenheiro
    const eng = Number((st.adm || {}).engenheiroCoef);
    add('R11', 'Art. 25', 'Engenheiro supervisor entre 0,25 e 1,00', eng >= 0.25 && eng <= 1 ? 'ok' : 'erro', 'Coeficiente adotado: ' + (isNaN(eng) ? '—' : eng.toString().replace('.', ',')) + '.');

    // R12 fora do SICRO
    const fora = linhas.filter(L => !/^(\d{6,7}|AM\d+|TM\d+|GD|ADM|CAN|INSIND|MOB|DESMOB)$/.test(L.codigo));
    const codFora = [...new Set(fora.map(L => L.codigo))];
    add('R12', 'Art. 22 e art. 99', 'Composições fora do SICRO justificadas', codFora.length ? 'alerta' : 'ok', codFora.length ? 'Códigos próprios: ' + codFora.join(', ') + '. Precisam de composição e justificativa no processo.' : 'Todos os serviços usam código do SICRO.', fora.map(L => L.id));

    // R13 SNV
    const seg = (P.segmentos || []).slice().sort((a, b) => a.kmIni - b.kmIni);
    let gap = []; let cur = Number(P.kmIni);
    seg.forEach(s => { if (Math.abs(s.kmIni - cur) > 0.001) gap.push(cur.toFixed(1) + '–' + Number(s.kmIni).toFixed(1)); cur = Math.max(cur, s.kmFim); });
    if (seg.length && Math.abs(cur - Number(P.kmFim)) > 0.001) gap.push(cur.toFixed(1) + '–' + Number(P.kmFim).toFixed(1));
    add('R13', 'Art. 20, § 3º, e art. 33, I, a', 'SNV informado com versão e segmentos cobrindo o trecho', !P.snvVersao || !seg.length ? 'erro' : gap.length ? 'alerta' : 'ok', !seg.length ? 'Nenhum segmento SNV cadastrado.' : gap.length ? 'Lacunas entre segmentos: ' + gap.join(', ') : seg.length + ' segmentos na versão ' + P.snvVersao + ', cobrindo do km ' + P.kmIni + ' ao km ' + P.kmFim + '.');

    // R14 numeração
    const vistos = {}; const dup = []; linhas.forEach(L => { if (vistos[L.item]) dup.push(L.item); vistos[L.item] = 1; });
    const fora2 = []; R.ordem.forEach(o => { if (o.tipo !== 'l') return; const r = R.linhas[o.id]; const L = linhas.find(x => x.id === o.id); if (r.grupo && !L.item.startsWith(r.grupo + '.')) fora2.push(L.item + ' (dentro de ' + r.grupo + ')'); });
    add('R14', 'Organização da planilha', 'Numeração de itens única e coerente com o grupo', dup.length || fora2.length ? 'alerta' : 'ok', (dup.length ? 'Itens repetidos: ' + [...new Set(dup)].join(', ') + '. ' : '') + (fora2.length ? 'Itens numerados fora do grupo: ' + fora2.slice(0, 6).join('; ') + (fora2.length > 6 ? '…' : '') + '.' : '') || 'Numeração consistente.');

    // R15 histórico rastreável
    const h = (st.icp && st.icp.historico) || {}; const semFonte = Object.keys(h).filter(k => Number(h[k].valor) > 0 && !(h[k].contrato || h[k].medicao));
    add('R15', 'Art. 24, § 1º, e art. 84', 'Histórico executado com fonte rastreável', semFonte.length ? 'alerta' : 'ok', semFonte.length ? 'Histórico sem contrato ou medição de origem em: ' + semFonte.map(k => R.icp.regras[k] ? R.icp.regras[k].servico : k).join(', ') + '.' : 'Histórico vinculado a contrato e medição.');

    // R16 método ICP
    if (st.icp && st.icp.levantamento && st.icp.levantamento.some(r => r.sentido === 'D')) {
      const alt = calcICP(Object.assign({}, st, { icp: Object.assign({}, st.icp, { parametros: Object.assign({}, st.icp.parametros, { metodo: R.icp.metodo === 'planilha' ? 'faixas' : 'planilha' }) }) }));
      const diffs = Object.keys(R.icp.regras).filter(k => Math.abs(alt.regras[k].adotado - R.icp.regras[k].adotado) > 0.01).map(k => R.icp.regras[k].servico + ' ' + fmt(R.icp.regras[k].adotado) + ' → ' + fmt(alt.regras[k].adotado) + ' ' + R.icp.regras[k].unidade);
      add('R16', 'Art. 19, II e III, e Anexo XXVII', 'Quantidades do ICP refletem as duas faixas levantadas', R.icp.metodo === 'planilha' && diffs.length ? 'alerta' : 'ok',
        R.icp.metodo === 'planilha' ? 'O cálculo usa só a faixa crescente multiplicada por ' + R.icp.mult + ', mas o levantamento traz as duas faixas. Usando as duas: ' + (diffs.join('; ') || 'sem diferença') + '.' : 'Cálculo pelas duas faixas levantadas. Pelo método da planilha original seria: ' + (diffs.join('; ') || 'igual') + '.');
    }

    // R17 roçada mecanizada
    const inv = st.inventario || {}; const costal = Number((inv.rocadaCostal || {}).valor) || 0, mec = Number((inv.rocadaMec || {}).valor) || 0;
    add('R17', 'Art. 27', 'Roçada mecanizada preferencial; manual só com justificativa', costal > 0 && !(st.justificativas && st.justificativas.rocadaCostal) ? 'alerta' : 'ok', 'Inventário com ' + fmt(mec) + ' ha mecanizada e ' + fmt(costal) + ' ha costal.' + (costal > 0 ? ' A parcela costal precisa de justificativa registrada.' : ''));

    // R18 roçada DNIT 182
    add('R18', 'Art. 24, § 4º', 'Frequência de roçada pela DNIT 182/2018-PRO', R.rocada.adotado === R.rocada.sugerido ? 'ok' : 'alerta', 'Média ponderada das estações: ' + R.rocada.nerp.toFixed(2).replace('.', ',') + ' → sugerido ' + R.rocada.sugerido + ' roçadas/ano; adotado ' + R.rocada.adotado + '.');

    // R19 preços SD e CD
    const semP = Object.keys(R.linhas).filter(id => R.linhas[id].semPreco);
    add('R19', 'Art. 33, r e s', 'Preço com e sem desoneração em todas as linhas', semP.length ? 'erro' : 'ok', semP.length ? semP.length + ' linha(s) sem preço no banco: ' + semP.slice(0, 8).map(id => (linhas.find(L => L.id === id) || {}).codigo).join(', ') : 'Todas as linhas têm preço nas duas condições. Condição mais vantajosa: ' + (R.totais.condicao === 'sd' ? 'sem desoneração' : 'com desoneração') + '.', semP);

    // R20 sinalização de obras
    const sinal = linhas.some(L => /^521|^5213/.test(L.codigo));
    add('R20', 'Art. 44 e Anexo XIII', 'Sinalização de obras prevista para serviços na pista', sinal ? 'ok' : 'erro', sinal ? 'Dispositivos de sinalização de obras orçados.' : 'Nenhum dispositivo de sinalização de obras encontrado.');

    // R21 croqui x transportes
    const semC = []; Object.values(R.transportes).forEach(t => t.linhas.forEach(l => { if (l.semCroqui) semC.push(l.material + ' ' + l.origem + '→' + l.destino); }));
    add('R21', 'Art. 45 e Anexo IX', 'Toda DMT de transporte vem do croqui de ocorrências', semC.length ? 'erro' : 'ok', semC.length ? 'Sem DMT no croqui: ' + [...new Set(semC)].join('; ') : 'Todas as DMTs encontradas no croqui.');

    // R22 estimativas
    const est = linhas.filter(L => /ESTIMATIVA/i.test(L.origem));
    add('R22', 'Art. 18 e art. 24, § 1º', 'Estimativas apoiadas em justificativa técnica', est.length ? 'alerta' : 'ok', est.length ? est.length + ' linha(s) com origem "estimativa": ' + est.slice(0, 8).map(L => L.item).join(', ') + '. Precisam de nota técnica.' : 'Nenhuma quantidade por estimativa.', est.map(L => L.id));

    // R24 cotações de pétreos e areia
    const cot = st.cotacoes || [];
    const mats = [...new Set(Object.values(st.croqui || {}).filter(c => /PEDREIRA|AREAL|CENTRO SEDE/i.test(c.origem || '')).map(c => norm(c.material)))];
    const semCot = mats.filter(m => !cot.some(c => norm(c.material) === m || norm(c.material).includes(m) || m.includes(norm(c.material))));
    add('R24', 'Art. 45 e Anexo VII', 'Cotação de pétreos e areia junto com o croqui', !cot.length ? 'alerta' : semCot.length ? 'alerta' : 'ok',
      !cot.length ? 'Nenhuma cotação registrada.' : cot.length + ' cotações de ' + [...new Set(cot.map(c => c.fornecedor))].length + ' fornecedores.' + (semCot.length ? ' Materiais do croqui sem cotação: ' + semCot.join(', ') + '.' : ''));

    // R25 conferência com o SNV oficial
    if (st.snvRef && st.snvRef.length) {
      const prob = [];
      (P.segmentos || []).forEach(sg => { const o = st.snvRef.find(x => norm(x.codigo) === norm(sg.snv)); if (!o) prob.push(sg.snv + ' não existe no SNV importado'); else if (Math.abs(o.kmIni - sg.kmIni) > 0.05 || Math.abs(o.kmFim - sg.kmFim) > 0.05) prob.push(sg.snv + ': km ' + sg.kmIni + '–' + sg.kmFim + ' no projeto, ' + o.kmIni + '–' + o.kmFim + ' no SNV'); });
      add('R25', 'Art. 20, § 1º, I', 'Segmentos conferem com o SNV vigente', prob.length ? 'erro' : 'ok', prob.length ? prob.join('; ') + '.' : 'Todos os segmentos existem no SNV importado com os mesmos km.');
    } else add('R25', 'Art. 20, § 1º, I', 'Segmentos conferem com o SNV vigente', 'alerta', 'Importe a planilha do SNV vigente para conferir códigos e quilometragem.');

    // R26 BDI dos betuminosos na condição com desoneração
    const bs = Number((st.parametros || {}).bdiSD), bc = Number((st.parametros || {}).bdiCD);
    if (bs > 0 && bc > 0) {
      const esperado = (1 + bc) / (1 + bs); const ruins = [];
      [...new Set(linhas.filter(L => ASFALTO.test(L.codigo)).map(L => L.codigo))].forEach(c => { const p = (st.precos || {})[c]; if (p && p.sd > 0 && Math.abs(p.cd / p.sd / esperado - 1) > 0.01) ruins.push(c + ' (' + fmt(p.cd, 2) + ', esperado ' + fmt(p.sd * esperado, 2) + ')'); });
      let impacto = 0; Object.keys(R.linhas).forEach(id => { const L = linhas.find(x => x.id === id); if (L && ASFALTO.test(L.codigo) && ruins.some(r => r.startsWith(L.codigo + ' '))) impacto += R.linhas[id].cd - trunc(R.linhas[id].qtd * trunc(R.linhas[id].puSD * esperado, 2), 2); });
      add('R26', 'Art. 48 e IN DNIT nº 62/2021', 'Betuminosos com desoneração coerentes com o BDI', ruins.length ? 'erro' : 'ok', ruins.length ? 'O preço com desoneração não corresponde ao BDI de ' + fmt(bc * 100, 2) + '% sobre a base de ' + fmt(bs * 100, 2) + '%: ' + ruins.join('; ') + '. Efeito no total com desoneração: ' + brl(impacto) + '.' : 'Preços de aquisição com e sem desoneração seguem a mesma base e o BDI de cada condição.', linhas.filter(L => ruins.some(r => r.startsWith(L.codigo + ' '))).map(L => L.id));
    }

    // R27 quantidades a definir
    const aDef = linhas.filter(L => L.aPreencher && !(R.linhas[L.id] && R.linhas[L.id].base));
    if (linhas.some(L => L.aPreencher)) add('R27', 'Art. 24, §§ 1º e 6º', 'Quantidades por memória de cálculo informadas', aDef.length ? 'erro' : 'ok', aDef.length ? aDef.length + ' linha(s) ainda sem quantidade: ' + aDef.slice(0, 10).map(L => L.item).join(', ') + (aDef.length > 10 ? '…' : '') + '.' : 'Todas as quantidades por memória de cálculo foram informadas.', aDef.map(L => L.id));

    // R28 preços na data-base do projeto
    const pdb = (st.parametros || {}).precosDataBase;
    if (pdb) add('R28', 'Art. 22', 'Preços na mesma data-base do orçamento', pdb === P.dataBase ? 'ok' : 'erro', pdb === P.dataBase ? 'Banco de preços na data-base ' + pdb + '.' : 'O banco de preços está na data-base ' + pdb + ' e o orçamento em ' + (P.dataBase || '—') + '. Importe o SICRO da data-base do orçamento.');

    // R29 inventário e levantamento
    const invVals = Object.values(st.inventario || {}); const invOk = invVals.filter(i => Number(i.valor) > 0).length;
    add('R29', 'Art. 17 e art. 20', 'Inventário e levantamento do pavimento informados', !invOk || !(st.icp && st.icp.levantamento && st.icp.levantamento.length) ? 'erro' : 'ok', invOk + ' de ' + invVals.length + ' elementos do inventário com valor; ' + ((st.icp && st.icp.levantamento) || []).length + ' trechos no levantamento do ICP.');

    // R30 DMT e VMDf
    const dmt0 = []; Object.values(R.transportes).forEach(t => t.linhas.forEach(l => { if (l.qtd > 0 && !(l.dmt > 0)) dmt0.push(l.material + ' ' + l.origem + '→' + l.destino); }));
    const vmd0 = (st.fit || []).filter(f => !(Number(f.vmdf) > 0)).length;
    add('R30', 'Anexos VI, VIII e IX', 'DMT e VMDf informados para os transportes', dmt0.length || vmd0 ? 'erro' : 'ok', (dmt0.length ? 'Sem DMT: ' + [...new Set(dmt0)].join('; ') + '. ' : '') + (vmd0 ? vmd0 + ' linha(s) do FIT sem VMDf.' : '') || 'Todas as DMTs e VMDf informados.');

    // R23 erros de cálculo
    add('R23', 'Integridade do cálculo', 'Todas as expressões resolvidas', R.erros.length ? 'erro' : 'ok', R.erros.length ? R.erros.slice(0, 5).join(' · ') : 'Nenhuma referência quebrada.');
    return out;
  }
  function fmt(v, d) { return Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: d == null ? 3 : d }); }

  // ---------- comparação com o gabarito ----------
  function comparar(st, R, gab) {
    const diffs = []; let ok = 0;
    Object.keys(gab.linhas || {}).forEach(id => {
      const g = gab.linhas[id], r = R.linhas[id]; if (!r) { diffs.push({ id, campo: 'linha', esperado: '-', obtido: 'ausente' }); return; }
      let bom = true;
      [['qtd', 0.0015], ['sd', 0.011], ['cd', 0.011]].forEach(([c, tol]) => { if (g[c] != null && Math.abs((g[c] || 0) - (r[c] || 0)) > tol) { bom = false; diffs.push({ id, campo: c, esperado: g[c], obtido: r[c] }); } });
      if (bom) ok++;
    });
    const t = gab.totais || {};
    const subtotais = [];
    (gab.resumo || []).forEach(g => {
      if (g.item.split('.').length !== 2) return;
      let sd = 0, cd = 0; Object.keys(R.linhas).forEach(id => { if (R.linhas[id].grupo === g.item && gab.linhas[id]) { sd += gab.linhas[id].sd || 0; cd += gab.linhas[id].cd || 0; } });
      [['sd', sd, g.sd], ['cd', cd, g.cd]].forEach(([c, soma, plan]) => { if (Math.abs(soma - plan) > 0.011) subtotais.push({ item: g.item, titulo: g.titulo, condicao: c, somaLinhas: soma, subtotalPlanilha: plan, diferenca: soma - plan }); });
    });
    return { subtotais, linhasOk: ok, linhasTotal: Object.keys(gab.linhas || {}).length, diffs,
      totais: [['Total sem desoneração', t.sd, R.totais.sd], ['Total com desoneração', t.cd, R.totais.cd], ['Conservação sem desoneração', t.conservaSD, R.totais.conservaSD], ['DSM sem desoneração', t.dsmSD, R.totais.dsmSD]]
        .map(([n, e, o]) => ({ nome: n, esperado: e, obtido: o, ok: Math.abs((e || 0) - (o || 0)) < 0.011 })) };
  }

  const api = { compute, validar, comparar, evaluate, parse, trunc, round, calcICP };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PatoEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
