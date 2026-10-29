/* Assistente de solução financeira — Simulador de Novos (Fase 2, 30/10/2026; plano e decisões do Luis de 29–30/10).
   - Botão "Encontrar a melhor solução" sempre visível nos planos com valor do bem e entrada; pop-up de reforço depois de N mudanças
     (assist_config.popup_mudancas), no máximo 1 vez por visita ao simulador.
   - 4 perguntas de toque (31/10: a antiga 5ª, "esse dinheiro rende?", saiu: "tenho, mas prefiro não mexer" já diz isso);
     o vendedor marca antes se as campanhas estão liberadas para o cliente.
   - Conta "à vista ou financiar": CDI das Referências de Mercado do Master (cash_referencias_mercado), líquido do IR da faixa
     do prazo de cada proposta; mostra a data da referência e o nome das propostas que custam menos que pagar à vista.
   - TODOS os números vêm de window.NX_ASSISTENTE_REGRA (gerado de engine/assistente.ts, a mesma regra testada na função) com as
     tabelas vigentes do próprio simulador. Este arquivo não faz conta de financiamento: só formata o que a regra devolve.
   - Seguro prestamista fora das propostas; passo separado com valor, efeito na parcela e aceite próprio do cliente.
   - Registro de uso (assist_registrar_evento): só códigos de resposta e a proposta escolhida, nunca nome, CPF, renda ou valores
     digitados. Mesma trava da telemetria dos simuladores: grava de verdade só em AUTHORIZED_PRODUCTION; fora dela, fica no log local. */
(function () {
  'use strict';

  var REGRA = window.NX_ASSISTENTE_REGRA;
  var pagina = null;          // { tabelas(), valor(), entrada() } entregue pelo simulador
  var cfg = null;             // assist_config()
  var cfgPromise = null;
  var popupMostrado = false;  // 1 vez por visita ao simulador
  var mudancas = 0;
  var sessao = null;          // { id, valor, entrada, oferecido }
  var log = [];               // diagnóstico local (sem dados de negócio)
  var st = null;              // estado do fluxo aberto

  var FAIXAS = [['ate3000', 'Até R$ 3.000', 3000], ['ate4500', 'Até R$ 4.500', 4500], ['ate6000', 'Até R$ 6.000', 6000],
    ['ate8000', 'Até R$ 8.000', 8000], ['outro', 'Outro valor', null], ['naosei', 'Ainda não sei', null]];
  var PERGUNTAS = [
    { id: 'prioridade', q: 'O que pesa mais pra você hoje?', opts: [['parcela', 'Parcela leve no mês'], ['juros', 'Pagar menos juros no total'], ['aplicado', 'Deixar meu dinheiro aplicado'], ['avista', 'Prefiro pagar à vista']] },
    { id: 'faixa', q: 'Qual parcela fica confortável por mês, sem apertar?', opts: FAIXAS.map(function (f) { return [f[0], f[1]]; }) },
    { id: 'troca', q: 'Pretende trocar de carro em 2 ou 3 anos?', opts: [['sim', 'Sim, troco logo'], ['nao', 'Não, vou ficar bastante tempo'], ['nao_sei', 'Ainda não sei']] },
    { id: 'dinheiro', q: 'Além da entrada, tem algum dinheiro que poderia usar?', opts: [['nao', 'Não'], ['sim', 'Sim'], ['nao_mexer', 'Tenho, mas prefiro deixar aplicado']] }
  ];
  var TXT_PERGUNTAS = PERGUNTAS.length + ' perguntas rápidas';
  var PERFIL_NOME = { PARCELA: 'Parcela', CUSTO_TOTAL: 'Custo total', LIQUIDEZ: 'Liquidez', A_VISTA: 'À vista' };

  // ---------- utilidades ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function brl(v) { return (isFinite(v) ? v : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function brl0(v) { return (isFinite(v) ? v : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }); }
  function pct(v) { return v == null ? '—' : (v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%'; }
  function parseBRL(s) { var d = String(s || '').replace(/[^\d,]/g, '').replace(',', '.'); var n = parseFloat(d); return isFinite(n) ? n : 0; }
  function novoId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  }
  function producao() { return !!(window.NX_ENVIRONMENT && window.NX_ENVIRONMENT.name === 'AUTHORIZED_PRODUCTION'); }

  function rpc(nome, corpo) {
    var c = window.NX_INTELLIGENCE_CONFIG || {};
    if (!c.supabaseUrl || !c.supabasePublishableKey || !window.NX_AUTH || typeof window.NX_AUTH.getAccessToken !== 'function') {
      return Promise.reject({ state: 'SEM_CONFIG' });
    }
    return window.NX_AUTH.getAccessToken().then(function (token) {
      if (!token) return Promise.reject({ state: 'SESSION_EXPIRED' });
      return fetch(c.supabaseUrl + '/rest/v1/rpc/' + nome, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: c.supabasePublishableKey, Authorization: 'Bearer ' + token },
        body: JSON.stringify(corpo || {})
      }).then(function (resp) {
        return resp.json().catch(function () { return null; }).then(function (b) { return resp.ok ? b : Promise.reject({ state: 'RPC_ERROR', status: resp.status }); });
      });
    });
  }

  function carregarConfig() {
    if (cfg) return Promise.resolve(cfg);
    if (cfgPromise) return cfgPromise;
    cfgPromise = rpc('assist_config', {}).then(function (b) {
      cfg = (b && b.liberado) ? b : { liberado: false };
      return cfg;
    }, function () { cfg = { liberado: false }; return cfg; }).finally(function () { cfgPromise = null; });
    return cfgPromise;
  }

  // Registro: só códigos. Fire-and-forget; nenhuma falha afeta o simulador.
  function registrar(evento, dados) {
    if (!sessao) return;
    var item = { evento: evento, dados: dados || {}, em: new Date().toISOString() };
    log.push(item);
    if (!producao()) return;
    rpc('assist_registrar_evento', { p_sessao: sessao.id, p_evento: evento, p_dados: dados || {} }).catch(function () {});
  }
  // Uma sessão = um uso do assistente. Enquanto não foi aberto, a mesma sessão acompanha o vendedor digitando (um "oferecido" só).
  // Nova sessão: depois de um uso concluído (resultado marcado) ou ao reabrir com outro valor ou outra entrada.
  function garantirSessao(abrindo) {
    var v = pagina.valor(), e = pagina.entrada();
    var trocou = sessao && sessao.aberto && (sessao.valor !== v || sessao.entrada !== e);
    if (!sessao || sessao.fechada || (abrindo && trocou)) sessao = { id: novoId(), valor: v, entrada: e, oferecido: false, aberto: false, fechada: false };
    if (!sessao.aberto) { sessao.valor = v; sessao.entrada = e; }
    return sessao;
  }
  function oferecer(origem) {
    garantirSessao();
    if (sessao.oferecido) return;
    sessao.oferecido = true;
    registrar('oferecido', { origem: origem });
  }

  // ---------- gatilho no formulário ----------
  function preenchido() { return pagina && pagina.valor() > 0 && pagina.entrada() > 0 && pagina.entrada() < pagina.valor(); }

  function barraHtml() {
    var ok = preenchido();
    return '<div class="asstBar' + (ok ? '' : ' asstBarOff') + '" id="asstBar">' +
      '<div class="asstBarTxt"><b>Não sabe qual plano oferecer?</b><span>' + (ok ? TXT_PERGUNTAS + ' e até 3 propostas com os números deste simulador.' : 'Preencha o valor do bem e a entrada para usar.') + '</span></div>' +
      '<button type="button" class="btn btn-secondary asstBarBtn" id="asstAbrir"' + (ok ? '' : ' disabled') + '>Encontrar a melhor solução</button></div>';
  }
  function atualizarBarra() {
    var bar = document.getElementById('asstBar');
    if (!bar) return;
    var ok = preenchido();
    bar.classList.toggle('asstBarOff', !ok);
    var btn = document.getElementById('asstAbrir'); if (btn) btn.disabled = !ok;
    var txt = bar.querySelector('.asstBarTxt span'); if (txt) txt.textContent = ok ? TXT_PERGUNTAS + ' e até 3 propostas com os números deste simulador.' : 'Preencha o valor do bem e a entrada para usar.';
    if (ok) oferecer('botao');
  }
  function contarMudanca() {
    mudancas++;
    atualizarBarra();
    if (!popupMostrado && cfg && cfg.liberado && preenchido() && mudancas >= (cfg.popup_mudancas || 3) && !st) mostrarPopup();
  }
  function mostrarPopup() {
    popupMostrado = true;
    var old = document.getElementById('asstPop'); if (old) old.remove();
    garantirSessao();
    if (!sessao.oferecido) oferecer('popup');
    var el = document.createElement('div');
    el.className = 'asstPop'; el.id = 'asstPop'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Assistente de solução financeira');
    el.innerHTML = '<b>Quer ajuda para achar a melhor solução para este cliente?</b><span>' + TXT_PERGUNTAS + '. Os números são deste simulador.</span>' +
      '<div class="asstRow"><button type="button" class="btn btn-primary btn-sm" id="asstPopSim">Começar</button><button type="button" class="btn btn-secondary btn-sm" id="asstPopNao">Agora não</button></div>';
    document.body.appendChild(el);
    document.getElementById('asstPopSim').onclick = function () { el.remove(); abrir('popup'); };
    document.getElementById('asstPopNao').onclick = function () { el.remove(); };
  }

  function anexar(formRegion) {
    if (!REGRA || !pagina) return;
    if (!document.getElementById('nBem') || !document.getElementById('nEntrada')) return;  // só planos com valor do bem e entrada
    carregarConfig().then(function (c) {
      if (!c.liberado || !formRegion.isConnected || document.getElementById('asstBar')) return;
      formRegion.insertAdjacentHTML('beforeend', barraHtml());
      document.getElementById('asstAbrir').onclick = function () { abrir('botao'); };
      formRegion.addEventListener('input', function (ev) { if (ev.target && (ev.target.id === 'nBem' || ev.target.id === 'nEntrada')) atualizarBarra(); });
      formRegion.addEventListener('change', function (ev) { if (ev.target && (ev.target.id === 'nBem' || ev.target.id === 'nEntrada')) contarMudanca(); });
      formRegion.addEventListener('click', function (ev) { var b = ev.target && ev.target.closest && ev.target.closest('.smTermSelectGrid button, .segmented button'); if (b) contarMudanca(); });
      atualizarBarra();
    });
  }
  function novaVisita(p) { pagina = p; popupMostrado = false; mudancas = 0; sessao = null; fechar(); }

  // ---------- fluxo ----------
  function abrir(origem) {
    if (!preenchido()) return;
    garantirSessao(true);
    if (!sessao.oferecido) oferecer(origem);
    registrar('aberto', { origem: origem });
    sessao.aberto = true;
    st = { passo: 'antes', idx: 0, origem: origem, resp: { prioridade: null, faixa: null, outroValor: '', renda: '', troca: null, dinheiro: null, dinheiroValor: '' }, ref: null,
      campanhas: false, modelo: '', tab: null, copart: false, carregando: true, erro: null, res: null, escolha: null, seguroAceito: null, resultado: null };
    montarJanela();
    // Referências de Mercado (Cash Conversion, mantidas pelo Master): sem elas, só a conta à vista some.
    var ref = rpc('cash_referencias_mercado', {}).then(function (r) { return r && r.cdi_aa ? r : null; }, function () { return null; });
    Promise.all([pagina.tabelas(), ref]).then(function (x) { var t = x[0]; if (!st) return; st.tab = t.tabelas; st.copart = t.copart; st.ref = x[1]; st.carregando = false; desenhar(); },
      function () { st.carregando = false; st.erro = 'Não foi possível carregar as condições vigentes do simulador. Tente novamente.'; desenhar(); });
  }
  function montarJanela() {
    fechar(true);
    var scrim = document.createElement('div');
    scrim.className = 'asstScrim'; scrim.id = 'asstScrim';
    scrim.innerHTML = '<div class="asstDialog" role="dialog" aria-modal="true" aria-labelledby="asstTitulo" id="asstDialog">' +
      '<div class="asstHead"><div><span class="asstEyebrow">Simulador de Novos</span><h2 id="asstTitulo">Assistente de solução financeira</h2></div>' +
      '<button type="button" class="asstClose" id="asstFechar" aria-label="Fechar">×</button></div><div class="asstBody" id="asstBody"></div></div>';
    document.body.appendChild(scrim);
    document.body.classList.add('asstAberto');
    document.getElementById('asstFechar').onclick = function () { fechar(); };
    scrim.addEventListener('click', function (ev) { if (ev.target === scrim) fechar(); });
    document.addEventListener('keydown', teclaEsc);
    desenhar();
  }
  function teclaEsc(ev) { if (ev.key === 'Escape') fechar(); }
  function fechar(semLimpar) {
    var s = document.getElementById('asstScrim'); if (s) s.remove();
    document.body.classList.remove('asstAberto');
    document.removeEventListener('keydown', teclaEsc);
    if (!semLimpar) st = null;
  }
  function perguntasVisiveis() { return PERGUNTAS; }

  function desenhar() {
    var body = document.getElementById('asstBody');
    if (!body || !st) return;
    var html;
    if (st.carregando) html = '<div class="emptyState">Carregando as condições vigentes do simulador...</div>';
    else if (st.erro) html = '<div class="errorState">' + esc(st.erro) + '</div><div class="asstNav"><button type="button" class="btn btn-secondary" data-a="fechar">Fechar</button></div>';
    else if (st.passo === 'antes') html = antesHtml();
    else if (st.passo === 'pergunta') html = perguntaHtml();
    else if (st.passo === 'resultado') html = resultadoHtml();
    else if (st.passo === 'seguro') html = seguroHtml();
    else html = finalHtml();
    body.innerHTML = html;
    ligar(body);
    var foco = body.querySelector('[data-foco]') || body.querySelector('button, input, select');
    if (foco && foco.focus) foco.focus({ preventScroll: true });
    body.scrollTop = 0;
  }

  function chipsHtml(nome, opts, atual) {
    return '<div class="asstChips" role="group">' + opts.map(function (o) {
      return '<button type="button" class="asstChip" aria-pressed="' + (atual === o[0]) + '" data-ch="' + nome + ':' + o[0] + '">' + esc(o[1]) + '</button>';
    }).join('') + '</div>';
  }
  function resumoTopo() {
    return '<p class="asstContexto">Valor do bem <b>' + brl(pagina.valor()) + '</b> · entrada <b>' + brl(pagina.entrada()) + '</b></p>';
  }
  function antesHtml() {
    var modelos = (st.tab && st.tab.copartModels || []).map(function (m) { return m.name; });
    var sel = st.campanhas ? '<div class="field"><label for="asstModelo">Modelo (para o Plano Coparticipado)</label><select id="asstModelo" class="asstSelect">' +
      '<option value="">Outro modelo / não sei</option>' + modelos.map(function (n) { return '<option' + (st.modelo === n ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('') +
      '</select>' + (st.copart ? '' : '<span class="hint">O Coparticipado não carregou agora; só a Taxa Subsidiada entra.</span>') + '</div>' : '';
    return resumoTopo() + '<span class="asstHint">Antes de começar · só para você</span>' +
      '<p class="asstQ">As campanhas (Taxa Subsidiada, Coparticipado) estão liberadas para este cliente?</p>' +
      chipsHtml('campanhas', [['nao', 'Não'], ['sim', 'Sim, estão liberadas']], st.campanhas ? 'sim' : 'nao') +
      '<p class="asstSub">Se liberadas, elas concorrem com os outros planos só pelos números do cliente.</p>' + sel +
      '<div class="asstNav"><button type="button" class="btn btn-secondary" data-a="fechar">Cancelar</button><button type="button" class="btn btn-primary" data-a="comecar" data-foco>Começar as perguntas</button></div>';
  }
  function perguntaHtml() {
    var qs = perguntasVisiveis(), q = qs[st.idx], r = st.resp;
    var extra = '';
    if (q.id === 'faixa') {
      if (r.faixa === 'outro') extra += '<div class="field"><label for="asstOutro">Parcela confortável (R$)</label><input id="asstOutro" class="asstInput" inputmode="decimal" placeholder="R$ 5.000,00" value="' + esc(r.outroValor) + '"></div>';
      extra += '<div class="field"><label for="asstRenda">Renda mensal do cliente (opcional, só para o alerta; não fica gravada)</label><input id="asstRenda" class="asstInput" inputmode="decimal" placeholder="R$ 0,00" value="' + esc(r.renda) + '"></div>';
    }
    if (q.id === 'dinheiro' && r.dinheiro === 'sim') extra = '<div class="field"><label for="asstDinheiro">Cerca de quanto (R$)?</label><input id="asstDinheiro" class="asstInput" inputmode="decimal" placeholder="R$ 50.000,00" value="' + esc(r.dinheiroValor) + '"></div>';
    var bars = qs.map(function (_, i) { return '<i class="' + (i <= st.idx ? 'on' : '') + '"></i>'; }).join('');
    var pode = !!r[q.id];
    return resumoTopo() + '<div class="asstProgRow"><span class="asstHint">Pergunte ao cliente · ' + (st.idx + 1) + ' de ' + qs.length + '</span><span class="asstProg" aria-hidden="true">' + bars + '</span></div>' +
      '<p class="asstQ">' + esc(q.q) + '</p>' + chipsHtml(q.id, q.opts, r[q.id]) + extra +
      '<div class="asstNav"><button type="button" class="btn btn-secondary" data-a="voltar">Voltar</button><button type="button" class="btn btn-primary" data-a="proxima"' + (pode ? '' : ' disabled') + ' data-foco>' + (st.idx === qs.length - 1 ? 'Ver as propostas' : 'Próxima') + '</button></div>';
  }

  function respostasRegra() {
    var r = st.resp, f = FAIXAS.filter(function (x) { return x[0] === r.faixa; })[0];
    var pm = r.faixa === 'outro' ? (parseBRL(r.outroValor) || null) : (f ? f[2] : null);
    return {
      prioridade: r.prioridade, parcela_max: pm, renda: parseBRL(r.renda) || null, troca: r.troca,
      dinheiro: r.dinheiro, dinheiro_extra: r.dinheiro === 'sim' ? parseBRL(r.dinheiroValor) : 0,
      rende: r.dinheiro === 'nao_mexer' ? 'sim' : null
    };
  }
  function calcular() {
    var res = REGRA.montarTresPropostas(
      { modelo: st.campanhas ? st.modelo : '', versao: null, valor: pagina.valor(), entrada: pagina.entrada(), tabelas: st.tab },
      respostasRegra(),
      { balao_pct: cfg.balao_pct, limite_renda: cfg.limite_renda, campanhas_liberadas: !!st.campanhas,
        cdi_aa: st.ref ? Number(st.ref.cdi_aa) / 100 : null, ir_faixas: st.ref && Array.isArray(st.ref.ir_faixas) ? st.ref.ir_faixas : [] });
    st.res = res;
    if (res && !res.erro) {
      registrar('concluido', {
        perfil_cliente: res.perfil, faixa_parcela: st.resp.faixa, troca: st.resp.troca, dinheiro: st.resp.dinheiro,
        campanhas_liberadas: !!st.campanhas, modelo: st.campanhas && st.modelo ? st.modelo : null,
        alerta_renda: res.propostas.some(function (p) { return p.alertas.renda_alta; }), propostas_qtd: res.propostas.length
      });
    }
  }

  function cartaoHtml(p, i) {
    var bal = p.baloes.length ? '<dt>Balão</dt><dd>' + brl(p.baloes[0].valor) + ' no mês ' + p.baloes[0].mes + '</dd>' : '';
    var avisos = '';
    if (p.usa_dinheiro_extra > 0) avisos += '<div class="asstNota info">Usa ' + brl0(p.usa_dinheiro_extra) + ' do dinheiro extra que o cliente disse ter, para chegar à entrada mínima da campanha.</div>';
    if (p.taxa_am === 0) avisos += '<div class="asstNota info">Taxa 0% com CET estimado de ' + pct(p.cet_aa) + ' a.a. por IOF e tarifas. Se houver desconto para pagar à vista, compare com o preço à vista.</div>';
    if (p.alertas.acima_da_parcela_max) avisos += '<div class="asstNota warn">Acima da parcela confortável que o cliente disse.</div>';
    if (p.alertas.renda_alta) avisos += '<div class="asstNota warn">Esta parcela passa de ' + pct(cfg.limite_renda).replace(',00', '') + ' da renda informada (' + pct(p.alertas.renda_pct) + '). Vale conferir com o cliente se cabe com folga.</div>';
    var av = p.a_vista;
    return '<article class="asstCard' + (p.destaque ? ' asstCardDestaque' : '') + '">' +
      '<div class="asstCardTop"><b>' + esc(p.rotulo) + '</b>' + (p.destaque ? '<span class="asstTag">Combina com o que o cliente disse</span>' : '') + '</div>' +
      '<div class="asstPlano">' + esc(p.plano_nome) + '</div>' +
      '<div class="asstParcela">' + brl(p.parcela) + ' <small>× ' + p.prazo + '</small></div>' +
      '<dl class="asstKv"><dt>Entrada</dt><dd>' + brl0(p.entrada) + '</dd>' + bal +
      '<dt>Taxa</dt><dd>' + pct(p.taxa_am) + ' a.m. · ' + pct(p.taxa_aa) + ' a.a.</dd>' +
      '<dt>CET estimado</dt><dd>' + pct(p.cet_am) + ' a.m. · ' + pct(p.cet_aa) + ' a.a.</dd>' +
      '<dt class="sep"></dt><dd class="sep"></dd>' +
      '<dt class="forte">Total pago</dt><dd class="forte">' + brl(p.total_pago) + '</dd>' +
      '<dt>Juros e encargos</dt><dd>' + brl(p.juros) + '</dd>' +
      '<dt>Comparado a pagar à vista</dt><dd>+' + brl0(av.diferenca_total) + '</dd></dl>' + avisos +
      '<button type="button" class="btn btn-secondary asstEscolher" data-escolher="' + i + '">Cliente escolheu esta</button></article>';
  }
  function resultadoHtml() {
    var res = st.res;
    if (!res || res.erro) return '<div class="errorState">' + esc(res ? res.erro : 'Não foi possível montar as propostas.') + '</div><div class="asstNav"><button type="button" class="btn btn-secondary" data-a="editar">Mudar respostas</button></div>';
    var r = respostasRegra(), dito = [];
    dito.push({ parcela: 'Parcela leve no mês', juros: 'Menos juros no total', aplicado: 'Dinheiro aplicado', avista: 'Pagar à vista' }[r.prioridade]);
    if (r.parcela_max) dito.push('parcela até ' + brl0(r.parcela_max));
    dito.push(r.troca === 'sim' ? 'troca em 2–3 anos' : (r.troca === 'nao' ? 'fica bastante tempo com o carro' : 'ainda não sabe quando troca'));
    if (r.dinheiro === 'sim' && r.dinheiro_extra > 0) dito.push('tem cerca de ' + brl0(r.dinheiro_extra) + ' além da entrada');
    if (r.dinheiro === 'nao_mexer') dito.push('não quer mexer na reserva');
    if (st.campanhas) dito.push('campanhas liberadas');
    var topo = res.perfil === 'A_VISTA' ? '<div class="asstAvista"><b>Pagar à vista: ' + brl0(pagina.valor()) + '</b><span>É a opção mais barata para este cliente. As propostas abaixo ficam como comparação, caso ele queira manter parte do dinheiro.</span>' +
      '<button type="button" class="btn btn-secondary btn-sm" data-escolher="avista">Cliente vai pagar à vista</button></div>' : '';
    var conta = '';
    if (st.ref && res.a_vista_mais_barata !== null && (res.perfil === 'LIQUIDEZ' || res.perfil === 'A_VISTA' || r.dinheiro === 'sim' || r.dinheiro === 'nao_mexer')) {
      var dataRef = String(st.ref.vigencia || '').split('-').reverse().join('/');
      var lista = res.propostas.map(function (p) { return esc(p.rotulo) + ': ' + brl0(p.a_vista.custo_valor_presente) + ' (CDI líquido ' + pct(p.a_vista.rendimento_aa) + ')'; }).join(' · ');
      var frase;
      if (res.abaixo_do_a_vista.length) {
        var abaixo = res.propostas.filter(function (p) { return res.abaixo_do_a_vista.indexOf(p.rotulo) >= 0; });
        frase = abaixo.length === 1
          ? '<b>' + esc(abaixo[0].rotulo) + '</b> custa ' + brl0(-abaixo[0].a_vista.diferenca_valor_presente) + ' menos que pagar à vista, em dinheiro de hoje.'
          : abaixo.map(function (p) { return '<b>' + esc(p.rotulo) + '</b> (' + brl0(-p.a_vista.diferenca_valor_presente) + ' abaixo)'; }).join(' e ') + ' custam menos que pagar à vista, em dinheiro de hoje.';
      } else {
        var perto = res.propostas.slice().sort(function (a, b) { return a.a_vista.diferenca_valor_presente - b.a_vista.diferenca_valor_presente; })[0];
        frase = 'Nenhuma proposta custa menos que pagar à vista. A mais próxima é <b>' + esc(perto.rotulo) + '</b>, ' + brl0(perto.a_vista.diferenca_valor_presente) + ' acima em dinheiro de hoje.';
      }
      conta = '<div class="asstConta"><b>À vista ou financiar e deixar o dinheiro aplicado?</b>' +
        '<span>CDI de ' + pct(Number(st.ref.cdi_aa) / 100) + ' a.a. das Referências de Mercado de ' + esc(dataRef) + (st.ref.desatualizada ? ' (referência com mais de 50 dias)' : '') +
        ', líquido do IR da faixa do prazo de cada proposta. Custo de cada uma em dinheiro de hoje:</span>' +
        '<span class="asstMono">' + lista + '</span>' +
        '<span>Pagando à vista: <b>' + brl0(pagina.valor()) + '</b>. ' + frase + '</span></div>';
    }
    var d = res.diferencas.leve_para_menos_juros, explica = '';
    if (res.propostas.length >= 2 && d.parcela > 0) explica = '<p class="asstExplica">Da opção de parcela mais leve para a de menos juros, a parcela sobe ' + brl(d.parcela) + ' por mês e o total pago cai ' + brl(d.total_pago) + '.</p>';
    var nada = res.nenhuma_cabe ? '<div class="asstNota warn">Nenhum plano fica dentro da parcela confortável com esta entrada. As opções abaixo passam do valor que o cliente disse.</div>' : '';
    return '<div class="asstPerfil"><span class="asstPill">Perfil: ' + esc(PERFIL_NOME[res.perfil]) + '</span><span class="asstDito">' + esc(dito.join(' · ')) + '</span><button type="button" class="btn-tertiary" data-a="editar">Mudar respostas</button></div>' +
      topo + nada + '<div class="asstCards">' + res.propostas.map(cartaoHtml).join('') + '</div>' + explica + conta +
      '<div class="asstFino"><span>Estes números são do Simulador de Novos com as tabelas de hoje. CET estimado; o oficial vem no contrato do banco.</span>' +
      '<span>Seguro prestamista e outros opcionais ficam no próximo passo, separados. O cliente pode trazer o seguro de outra seguradora.</span>' +
      '<span>A sugestão é do assistente; um gestor de F&amp;I revisa antes de qualquer contrato. ' + res.opcoes_avaliadas + ' opções do simulador avaliadas; rebate, retorno e comissão não entram na escolha.</span></div>' +
      '<div class="asstNav"><button type="button" class="btn btn-secondary" data-escolher="nenhuma">Nenhuma serviu</button></div>';
  }

  function seguroHtml() {
    var p = st.escolha, s = p.seguro;
    return '<span class="asstHint">Passo separado · opcional</span><p class="asstQ">Seguro prestamista</p>' +
      '<p class="asstSub">Proposta escolhida: <b>' + esc(p.plano_nome) + ' ' + p.prazo + 'x de ' + brl(p.parcela) + '</b>.</p>' +
      '<div class="asstSeguro"><dl class="asstKv">' +
      '<dt>Valor do seguro no contrato</dt><dd>' + brl(s.valor_financiado) + '</dd>' +
      '<dt>Efeito na parcela</dt><dd>+' + brl(s.acrescimo_parcela) + ' por mês</dd>' +
      '<dt>Parcela com o seguro</dt><dd>' + brl(s.parcela_com_seguro) + '</dd>' +
      '<dt>Custo total do seguro no prazo</dt><dd>' + brl(s.acrescimo_total) + '</dd></dl>' +
      '<p class="asstSub">O seguro é opcional: contratar ou não, não é condição para o financiamento. O cliente pode contratar com outra seguradora (STJ, Tema 972).</p>' +
      '<div class="asstEscolhaDupla"><button type="button" class="btn ' + (st.seguroAceito === true ? 'btn-primary' : 'btn-secondary') + '" data-seguro="sim" aria-pressed="' + (st.seguroAceito === true) + '">O cliente quer o seguro</button>' +
      '<button type="button" class="btn ' + (st.seguroAceito === false ? 'btn-primary' : 'btn-secondary') + '" data-seguro="nao" aria-pressed="' + (st.seguroAceito === false) + '">O cliente não quer o seguro</button></div></div>' +
      '<div class="asstNav"><button type="button" class="btn btn-secondary" data-a="voltarResultado">Voltar às propostas</button><button type="button" class="btn btn-primary" data-a="final"' + (st.seguroAceito === null ? ' disabled' : '') + ' data-foco>Continuar</button></div>';
  }
  function finalHtml() {
    var p = st.escolha;
    var linha = p === 'avista' ? 'Cliente vai pagar à vista: <b>' + brl0(pagina.valor()) + '</b>.' : (p === 'nenhuma' ? 'Nenhuma proposta serviu.' :
      'Proposta: <b>' + esc(p.plano_nome) + ' ' + p.prazo + 'x de ' + brl(st.seguroAceito ? p.seguro.parcela_com_seguro : p.parcela) + '</b>' + (p.seguro ? (st.seguroAceito ? ', com seguro prestamista.' : ', sem seguro prestamista.') : '.'));
    var res = st.resultado ? '<p class="asstOk">Registrado: ' + (st.resultado === 'fechou' ? 'cliente fechou' : 'cliente não fechou') + '. Nenhum dado pessoal do cliente é gravado.</p>' : '';
    return '<span class="asstHint">Resumo</span><p class="asstQ">' + linha + '</p>' +
      '<p class="asstSub">Use o simulador para conferir e seguir com a proposta. Quando souber, marque o resultado:</p>' +
      '<div class="asstEscolhaDupla"><button type="button" class="btn ' + (st.resultado === 'fechou' ? 'btn-primary' : 'btn-secondary') + '" data-resultado="fechou">Cliente fechou</button>' +
      '<button type="button" class="btn ' + (st.resultado === 'nao_fechou' ? 'btn-primary' : 'btn-secondary') + '" data-resultado="nao_fechou">Cliente não fechou</button></div>' + res +
      '<div class="asstNav"><button type="button" class="btn btn-secondary" data-a="voltarResultado">Voltar às propostas</button><button type="button" class="btn btn-primary" data-a="fechar" data-foco>Fechar</button></div>';
  }

  function lerCampos() {
    var o = document.getElementById('asstOutro'); if (o) st.resp.outroValor = o.value;
    var r = document.getElementById('asstRenda'); if (r) st.resp.renda = r.value;
    var d = document.getElementById('asstDinheiro'); if (d) st.resp.dinheiroValor = d.value;
    var m = document.getElementById('asstModelo'); if (m) st.modelo = m.value;
  }
  function ligar(body) {
    body.querySelectorAll('[data-ch]').forEach(function (b) {
      b.onclick = function () {
        lerCampos();
        var x = b.getAttribute('data-ch').split(':');
        if (x[0] === 'campanhas') st.campanhas = x[1] === 'sim'; else st.resp[x[0]] = x[1];
        desenhar();
      };
    });
    body.querySelectorAll('[data-a]').forEach(function (b) {
      b.onclick = function () {
        lerCampos();
        var a = b.getAttribute('data-a'), qs = perguntasVisiveis();
        if (a === 'fechar') return fechar();
        if (a === 'comecar') { st.passo = 'pergunta'; st.idx = 0; }
        else if (a === 'voltar') { if (st.idx === 0) st.passo = 'antes'; else st.idx--; }
        else if (a === 'proxima') { if (st.idx < qs.length - 1) st.idx++; else { calcular(); st.passo = 'resultado'; } }
        else if (a === 'editar') { st.passo = 'pergunta'; st.idx = 0; }
        else if (a === 'voltarResultado') { st.passo = 'resultado'; }
        else if (a === 'final') { st.passo = 'final'; }
        desenhar();
      };
    });
    body.querySelectorAll('[data-escolher]').forEach(function (b) {
      b.onclick = function () {
        var v = b.getAttribute('data-escolher');
        if (v === 'avista') { st.escolha = 'avista'; registrar('escolhido', { proposta_coluna: 'a_vista', proposta_plano: 'A_VISTA', proposta_prazo: 0, valor_financiado: 0 }); st.passo = 'final'; }
        else if (v === 'nenhuma') { st.escolha = 'nenhuma'; registrar('escolhido', { proposta_coluna: 'nenhuma' }); st.passo = 'final'; }
        else {
          var p = st.res.propostas[Number(v)];
          st.escolha = p; st.seguroAceito = null;
          registrar('escolhido', { proposta_coluna: p.coluna, proposta_plano: p.plano, proposta_prazo: p.prazo, valor_financiado: Math.round(p.financiado / 1000) * 1000 });
          st.passo = p.seguro ? 'seguro' : 'final';
          if (!p.seguro) registrar('seguro', { seguro_oferecido: false });
        }
        desenhar();
      };
    });
    body.querySelectorAll('[data-seguro]').forEach(function (b) {
      b.onclick = function () {
        st.seguroAceito = b.getAttribute('data-seguro') === 'sim';
        registrar('seguro', { seguro_oferecido: true, seguro_aceito: st.seguroAceito });
        desenhar();
      };
    });
    body.querySelectorAll('[data-resultado]').forEach(function (b) {
      b.onclick = function () {
        st.resultado = b.getAttribute('data-resultado');
        registrar('resultado', { resultado_vendedor: st.resultado });
        if (sessao) sessao.fechada = true;
        desenhar();
      };
    });
  }

  window.NX_ASSISTENTE = {
    anexar: anexar, novaVisita: novaVisita,
    // Diagnóstico (testes): eventos do log local, último resultado da regra e as tabelas que a tela entregou. Nada é enviado.
    _diagnostico: function () { return { log: log.slice(), cfg: cfg, sessao: sessao ? { id: sessao.id } : null, popupMostrado: popupMostrado, mudancas: mudancas, resultado: st && st.res, entrada: st ? { modelo: st.campanhas ? st.modelo : '', campanhas: !!st.campanhas } : null }; },
    _tabelas: function () { return pagina ? pagina.tabelas() : Promise.reject('sem pagina'); }
  };
})();
