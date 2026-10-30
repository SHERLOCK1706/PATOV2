/* Importador de planilhas PATO no modelo da SR/DNIT/MT (estrutura da BR-158 km 326–416,8)
   e de arquivos avulsos (inventário, ICP, SNV, preços, cotações, histórico).
   Depende do SheetJS (XLSX). Navegador: window.PatoImport; Node: module.exports. */
(function (root) {
  'use strict';
  const num = x => { if (typeof x === 'number') return x; if (x == null || x === '') return null; const v = parseFloat(String(x).replace(/\./g, m => m).replace(',', '.')); return isNaN(v) ? null : v; };
  const norm = s => String(s == null ? '' : s).trim().toUpperCase();

  function wrap(wb) {
    const sh = n => wb.Sheets[n];
    const has = n => !!wb.Sheets[n];
    const cell = (n, a) => { const s = sh(n); return s ? s[a] : undefined; };
    const V = (n, a) => { const c = cell(n, a); return c ? (c.v instanceof Date ? c.v : c.v) : null; };
    const F = (n, a) => { const c = cell(n, a); if (!c) return null; if (c.f != null) return '=' + c.f; return c.v; };
    const maxRow = n => { const s = sh(n); if (!s || !s['!ref']) return 0; return XLSXref().decode_range(s['!ref']).e.r + 1; };
    return { sh, has, V, F, maxRow, names: wb.SheetNames };
  }
  let XL = null; function XLSXref() { return XL.utils; }

  const INV = {
    B15: ['pista_CP', 'Faixa de pista em concreto (CP)', 'kmf'], E15: ['pista_CA', 'Faixa de pista em concreto asfáltico (CA)', 'kmf'],
    H15: ['pista_TS', 'Faixa de pista em tratamento superficial (TS)', 'kmf'], K15: ['pista_NP', 'Faixa de pista não pavimentada (NP)', 'kmf'],
    B20: ['acost_CP', 'Acostamento em concreto (CP)', 'kmfa'], E20: ['acost_CA', 'Acostamento em CA', 'kmfa'],
    H20: ['acost_TS', 'Acostamento em TS', 'kmfa'], K20: ['acost_NP', 'Acostamento não pavimentado', 'kmfa'],
    Q16: ['meiofio_C', 'Meio-fio em concreto', 'm'], W16: ['meiofio_NR', 'Meio-fio não revestido', 'm'],
    N20: ['sarjeta_C', 'Sarjeta em concreto', 'm'], T20: ['sarjeta_NR', 'Sarjeta não revestida', 'm'],
    N25: ['valetaCorte_C', 'Valeta de proteção de corte revestida', 'm'], T25: ['valetaCorte_NR', 'Valeta de proteção de corte não revestida', 'm'],
    N29: ['valetaAterro_C', 'Valeta de proteção de aterro revestida', 'm'], T29: ['valetaAterro_NR', 'Valeta de proteção de aterro não revestida', 'm'],
    O34: ['descida', "Descidas d'água", 'm'], O39: ['bueiro', 'Volume de bueiros', 'm³'], O44: ['caiacao', 'Área de caiação', 'm²'],
    O49: ['oae', 'Obras de arte especiais', 'm'], C24: ['cerca', 'Cerca', 'km'], C29: ['rocadaCostal', 'Roçada com roçadeira costal', 'ha'],
    C34: ['rocadaMec', 'Roçada mecanizada', 'ha'], C39: ['capina', 'Capina', 'm²'], C44: ['gramada', 'Área gramada', 'm²'],
    AC15: ['placas', 'Área de placas', 'm²'], AC22: ['suportePL', 'Suportes de placa poliméricos', 'un'],
    AF27: ['tachaBi', 'Tachas e tachões bidirecionais', 'un'], AA27: ['tachaMono', 'Tachas e tachões monodirecionais', 'un'],
    AA36: ['defensa', 'Defensas', 'm'], AA41: ['newJersey', 'Barreira New Jersey', 'm'],
  };
  const INV_SHEETS = ['RESUMO_INVENT', 'RESUMO DO INVENTÁRIO', 'RESUMO DO INVENTARIO'];

  function lerInventario(W, aviso) {
    const s = INV_SHEETS.find(n => W.has(n)); if (!s) return null;
    const out = {};
    Object.keys(INV).forEach(c => { const [k, rot, un] = INV[c]; out[k] = { valor: num(W.V(s, c)) || 0, rotulo: rot, unidade: un, fonte: s + '!' + c, grupo: 'Resumo do inventário' }; });
    return { aba: s, itens: out };
  }

  // ---------- planilha completa ----------
  function importarPATO(wb, XLSX) {
    XL = XLSX; const W = wrap(wb); const avisos = [];
    const exig = ['CAPA', 'PATO', 'BD', 'RESUMO_INVENT', 'CALCULO_ICP', 'ICP'];
    const falta = exig.filter(n => !W.has(n));
    if (falta.length) throw new Error('A planilha não segue o modelo esperado. Faltam as abas: ' + falta.join(', ') + '.');
    const db = W.V('CAPA', 'B85');
    const dbStr = db instanceof Date ? db.getFullYear() + '-' + String(db.getMonth() + 1).padStart(2, '0') : String(db || '');
    const segTxt = String(W.V('CAPA', 'D77') || '');
    const kms = (segTxt.match(/[\d.,]+/g) || []).map(x => num(x.replace('.', '').replace(',', '.')));
    const projeto = {
      nome: 'PATO ' + (W.V('CAPA', 'D74') || '') + ' ' + segTxt, rodovia: W.V('CAPA', 'D74') || '', trecho: W.V('CAPA', 'D75'), subtrecho: W.V('CAPA', 'D76'), segmento: segTxt,
      kmIni: kms[0] || null, kmFim: kms[1] || null, extensao: Math.round((num(W.V('CAPA', 'D78')) || 0) * 1000) / 1000, snv: W.V('CAPA', 'D79'),
      snvVersao: String(W.V('CAPA', 'D80') || '').replace(/[()]/g, '').replace(/vers[aã]o/i, '').trim(), prazoAnos: num(W.V('CAPA', 'D81')) || 1, periodoMeses: 12,
      dataBase: dbStr, unidadeLocal: W.has('CAD_SEG') ? (W.V('CAD_SEG', 'H9') || '') : '', uf: 'MT', tipo: 'pavimentada', aberturaLicitacao: '',
    };
    const segs = [];
    if (W.has('CAD_SEG')) for (let r = 20; r < 80; r++) {
      const s = W.V('CAD_SEG', 'A' + r); if (!s || !/^\d{3}[A-Z]{3}\d{4}/.test(String(s))) continue;
      const pr = W.has('CAD_PISTA') ? (() => { for (let q = 18; q < 80; q++) if (String(W.V('CAD_PISTA', 'A' + q)) === String(s)) return q; return null; })() : null;
      const kmv = x => num(String(x == null ? '' : x).replace(',', '.'));
      segs.push({ snv: String(s), tipoPista: W.V('CAD_SEG', 'B' + r), kmIni: kmv(W.V('CAD_SEG', 'C' + r)), kmFim: kmv(W.V('CAD_SEG', 'D' + r)),
        latIni: W.V('CAD_SEG', 'E' + r), lonIni: W.V('CAD_SEG', 'F' + r), latFim: W.V('CAD_SEG', 'G' + r), lonFim: W.V('CAD_SEG', 'H' + r),
        revestimento: pr ? W.V('CAD_PISTA', 'I' + pr) : null, faixas: pr ? num(W.V('CAD_PISTA', 'J' + pr)) : null, largura: pr ? num(W.V('CAD_PISTA', 'K' + pr)) : null });
    }
    projeto.segmentos = segs;
    const inventario = lerInventario(W).itens;
    const invkey = c => { if (INV[c]) return INV[c][0]; const k = 'inv_' + c; if (!inventario[k]) { inventario[k] = { valor: num(W.V('RESUMO_INVENT', c)) || 0, rotulo: 'Resumo do inventário, célula ' + c, unidade: '', fonte: 'RESUMO_INVENT!' + c, grupo: 'Resumo do inventário' }; avisos.push('Célula do inventário sem nome padrão: ' + c); } return k; };

    // ICP
    const lev = []; const lvl = (r, cols) => { const nm = ['Alta', 'Média', 'Baixa', 'SR']; for (let i = 0; i < 4; i++) if (norm(W.V('ICP', cols[i] + r)) === 'X') return nm[i]; return 'SR'; };
    for (let r = 5; r < 1000; r++) {
      if (W.V('ICP', 'E' + r) == null) continue;
      const ki = num(W.V('ICP', 'F' + r)), kf = num(W.V('ICP', 'G' + r)); if (ki == null || kf == null) continue;
      lev.push({ sentido: kf > ki ? 'C' : 'D', kmIni: ki, kmFim: kf, panela: lvl(r, 'IJKL'), remendo: lvl(r, 'MNOP'), trinca: lvl(r, 'QRST'), intervPrim: W.V('ICP', 'W' + r) || '', intervSec: W.V('ICP', 'X' + r) || '' });
    }
    const ICPROW = { 5: 'RL', 6: 'TP', 7: 'RP', 8: 'COR', 9: 'FSD', 10: 'FSC', 11: 'MICRO' };
    const hist = {}; Object.keys(ICPROW).forEach(r => { const f = W.F('CALCULO_ICP', 'K' + r), v = num(W.V('CALCULO_ICP', 'K' + r)); hist[ICPROW[r]] = { valor: v || 0, memoria: f == null ? '' : String(f), fonte: 'Digitado na CALCULO_ICP (sem vínculo com medição)' }; });
    const icp = {
      parametros: { larguraFaixa: num(W.V('CALCULO_ICP', 'O3')) || 3.6, fatorFaixas: num(W.V('CALCULO_ICP', 'H5')) || 2, metodo: 'planilha' },
      levantamento: lev, historico: hist,
      regras: [
        { id: 'RL', servico: 'Reparo localizado', classes: [['W', 'RL/TP/RP']], neExpr: String(num(W.V('CALCULO_ICP', 'O5')) || 10), unidade: 'm³', neFonte: 'Manual de Conservação (IPR 710)' },
        { id: 'TP', servico: 'Tapa-buraco', classes: [['W', 'RL/TP/RP']], neExpr: String(num(W.V('CALCULO_ICP', 'O6')) || 8), unidade: 'm³', neFonte: 'Manual de Conservação (IPR 710)' },
        { id: 'RP', servico: 'Remendo profundo', classes: [['W', 'RL/TP/RP'], ['W', 'REMENDO PROFUNDO']], neExpr: '1000*largura*0.25*' + (num(W.V('CALCULO_ICP', 'O7')) || 0.02), unidade: 'm³', neFonte: 'Percentual da faixa, espessura 0,25 m' },
        { id: 'COR', servico: 'Correção de defeitos', classes: [['W', 'CORREÇÃO+FS DESC']], neExpr: '1000*largura*0.05*' + (num(W.V('CALCULO_ICP', 'O8')) || 0.1), unidade: 'm³', neFonte: 'Percentual da faixa, espessura 0,05 m' },
        { id: 'FSD', servico: 'Fresagem descontínua', classes: [['X', 'CORREÇÃO+FS DESC'], ['X', 'FS DESC+MICRO']], neExpr: '1000*largura*0.05*' + (num(W.V('CALCULO_ICP', 'O9')) || 0.2), unidade: 'm³', neFonte: 'Percentual da faixa, espessura 0,05 m' },
        { id: 'FSC', servico: 'Fresagem contínua', classes: [['X', 'FS CONT']], neExpr: '1000*largura*0.05*' + (num(W.V('CALCULO_ICP', 'O10')) || 1), unidade: 'm³', neFonte: '100% da faixa, espessura 0,05 m' },
        { id: 'MICRO', servico: 'Microrrevestimento a frio', somaRegras: ['COR', 'FSD'], neExpr: '1000*largura*' + (num(W.V('CALCULO_ICP', 'O11')) || 1), unidade: 'm²', neFonte: '100% da faixa' },
      ],
    };
    const gabIcp = {}; Object.keys(ICPROW).forEach(r => gabIcp[ICPROW[r]] = { km: num(W.V('CALCULO_ICP', 'D' + r)), calc: num(W.V('CALCULO_ICP', 'I' + r)), adotado: num(W.V('CALCULO_ICP', 'M' + r)) });

    // UN.DIA
    const undia = {}; const UNDIA_START = {};
    if (W.has('UN_DIA')) {
      let frente = null, ini = null;
      for (let r = 14; r < W.maxRow('UN_DIA') + 1; r++) {
        const b = String(W.V('UN_DIA', 'B' + r) || '').trim();
        if (/^GRUPO DE DESEMPENHO/i.test(b)) frente = 'GD'; else if (/^SERVI[CÇ]OS DE CONSERVA/i.test(b)) frente = 'CONSERVA'; else if (/^DSM \d/.test(b)) frente = b;
        const k = W.V('UN_DIA', 'K' + r);
        if (frente && k != null && /^\d+$/.test(String(k))) { (undia[frente] = undia[frente] || {})[String(k)] = num(W.V('UN_DIA', 'L' + r)) || 0; if (!Object.values(UNDIA_START).includes(frente) || UNDIA_START[r] === undefined) { if (!Object.values(UNDIA_START).includes(frente)) UNDIA_START[r] = frente; } }
      }
    }
    const undiaFrente = startRow => UNDIA_START[startRow] || Object.entries(UNDIA_START).filter(([r]) => Number(r) <= startRow).sort((a, b) => b[0] - a[0]).map(x => x[1])[0] || 'CONSERVA';

    // croqui
    const croqui = {}; let lastMat = null;
    if (W.has('CROQUI')) for (let r = 22; r < 120; r++) {
      const key = W.V('CROQUI', 'N' + r); if (!key) continue;
      const g = c => num(W.V('CROQUI', c + r));
      const mat = W.V('CROQUI', 'G' + r) || lastMat; lastMat = mat;
      croqui[String(key)] = { material: mat || '', origem: W.V('CROQUI', 'J' + r) || '', destino: W.V('CROQUI', 'L' + r) || '', LN: g('O'), RP: g('Q'), P: g('S'), Pu: g('W') };
    }
    // FIT
    const fit = []; const fitStart = {};
    if (W.has('FIT')) { let grp = 'CONSERVA'; for (let r = 14; r < 60; r++) {
      const c = String(W.V('FIT', 'C' + r) || '');
      if (/^CONSERVA/i.test(c)) { grp = 'CONSERVA'; continue; } if (/^DSM \d/.test(c)) { grp = c.trim(); fitStart[r + 1] = grp; continue; }
      if (W.V('FIT', 'I' + r) == null || !c) continue;
      if (grp === 'CONSERVA' && !fitStart[r] && !Object.values(fitStart).includes('CONSERVA')) fitStart[r] = 'CONSERVA';
      fit.push({ frente: grp, codigo: c, chave: W.V('FIT', 'I' + r), vmdf: num(W.V('FIT', 'M' + r)), fitPlanilha: num(W.V('FIT', 'P' + r)) });
    } }
    const COLMAP = { 2: 'LN', 4: 'RP', 6: 'P', 10: 'Pu' };

    // transportes
    const transportes = []; const gabTransp = {};
    const txExpr = (f, s) => { if (f == null) return '0'; if (typeof f !== 'string' || !f.startsWith('=')) return String(f); return f.slice(1).replace(/\$?G\$?(\d+)/g, (m, n) => String(num(W.V(s, 'G' + n)))); };
    ['TRANSPORTES_CONSERVA', 'TRANSPORTES_DSM'].forEach(sheet => {
      if (!W.has(sheet)) return; let frente = sheet === 'TRANSPORTES_CONSERVA' ? 'CONSERVA' : null; const maxr = W.maxRow(sheet);
      for (let r = 1; r <= maxr; r++) {
        const b = W.V(sheet, 'B' + r);
        if (typeof b === 'string' && /^DSM/.test(b)) frente = b.trim();
        if (b != null && W.V(sheet, 'B' + (r + 1)) === 'CÓDIGO') {
          const blk = { id: sheet + '-' + r, frente, codigo: String(b), descricao: W.V(sheet, 'C' + r), linhas: [] };
          let rr = r + 3;
          while (rr <= maxr && !['TOTAL:', 'TOTAL'].includes(String(W.V(sheet, 'B' + rr) || '').trim()) && !String(W.F(sheet, 'O' + rr) || '').startsWith('=SUM(')) {
            const code = W.V(sheet, 'B' + rr);
            if (code != null) {
              const e = String(W.F(sheet, 'E' + rr) || ''); const m = e.match(/PATO!\$D\$(\d+):\$J\$(\d+)/);
              const mm = String(W.F(sheet, 'M' + rr) || ''); const mc = mm.match(/CROQUI!\$?N\$?22:\$?[A-Z]+\$?\d+,(\d+)/);
              const nn = W.F(sheet, 'N' + rr); const fr = String(nn || '').match(/FIT!\$I\$(\d+):\$P\$(\d+)/);
              const key = '' + W.V(sheet, 'D' + rr) + W.V(sheet, 'J' + rr) + W.V(sheet, 'K' + rr);
              let fitFrente = null; if (fr) { const st0 = Number(fr[1]); fitFrente = fitStart[st0] || (st0 < 21 ? 'CONSERVA' : null) || fit.filter(x => x.frente !== 'CONSERVA').map(x => x.frente)[0]; if (st0 === 15) fitFrente = 'CONSERVA'; }
              blk.linhas.push({ servico: String(code), material: W.V(sheet, 'D' + rr), origem: W.V(sheet, 'J' + rr), destino: W.V(sheet, 'K' + rr), chave: key,
                consumoExpr: txExpr(W.F(sheet, 'G' + rr), sheet), consumoMemoria: String(W.F(sheet, 'G' + rr)), faixaPATO: m ? [Number(m[1]), Number(m[2])] : null,
                colunaDMT: mc ? COLMAP[Number(mc[1])] : null, dmtPlanilha: num(W.V(sheet, 'M' + rr)), usaFIT: !!fr, fitFrente, fitFixo: fr ? null : num(nn), momentoPlanilha: num(W.V(sheet, 'O' + rr)) });
              if (!m) avisos.push('Transporte sem faixa da planilha PATO: ' + sheet + ' linha ' + rr);
            }
            rr++;
          }
          blk.totalPlanilha = num(W.V(sheet, 'O' + rr)); transportes.push(blk); gabTransp[sheet + '!O' + rr] = blk.id; r = rr;
        }
      }
    });
    // FIT das frentes de DSM pela posição real na aba
    if (W.has('FIT')) { let grp = 'CONSERVA'; const starts = {}; for (let r = 14; r < 60; r++) { const c = String(W.V('FIT', 'C' + r) || ''); if (/^DSM \d/.test(c)) grp = c.trim(); else if (W.V('FIT', 'I' + r) != null && !(grp in starts)) starts[grp] = r; }
      const inv2 = {}; Object.keys(starts).forEach(g => inv2[starts[g]] = g);
      transportes.forEach(b => { const sheet = b.id.slice(0, b.id.lastIndexOf('-')); const r0 = Number(b.id.slice(b.id.lastIndexOf('-') + 1)); let rr = r0 + 3; b.linhas.forEach(l => { while (W.V(sheet, 'B' + rr) == null) rr++; const fr = String(W.F(sheet, 'N' + rr) || '').match(/FIT!\$I\$(\d+)/); if (fr && inv2[Number(fr[1])]) l.fitFrente = inv2[Number(fr[1])]; rr++; }); });
    }

    // desempenho
    const invExpr = f => { let s = String(f); if (s.startsWith('=')) s = s.slice(1); return s.replace(/RESUMO_INVENT!\$?([A-Z]+)\$?(\d+)/g, (m, a, b) => 'inv("' + invkey(a + b) + '")'); };
    const desempenho = { codigo: 'GD', descricao: 'Conservação da faixa de domínio e limpeza de dispositivos', linhas: [] };
    if (W.has('DESEMPENHO')) { let grupo = null; for (let r = 18; r < 40; r++) {
      const b = W.V('DESEMPENHO', 'B' + r); if (b == null) continue; if (/^GD/.test(String(b))) { grupo = W.V('DESEMPENHO', 'C' + r); continue; } if (!/^\d/.test(String(b))) continue;
      const d = W.F('DESEMPENHO', 'D' + r), e = W.F('DESEMPENHO', 'E' + r), fq = W.F('DESEMPENHO', 'F' + r), h = W.F('DESEMPENHO', 'H' + r);
      const row = { codigo: String(b), grupo, memoria: W.V('DESEMPENHO', 'G' + r), unidade: W.V('DESEMPENHO', 'I' + r), qtdPorKmPlanilha: num(W.V('DESEMPENHO', 'H' + r)) };
      if (d === '-' || d == null || W.V('DESEMPENHO', 'D' + r) === '-') { const m = String(h).match(/UN_DIA!\$K\$(\d+)/); row.auxiliar = true; row.qtdPorKmExpr = m ? 'undia("GD","' + b + '")' : String(num(W.V('DESEMPENHO', 'H' + r)) || 0); }
      else { row.qtdTotalExpr = invExpr(d); row.ne = num(e); row.freqExpr = /NE_ROCADA/.test(String(fq)) ? 'neRocada' : String(num(fq)); }
      desempenho.linhas.push(row);
    } desempenho.precoMesPlanilhaSD = num(W.V('DESEMPENHO', 'K36')); desempenho.precoMesPlanilhaCD = num(W.V('DESEMPENHO', 'M36')); }
    const rocada = { estacoes: [], nePlanilha: W.has('NE_ROCADA') ? num(W.V('NE_ROCADA', 'H11')) : null };
    if (W.has('NE_ROCADA')) for (let r = 3; r < 15; r++) { const c = W.V('NE_ROCADA', 'C' + r); if (c == null || !num(W.V('NE_ROCADA', 'G' + r))) continue; rocada.estacoes.push({ codigo: String(c), uf: W.V('NE_ROCADA', 'D' + r), nome: W.V('NE_ROCADA', 'E' + r), municipio: W.V('NE_ROCADA', 'F' + r), distancia: num(W.V('NE_ROCADA', 'G' + r)), nere: num(W.V('NE_ROCADA', 'H' + r)) }); }

    // preços
    const precos = {};
    for (let r = 4; r < Math.max(200, W.maxRow('BD') + 1); r++) {
      const c = W.V('BD', 'B' + r); if (c == null) continue; const sd = num(W.V('BD', 'E' + r)), cd = num(W.V('BD', 'F' + r)); if (sd == null && cd == null) continue;
      const fe = String(W.F('BD', 'E' + r) || '');
      const fonte = /onerado/.test(fe) ? 'SICRO (composições do Compor, arquivo externo)' : /RESUMO_ANP/.test(fe) ? 'Binômio de betuminosos' : /DESEMPENHO/.test(fe) ? 'Grupo de desempenho (calculado)' : /(ADM_LOCAL|CANTEIRO|USINA|MOB|E125)/.test(fe) ? 'Planilha auxiliar (administração, canteiro, usina ou mobilização)' : 'Valor fixo';
      precos[String(c)] = { descricao: W.V('BD', 'C' + r), unidade: W.V('BD', 'D' + r), sd, cd, fonte };
    }
    // binômio
    const binomio = [];
    if (W.has('BINOMIO_ANP')) {
      const s = W.sh('BINOMIO_ANP'); const R = XL.utils.decode_range(s['!ref']);
      const rowVals = r => { const o = []; for (let c = R.s.c; c <= R.e.c; c++) { const x = s[XL.utils.encode_cell({ r: r - 1, c })]; if (x && x.v !== '' && x.v != null) o.push(x.v); } return o; };
      let cur = null; let pend = 0;
      for (let r = 1; r <= R.e.r + 1; r++) {
        const v = rowVals(r); if (!v.length) continue;
        if (typeof v[0] === 'string' && v[0].startsWith('CUSTO DO MATERIAL BETUMINOSO')) { cur = { material: null, origens: [] }; binomio.push(cur); continue; }
        if (!cur) continue;
        if (!cur.material && typeof v[0] === 'string' && !v[0].startsWith('COM BASE') && v.length <= 3 && !/ORIGEM/.test(v[0])) { cur.material = v[0]; continue; }
        if (typeof v[0] === 'string' && /^[RD]-\d$/.test(v[0].trim())) cur.origens.push({ origem: v[0].trim(), uf: v[1], local: String(v[2]).trim() });
        if (v.some(x => typeof x === 'string' && /\) TOTAL/.test(x))) pend = r;
        if (pend && r === pend + 1) { v.filter(x => typeof x === 'number').forEach((x, i) => { if (cur.origens[i]) cur.origens[i].aquisicao = Math.round(x * 100) / 100; }); }
        if (pend && r === pend + 2) { v.filter(x => typeof x === 'number').forEach((x, i) => { if (cur.origens[i]) cur.origens[i].transporte = Math.round(x * 100) / 100; }); pend = 0; }
      }
    }

    // linhas do PATO
    const linhas = [], grupos = [], rows = {};
    const maxP = W.maxRow('PATO');
    for (let r = 15; r <= maxP; r++) {
      const c = W.V('PATO', 'C' + r), d = W.V('PATO', 'D' + r), f = W.F('PATO', 'F' + r);
      if (typeof c === 'string' && /^\d\d(\.\d\d)*(-[A-Z])?$/.test(c.trim())) {
        if (d == null || f == null) { const t = ['D', 'E', 'F'].map(x => W.V('PATO', x + r)).find(x => typeof x === 'string' && x.length > 6) || ''; grupos.push({ id: 'L' + r, item: c.trim(), titulo: String(t).trim(), linha: r }); continue; }
        rows[r] = true; linhas.push({ id: 'L' + r, linha: r, item: c.trim() });
      }
    }
    const conv = (expr, r, kind) => {
      if (expr == null) return '0'; if (typeof expr !== 'string') return String(expr); if (!expr.startsWith('=')) return String(num(expr));
      let s = expr.slice(1);
      const outros = (s.match(/([A-Z_]+)!/g) || []).map(x => x.slice(0, -1));
      const ok = ['RESUMO_INVENT', 'CALCULO_ICP', 'TRANSPORTES_CONSERVA', 'TRANSPORTES_DSM', 'UN_DIA'];
      if (outros.some(o => !ok.includes(o))) {
        const k = 'cad_L' + r; inventario[k] = { valor: num(W.V('PATO', kind + r)) || 0, rotulo: String(W.V('PATO', 'E' + r) || ''), unidade: W.V('PATO', 'G' + r) || '', fonte: 'Cadastro: ' + s.slice(0, 160), grupo: 'Quantidades de cadastro' };
        return 'inv("' + k + '")';
      }
      s = s.replace(/VLOOKUP\(\$?D\$?\d+,UN_DIA!\$K\$(\d+):\$L\$\d+,2,FALSE\)/g, (m, a) => 'undia("' + undiaFrente(Number(a)) + '",codigo)');
      s = s.replace(/RESUMO_INVENT!\$?([A-Z]+)\$?(\d+)/g, (m, a, b) => 'inv("' + invkey(a + b) + '")');
      s = s.replace(/CALCULO_ICP!\$?M\$?(\d+)/g, (m, a) => 'icp("' + ICPROW[a] + '")');
      s = s.replace(/CALCULO_ICP!\$?D\$?(\d+)/g, (m, a) => 'icpKm("' + ICPROW[a] + '")');
      s = s.replace(/(TRANSPORTES_CONSERVA|TRANSPORTES_DSM)!\$?O\$?(\d+)/g, (m, a, b) => { const id = gabTransp[a + '!O' + b]; if (!id) avisos.push('Total de transporte não encontrado: ' + a + '!O' + b); return 'transp("' + id + '")'; });
      s = s.split('$R$7').join('prazo').split('PI()').join('PI');
      s = s.replace(/(\d+(?:\.\d+)?)%/g, '($1/100)');
      s = s.replace(/(^|[^A-Z])\$?D\$?9(?!\d)/g, '$1ext');
      s = s.replace(/\$?([FHJ])\$?(\d+)/g, (m, col, n) => { if (!rows[n]) avisos.push('Referência a linha que não é item: ' + col + n + ' na linha ' + r); return ({ J: 'qtd', F: 'base', H: 'fator' })[col] + '("L' + n + '")'; });
      return s;
    };
    const gab = { linhas: {}, icp: gabIcp, transportes: {} };
    linhas.forEach(L => {
      const r = L.linha; const g = c => W.F('PATO', c + r), gv = c => W.V('PATO', c + r);
      L.origem = String(g('B') || '').trim(); L.codigo = String(g('D')).trim(); L.descricao = gv('E'); L.unidade = gv('K'); L.unidadeBase = gv('G');
      const jf = String(g('J'));
      if (/CALCULO_ICP/.test(jf)) { L.modo = 'icp'; L.icpRegra = ICPROW[jf.match(/M(\d+)/)[1]]; L.baseExpr = conv(g('F'), r, 'F'); L.fatorExpr = ''; }
      else { const m = jf.match(/^=(TRUNC|ROUND)\(.*,(\d)\)$/); L.modo = m ? m[1].toLowerCase() : 'trunc'; L.casas = m ? Number(m[2]) : 3; L.baseExpr = conv(g('F'), r, 'F'); L.fatorExpr = conv(g('H'), r, 'H'); }
      L.memoriaPlanilha = { F: String(g('F')), H: String(g('H')), J: jf };
      gab.linhas[L.id] = { base: num(gv('F')), fator: num(gv('H')), qtd: num(gv('J')), puSD: num(gv('L')), sd: num(gv('M')), puCD: num(gv('N')), cd: num(gv('O')) };
    });
    // totais da planilha: procura as linhas de total
    let tSD = null, tCD = null, cSD = null, cCD = null, dSD = null, dCD = null;
    for (let r = 15; r <= maxP; r++) { const t = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'].map(x => W.V('PATO', x + r)).filter(x => typeof x === 'string').join(' ').toUpperCase();
      if (/TOTAL\s+GERAL/.test(t)) { tSD = num(W.V('PATO', 'M' + r)); tCD = num(W.V('PATO', 'O' + r)); }
      else if (/PREÇO TOTAL DOS SERVIÇOS DE CONSERVAÇÃO/.test(t)) { cSD = num(W.V('PATO', 'M' + r)); cCD = num(W.V('PATO', 'O' + r)); }
      else if (/PREÇO TOTAL DOS DEMAIS/.test(t)) { dSD = num(W.V('PATO', 'M' + r)); dCD = num(W.V('PATO', 'O' + r)); } }
    gab.totais = { sd: tSD, cd: tCD, conservaSD: cSD, conservaCD: cCD, dsmSD: dSD, dsmCD: dCD };
    if (W.has('QUANTIDADES')) for (let r = 15; r < W.maxRow('QUANTIDADES') + 1; r++) { const b = String(W.V('QUANTIDADES', 'B' + r) || ''); if (/TOTAL\s+GERAL/i.test(b)) gab.totais.contratoSD = num(W.V('QUANTIDADES', 'I' + r)); }
    gab.resumo = [];
    if (W.has('RESUMO_PATO')) for (let r = 17; r < 40; r++) { const it = W.V('RESUMO_PATO', 'B' + r); if (it && /^\d\d/.test(String(it))) gab.resumo.push({ item: String(it), titulo: W.V('RESUMO_PATO', 'C' + r), sd: num(W.V('RESUMO_PATO', 'D' + r)), cd: num(W.V('RESUMO_PATO', 'F' + r)) }); }
    transportes.forEach(b => gab.transportes[b.id] = b.totalPlanilha);
    const adm = { engenheiroCoef: W.has('ADM_LOCAL') ? num(W.V('ADM_LOCAL', 'F24')) : null, vigia: 0 };
    const bdiSD = W.has('BDI') ? num(W.V('BDI', 'E25')) : null, bdiCD = W.has('BDI') ? num(W.V('BDI', 'E44')) : null;
    const parametros = { dsmMultiplicaPrazo: false, precosDataBase: dbStr, bdiSD: bdiSD ? bdiSD / 100 : null, bdiCD: bdiCD ? bdiCD / 100 : null };
    return { estado: { versao: 1, projeto, inventario, icp, undia, croqui, fit, transportes, desempenho, rocada, precos, binomio, grupos, linhas, adm, gabarito: gab, parametros, cotacoes: [], justificativas: {} }, avisos };
  }

  // ---------- arquivos avulsos ----------
  function tabela(wb, XLSX, prefer) {
    const nome = (prefer || []).find(n => wb.Sheets[n]) || wb.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, defval: null, raw: true });
    return { nome, rows };
  }
  function acharCabecalho(rows, testes) {
    for (let i = 0; i < Math.min(rows.length, 40); i++) {
      const r = rows[i].map(x => norm(x));
      const idx = {}; let ok = true;
      for (const [k, re] of Object.entries(testes)) { const j = r.findIndex(c => re.test(c)); if (j < 0) { if (!k.endsWith('?')) { ok = false; break; } } else idx[k.replace('?', '')] = j; }
      if (ok) return { linha: i, idx };
    }
    return null;
  }
  function importarSNV(wb, XLSX, rodovia) {
    const { rows } = tabela(wb, XLSX);
    const h = acharCabecalho(rows, { codigo: /^C[ÓO]D|SNV/, kmIni: /KM.*INI|INICIAL/, kmFim: /KM.*FIN|FINAL/, 'ext?': /EXTENS/, 'sup?': /SUPERF|SITUA/, 'br?': /^BR$|RODOVIA/, 'uf?': /^UF$/, 'local?': /LOCAL|IN[ÍI]CIO/ });
    if (!h) throw new Error('Não encontrei as colunas de código, km inicial e km final do SNV.');
    const out = [];
    rows.slice(h.linha + 1).forEach(r => { const c = r[h.idx.codigo]; if (!c) return; out.push({ codigo: String(c).trim(), kmIni: num(r[h.idx.kmIni]), kmFim: num(r[h.idx.kmFim]), extensao: h.idx.ext != null ? num(r[h.idx.ext]) : null, superficie: h.idx.sup != null ? r[h.idx.sup] : null, uf: h.idx.uf != null ? r[h.idx.uf] : null, br: h.idx.br != null ? r[h.idx.br] : null }); });
    return out;
  }
  function importarICPAvulso(wb, XLSX) {
    if (wb.Sheets.ICP && wb.Sheets.CALCULO_ICP) { XL = XLSX; return importarPATO(wb, XLSX).estado.icp.levantamento; }
    const { rows } = tabela(wb, XLSX);
    const h = acharCabecalho(rows, { kmIni: /KM.*INI/, kmFim: /KM.*FIN/, panela: /PANELA/, remendo: /REMENDO/, trinca: /TRINC/, 'sentido?': /SENTIDO|FAIXA|PISTA/, 'prim?': /PRIM/, 'sec?': /SECUND/ });
    if (!h) throw new Error('Colunas esperadas: km inicial, km final, sentido, panela, remendo, trinca, intervenção primária e secundária.');
    const nv = x => { const s = norm(x); return s.startsWith('A') ? 'Alta' : s.startsWith('M') ? 'Média' : s.startsWith('B') ? 'Baixa' : 'SR'; };
    return rows.slice(h.linha + 1).filter(r => num(r[h.idx.kmIni]) != null).map(r => { const ki = num(r[h.idx.kmIni]), kf = num(r[h.idx.kmFim]); const sn = h.idx.sentido != null ? norm(r[h.idx.sentido]) : ''; return { sentido: sn.startsWith('D') ? 'D' : sn.startsWith('C') ? 'C' : (kf > ki ? 'C' : 'D'), kmIni: ki, kmFim: kf, panela: nv(r[h.idx.panela]), remendo: nv(r[h.idx.remendo]), trinca: nv(r[h.idx.trinca]), intervPrim: h.idx.prim != null ? (r[h.idx.prim] || '') : '', intervSec: h.idx.sec != null ? (r[h.idx.sec] || '') : '' }; });
  }
  function importarPrecos(wb, XLSX) {
    if (wb.Sheets.BD) { const W = wrap(wb); XL = XLSX; const p = {}; for (let r = 4; r < W.maxRow('BD') + 1; r++) { const c = W.V('BD', 'B' + r); const sd = num(W.V('BD', 'E' + r)), cd = num(W.V('BD', 'F' + r)); if (c != null && (sd != null || cd != null)) p[String(c)] = { descricao: W.V('BD', 'C' + r), unidade: W.V('BD', 'D' + r), sd, cd, fonte: 'Importado da aba BD' }; } return p; }
    const { rows } = tabela(wb, XLSX);
    const h = acharCabecalho(rows, { codigo: /C[ÓO]D/, descricao: /DESCRI|DISCRIM/, 'unidade?': /^UN/, sd: /SEM DESON|ONERADO$|^ONERADO|S\/ ?DESON|PRE[ÇC]O.*SD|CUSTO UNIT/, 'cd?': /COM DESON|DESONERADO|C\/ ?DESON|PRE[ÇC]O.*CD/ });
    if (!h) throw new Error('Colunas esperadas: código, descrição, unidade, preço sem desoneração e preço com desoneração.');
    const p = {}; rows.slice(h.linha + 1).forEach(r => { const c = r[h.idx.codigo]; if (c == null || c === '') return; p[String(c).trim()] = { descricao: r[h.idx.descricao], unidade: h.idx.unidade != null ? r[h.idx.unidade] : '', sd: num(r[h.idx.sd]), cd: h.idx.cd != null ? num(r[h.idx.cd]) : num(r[h.idx.sd]), fonte: 'Importado' }; });
    return p;
  }
  function importarInventarioAvulso(wb, XLSX) {
    XL = XLSX; const W = wrap(wb); const r = lerInventario(W); if (r) return r.itens;
    const { rows } = tabela(wb, XLSX); const h = acharCabecalho(rows, { chave: /CHAVE|ITEM|ELEMENTO/, valor: /VALOR|QUANT/, 'unidade?': /^UN/ });
    if (!h) throw new Error('Envie a aba RESUMO_INVENT do modelo ou uma tabela com as colunas chave e valor.');
    const o = {}; rows.slice(h.linha + 1).forEach(x => { const k = x[h.idx.chave]; if (k) o[String(k).trim()] = { valor: num(x[h.idx.valor]) || 0, unidade: h.idx.unidade != null ? x[h.idx.unidade] : '' }; }); return o;
  }
  function importarCotacoes(wb, XLSX) {
    const { rows } = tabela(wb, XLSX, ['COTACOES', 'COTAÇÕES']);
    const h = acharCabecalho(rows, { material: /MATERIAL|INSUMO/, fornecedor: /FORNEC|EMPRESA/, preco: /PRE[ÇC]O|VALOR/, 'unidade?': /^UN/, 'data?': /DATA/, 'municipio?': /MUNIC|LOCAL|ORIGEM/, 'dmt?': /DMT|DIST/ });
    if (!h) throw new Error('Colunas esperadas: material, fornecedor, preço, unidade, data, município e DMT.');
    return rows.slice(h.linha + 1).filter(r => r[h.idx.material] && r[h.idx.fornecedor]).map(r => ({ material: String(r[h.idx.material]).trim(), fornecedor: String(r[h.idx.fornecedor]).trim(), preco: num(r[h.idx.preco]), unidade: h.idx.unidade != null ? r[h.idx.unidade] : '', data: h.idx.data != null ? (r[h.idx.data] instanceof Date ? r[h.idx.data].toISOString().slice(0, 10) : r[h.idx.data]) : '', municipio: h.idx.municipio != null ? r[h.idx.municipio] : '', dmt: h.idx.dmt != null ? num(r[h.idx.dmt]) : null }));
  }
  function importarHistorico(wb, XLSX) {
    const { rows } = tabela(wb, XLSX);
    const h = acharCabecalho(rows, { servico: /SERVI|REGRA|C[ÓO]D/, quantidade: /QUANT/, 'contrato?': /CONTRATO/, 'medicao?': /MEDI|PER[ÍI]ODO/ });
    if (!h) throw new Error('Colunas esperadas: serviço (RL, TP, RP, COR, FSD, FSC ou MICRO), quantidade, contrato e medição.');
    return rows.slice(h.linha + 1).filter(r => r[h.idx.servico]).map(r => ({ servico: norm(r[h.idx.servico]), quantidade: num(r[h.idx.quantidade]) || 0, contrato: h.idx.contrato != null ? r[h.idx.contrato] : '', medicao: h.idx.medicao != null ? r[h.idx.medicao] : '' }));
  }

  const api = { importarPATO, importarSNV, importarICPAvulso, importarPrecos, importarInventarioAvulso, importarCotacoes, importarHistorico, INV };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PatoImport = api;
})(typeof window !== 'undefined' ? window : globalThis);
