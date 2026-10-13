/* PORTAL-NEXT V2 — tela do Cash Conversion (Simulador de Novos e de Seminovos).
   O cálculo é 100% do motor único window.NX_CASH_V2 (assets/js/adapters/cash-conversion-v2.js),
   o mesmo arquivo que a Brabus IA usa. Esta camada só:
   - guarda a última simulação feita na página (capital = preço − entrada e os pagamentos mês a mês);
   - lê a referência de mercado vigente (RPC cash_referencias_mercado) com a data;
   - monta o formulário e o resultado (com a frase para o cliente). */
(function () {
  'use strict';
  var UI = window.NX_SIM_UI;
  var ultima = {};          // origem ('novos' | 'seminovos') → { plano, rotulo, capital, opcoes: [{id, rotulo, fluxo}] }
  var refCache = null, refPromise = null;
  var irParaCash = {};      // origem → function () que abre o modo Cash Conversion

  function hojeSP() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }
  function dataBr(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? m[3] + '/' + m[2] + '/' + m[1] : '—'; }
  function num(v, c) { return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c }); }

  /* ---------- simulação de origem ---------- */
  function mensal(prazo, parcela, baloes) {
    var f = [];
    for (var m = 1; m <= prazo; m++) f.push({ mes: m, valor: parcela });
    (baloes || []).forEach(function (b) { if (b.mes >= 1 && b.mes <= prazo && b.valor > 0) f[b.mes - 1].valor += b.valor; });
    return f;
  }
  function nosMeses(meses, valor) { return meses.map(function (m) { return { mes: m, valor: valor }; }); }
  function registrar(origem, sim) {
    if (!sim || !(sim.capital > 0) || !sim.opcoes || !sim.opcoes.length) return;
    ultima[origem] = sim;
  }
  function limpar(origem) { delete ultima[origem]; }

  /* Botão "Comparar com pagar à vista" no fim do resultado de um plano. */
  function botaoHtml() {
    return '<div class="smCashLink"><button type="button" class="btn btn-tertiary btn-sm" data-cash-ir>Comparar com pagar à vista (Cash Conversion)</button></div>';
  }
  function aoIrPara(origem, fn) { irParaCash[origem] = fn; }
  // mousedown: no Linear o resultado é redesenhado no blur do campo (o próprio clique tira o foco),
  // o botão é trocado e o "click" se perde. click continua valendo para o teclado (Enter/Espaço).
  function irSeBotao(ev) {
    var b = ev.target && ev.target.closest && ev.target.closest('[data-cash-ir]');
    if (!b || (ev.type === 'mousedown' && ev.button !== 0)) return;
    ev.preventDefault();
    var pagina = document.querySelector('.smPage[data-origem]');
    var origem = pagina ? pagina.getAttribute('data-origem') : null;
    if (origem && irParaCash[origem]) irParaCash[origem]();
  }
  document.addEventListener('mousedown', irSeBotao);
  document.addEventListener('click', irSeBotao);

  /* ---------- referência de mercado ---------- */
  function carregarReferencias() {
    if (refCache) return Promise.resolve(refCache);
    if (refPromise) return refPromise;
    var cfg = window.NX_INTELLIGENCE_CONFIG || {};
    if (!cfg.supabaseUrl || !cfg.supabasePublishableKey || !window.NX_AUTH || typeof window.NX_AUTH.getAccessToken !== 'function') {
      return Promise.reject({ message: 'Referências de mercado indisponíveis neste ambiente.' });
    }
    refPromise = window.NX_AUTH.getAccessToken().then(function (token) {
      if (!token) return Promise.reject({ message: 'Sessão expirada. Entre de novo.' });
      return fetch(cfg.supabaseUrl + '/rest/v1/rpc/cash_referencias_mercado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': cfg.supabasePublishableKey, 'Authorization': 'Bearer ' + token },
        body: '{}'
      }).then(function (resp) {
        return resp.json().catch(function () { return null; }).then(function (body) {
          if (!resp.ok) return Promise.reject({ message: 'Não foi possível carregar as referências de mercado. Tente novamente.' });
          if (!body) return Promise.reject({ message: 'Não há referência de mercado cadastrada. O Master cadastra no Painel Master.' });
          refCache = body;
          return body;
        });
      }, function () { return Promise.reject({ message: 'Falha de rede ao carregar as referências de mercado.' }); });
    }).finally(function () { refPromise = null; });
    return refPromise;
  }
  function esquecerReferencias() { refCache = null; }

  /* ---------- formulário ---------- */
  function formHtml(origem, p) {
    var sim = ultima[origem];
    var html = '';
    if (sim) {
      html += '<div class="smCashOrigem"><p class="kpiLabel">Simulação de origem</p><p class="smCashOrigemNome">' + UI.esc(sim.rotulo) + '</p>' +
        '<p class="hint">Valor que o cliente pagaria à vista (preço − entrada): <b>' + UI.esc(UI.brl(sim.capital)) + '</b></p></div>' +
        (sim.opcoes.length > 1 ? UI.selectField(p + 'CcOpcao', 'Opção do plano', sim.opcoes.map(function (o) { return { value: o.id, label: o.rotulo }; }), sim.opcoes[0].id) : '') +
        UI.segmentedField(p + 'CcFonte', 'Dados', [{ value: 'sim', label: 'Da simulação' }, { value: 'manual', label: 'Digitar' }], 'sim');
    }
    html += '<div id="' + p + 'CcManual"' + (sim ? ' hidden' : '') + '>' +
      UI.moneyField(p + 'Capital', 'Valor que o cliente pagaria à vista (preço − entrada)', 'R$ 100.000,00') +
      UI.moneyField(p + 'ParcelaCC', 'Parcela mensal ofertada', 'R$ 2.500,00') +
      UI.numberField(p + 'PrazoCC', 'Prazo (meses)', 36, { min: 1, max: 60 }) +
      '</div>' +
      UI.percentField(p + 'CdiCC', 'CDI atual (% a.a.)', '', 'Carregando a referência de mercado…') +
      '<button type="button" class="btn btn-primary" id="' + p + 'Calc" style="width:100%;margin-top:6px">Calcular</button>';
    return html;
  }

  function wire(origem, p, setResult) {
    var cdi = document.getElementById(p + 'CdiCC');
    var hint = cdi ? cdi.parentNode.querySelector('.hint') : null;
    carregarReferencias().then(function (ref) {
      if (cdi && !cdi.value) cdi.value = num(ref.cdi_aa, 2);
      if (hint) hint.innerHTML = 'Referência de <b>' + UI.esc(dataBr(ref.vigencia)) + '</b> (Banco Central / B3). Selic ' + UI.esc(num(ref.selic_aa, 2)) + '% a.a.' +
        (ref.desatualizada ? ' <span class="smCashAviso">Pode estar desatualizada (há ' + ref.dias_desde_vigencia + ' dias).</span>' : '');
    }, function (e) {
      if (hint) hint.textContent = (e && e.message) || 'Referências de mercado indisponíveis.';
    });
    var fonte = document.getElementById(p + 'CcFonte');
    if (fonte) UI.wireSegmented(p + 'CcFonte', function (v) {
      document.getElementById(p + 'CcManual').hidden = v !== 'manual';
      var sel = document.getElementById(p + 'CcOpcao');
      if (sel) sel.closest('.field').hidden = v === 'manual';
    });
    document.getElementById(p + 'Calc').addEventListener('click', function () { calcular(origem, p, setResult); });
  }

  function entradaAtual(origem, p) {
    var sim = ultima[origem];
    var usaSim = sim && (!document.getElementById(p + 'CcFonte') || UI.getSegmentedValue(p + 'CcFonte') !== 'manual');
    if (usaSim) {
      var sel = document.getElementById(p + 'CcOpcao'), id = sel ? sel.value : sim.opcoes[0].id;
      var op = sim.opcoes.filter(function (o) { return o.id === id; })[0] || sim.opcoes[0];
      return { capital: sim.capital, fluxo: op.fluxo, rotulo: sim.rotulo + (sim.opcoes.length > 1 ? ' · ' + op.rotulo : '') };
    }
    var prazo = UI.numVal(p + 'PrazoCC'), parcela = UI.moneyVal(p + 'ParcelaCC');
    return { capital: UI.moneyVal(p + 'Capital'), fluxo: prazo >= 1 && prazo <= 60 && Math.floor(prazo) === prazo ? mensal(prazo, parcela) : [], rotulo: 'Proposta digitada' };
  }

  function calcular(origem, p, setResult) {
    var ent = entradaAtual(origem, p);
    setResult(UI.emptyBlock('Calculando…'));
    carregarReferencias().then(function (ref) {
      // parsePctBR devolve fração ("13,65" → 0.1365); a referência guarda % a.a. (13.65)
      var cdiDigitado = Math.round(UI.parsePctBR(UI.textVal(p + 'CdiCC')) * 1e6) / 1e4;
      var refUsada = ref, alterada = false;
      if (isFinite(cdiDigitado) && cdiDigitado > 0 && Math.abs(cdiDigitado - Number(ref.cdi_aa)) > 0.004) {
        var spread = Number(ref.selic_aa) - Number(ref.cdi_aa);
        refUsada = Object.assign({}, ref, { cdi_aa: cdiDigitado, selic_aa: cdiDigitado + spread });
        alterada = true;
      }
      var r = window.NX_CASH_V2.calcular({ capital: ent.capital, fluxo: ent.fluxo, referencias: refUsada, dataBase: hojeSP() });
      if (r.erro) { setResult(UI.errorBlock(r.erro)); return; }
      setResult(resultadoHtml(r, ent.rotulo, alterada));
      var bt = document.querySelector('[data-cash-copiar]');
      if (bt) bt.addEventListener('click', function () {
        var txt = r.frase_cliente + '\n' + r.fonte + '\n' + r.rodape;
        (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { bt.textContent = 'Frase copiada'; }, function () { bt.textContent = 'Não foi possível copiar'; });
      });
    }, function (e) {
      setResult(UI.errorBlock((e && e.message) || 'Referências de mercado indisponíveis.'));
    });
  }

  /* ---------- resultado ---------- */
  var RES = {
    FINANCIAR_COMPENSA: ['Financiar compensa', 'FINANCIAR'],
    A_VISTA_COMPENSA: ['À vista sai mais barato', 'UTILIZAR'],
    EQUIVALENTE: ['Equivalente', 'EQUIVALENTE']
  };
  function tabela(prods) {
    return '<div class="smTableWrap"><table class="smTable"><thead><tr><th>Aplicação</th><th>Rendimento bruto</th><th>IR</th><th>Do bolso</th><th>Ganho/perda líquida</th><th>Equilíbrio (CET)</th><th>Resultado</th></tr></thead><tbody>' +
      prods.map(function (x) {
        var rr = RES[x.resultado] || [x.resultado, 'EQUIVALENTE'];
        return '<tr><td>' + UI.esc(x.nome) + (x.isento_ir_pf ? ' <span class="hint">(isenta de IR)</span>' : '') + '</td>' +
          '<td class="num">' + UI.esc(UI.brl(x.rendimento_bruto)) + '</td><td class="num">' + UI.esc(UI.brl(x.ir_total)) + '</td>' +
          '<td class="num">' + (x.aportes_do_bolso > 0 ? UI.esc(UI.brl(x.aportes_do_bolso)) : '—') + '</td>' +
          '<td class="num"><b>' + UI.esc(UI.brl(x.ganho_liquido)) + '</b></td>' +
          '<td class="num">' + (x.ponto_equilibrio_cet_am_pct == null ? '—' : UI.esc(num(x.ponto_equilibrio_cet_am_pct, 2)) + '% a.m.') + '</td>' +
          '<td><span class="smClassBadge ' + rr[1] + '">' + UI.esc(rr[0]) + '</span></td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  function resultadoHtml(r, rotulo, alterada) {
    var foco = r.cenarios.focus.produtos;
    var todos = foco.every(function (x) { return x.resultado === foco[0].resultado; });
    var badge = todos ? (RES[foco[0].resultado] || RES.EQUIVALENTE) : ['Depende da aplicação', 'EQUIVALENTE'];
    var html = '';
    if (r.referencias.desatualizada) html += UI.warningBlock('As taxas de referência são de ' + r.referencias.vigencia + ' (há ' + r.referencias.dias_desde_vigencia + ' dias) e podem estar desatualizadas.');
    if (alterada) html += UI.warningBlock('CDI alterado na tela: o resultado não usa a referência oficial do Portal (a Brabus IA usa a referência oficial).');
    html += '<div class="resultHero"><p class="kpiLabel">Resultado no cenário principal (Selic em queda, Boletim Focus)</p><p><span class="smClassBadge ' + badge[1] + '">' + UI.esc(badge[0]) + '</span></p></div>';
    html += '<div class="smCashFrase"><p class="kpiLabel">Para mostrar ao cliente</p><p class="smCashFraseTexto">' + UI.esc(r.frase_cliente) + '</p>' +
      '<p class="hint">' + UI.esc(r.fonte) + '</p><p class="hint">' + UI.esc(r.rodape) + '</p>' +
      '<button type="button" class="btn btn-tertiary btn-sm" data-cash-copiar>Copiar frase</button></div>';
    html += UI.secondaryGrid([
      { label: 'Simulação', value: rotulo },
      { label: 'Valor que pagaria à vista', value: UI.brl(r.capital) },
      { label: 'Total pago no financiamento', value: UI.brl(r.total_pago) + ' (' + r.pagamentos + ' pagamentos)' },
      { label: 'CET do financiamento', value: num(r.cet_am_pct, 2) + '% a.m. · ' + num(r.cet_aa_pct, 2) + '% a.a.' }
    ]);
    html += '<p class="kpiLabel" style="margin-top:16px">Selic em queda (Boletim Focus de ' + UI.esc(r.referencias.focus_data || '—') + ') — cenário principal</p>' + tabela(foco);
    html += '<p class="kpiLabel" style="margin-top:16px">CDI atual constante — comparação</p>' + tabela(r.cenarios.cdi_constante.produtos);
    html += r.avisos.map(function (a) { return UI.warningBlock(a); }).join('');
    html += '<p class="smFootnote">' + UI.esc(r.leitura_taxas) + ' Ganho/perda líquida: o que sobra (ou falta) depois de pagar todas as parcelas com saques da aplicação, já descontado o IR; pagando à vista, o resultado é zero. ' +
      'Equilíbrio: CET do financiamento acima do qual financiar deixa de compensar naquela aplicação. Estimativa, sem garantia de rentabilidade; o vendedor não recomenda produto nem instituição.</p>';
    return html;
  }

  window.NX_CASH_TELA = {
    registrar: registrar, limpar: limpar, mensal: mensal, nosMeses: nosMeses, botaoHtml: botaoHtml, aoIrPara: aoIrPara,
    formHtml: formHtml, wire: wire, carregarReferencias: carregarReferencias, esquecerReferencias: esquecerReferencias,
    hojeSP: hojeSP, resultadoHtml: resultadoHtml
  };
})();
