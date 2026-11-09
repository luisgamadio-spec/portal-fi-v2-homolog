/* PORTAL-NEXT V2 — Análise de Faturamentos (08/11/2026, pedido do Luis; layout refeito em 09/11/2026). SOMENTE Master.
   Propostas de financiamento FATURADAS e ainda sem pagamento (o banco não liberou o dinheiro para a loja).

   Acesso: MASTER_ONLY no registro (menu e rota) + a função master_faturamentos confere o Master no banco a cada
   chamada. Fonte: a mesma da Análise F&I do Grupo (propostas do SPF/Base 03, financiamentos/Base 02, vendas/Base 01).
   O relatório do SPF ainda não traz data de faturamento nem de pagamento: vale o dia da primeira carga do SPF em que a
   proposta apareceu FATURADA / PAGA (decisão do Luis, opção A). Dias em aberto = dias úteis (sem fim de semana,
   feriados nacionais e Carnaval), contados no banco. As regras e os números NÃO mudaram em 09/11 — só o layout.

   Período: sempre pela DATA DE FATURAMENTO (vai ao servidor). Uma segunda chamada sem período (só leitura) serve para
   contar as propostas em aberto que ficaram fora do período escolhido. Loja, banco, vendedor e faixa filtram aqui mesmo.
   Nunca recebe nem mostra CPF. */
(function () {
  'use strict';

  var FAIXAS = [   // ordem da lista: do mais grave para o mais leve
    { v: 'GRAVE', label: 'Grave', dias: 'acima de 9 dias úteis' },
    { v: 'URGENCIA', label: 'Urgência', dias: '6–9 dias úteis' },
    { v: 'ATENCAO', label: 'Em atenção', dias: '4–5 dias úteis' },
    { v: 'NORMAL', label: 'Normal', dias: '1–3 dias úteis' }
  ];
  var BARRA = ['NORMAL', 'ATENCAO', 'URGENCIA', 'GRAVE'];   // ordem da barra: do mais leve para o mais grave
  var FAIXA_LABEL = { NORMAL: 'Normal', ATENCAO: 'Em atenção', URGENCIA: 'Urgência', GRAVE: 'Grave' };
  var PERIODOS = [
    { v: 'mes', label: 'Mês atual' }, { v: 'ultimo', label: 'Último mês' }, { v: '3m', label: '3 meses' },
    { v: '6m', label: '6 meses' }, { v: '12m', label: '12 meses' }, { v: 'tudo', label: 'Tudo' }, { v: 'custom', label: 'Personalizado' }
  ];
  var A_CONFIRMAR = 'a confirmar';

  var outletRef = null, S = null, focoAntes = null;

  // ---------------------------------------------------------------- servidor
  function buscar(ini, fim) {
    var cfg = window.NX_INTELLIGENCE_CONFIG || {};
    if (!cfg.supabaseUrl || !cfg.supabasePublishableKey) return Promise.reject({ state: 'BACKEND_ERROR', message: 'Configuração real ausente neste ambiente.' });
    if (!window.NX_AUTH || typeof window.NX_AUTH.getAccessToken !== 'function') return Promise.reject({ state: 'SESSION_EXPIRED', message: 'Sessão indisponível.' });
    return window.NX_AUTH.getAccessToken().then(function (token) {
      if (!token) return Promise.reject({ state: 'SESSION_EXPIRED', message: 'Sessão expirada.' });
      return fetch(cfg.supabaseUrl + '/rest/v1/rpc/master_faturamentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': cfg.supabasePublishableKey, 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ p_por: 'faturamento', p_ini: ini || null, p_fim: fim || null })
      }).then(function (resp) {
        return resp.json().catch(function () { return null; }).then(function (b) {
          if (resp.ok) return b;
          var code = b && b.code;
          if (resp.status === 401) return Promise.reject({ state: 'SESSION_EXPIRED' });
          if (code === '42501' || resp.status === 403) return Promise.reject({ state: 'PERMISSION_DENIED', message: 'Análise de Faturamentos: acesso exclusivo do Master.' });
          if (code === '22023') return Promise.reject({ state: 'VALIDATION', message: b.message });
          return Promise.reject({ state: 'BACKEND_ERROR', message: 'Não foi possível carregar agora. Tente novamente.' });
        });
      }, function () { return Promise.reject({ state: 'BACKEND_ERROR', message: 'Sem conexão. Confira a internet e tente de novo.' }); });
    });
  }

  // ---------------------------------------------------------------- utilidades
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function brl(v) { return v == null || isNaN(Number(v)) ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }); }
  function num(v, casas) { return v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas || 0, maximumFractionDigits: casas || 0 }); }
  function data(v) { if (!v) return '—'; var p = String(v).slice(0, 10).split('-'); return p[2] + '/' + p[1] + '/' + p[0].slice(2); }
  function dataLonga(v) { if (!v) return '—'; var p = String(v).slice(0, 10).split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
  function dataCurta(v) { if (!v) return '—'; var p = String(v).slice(0, 10).split('-'); return p[2] + '/' + p[1]; }
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function loja(code) { return code ? (window.NX_STORE_DISPLAY ? window.NX_STORE_DISPLAY.storeDisplayName(code) : code) : '—'; }
  function titulo(s) { return String(s || '').toLowerCase().replace(/(^|\s)\S/g, function (m) { return m.toUpperCase(); }); }
  function chassiDe(r) { return r.ligacao === 'OK' && r.chassi ? r.chassi : A_CONFIRMAR; }
  function seLigado(r, v) { return r.ligacao === 'OK' ? (v || '—') : A_CONFIRMAR; }
  function vendedorDe(r) { return r.ligacao === 'OK' ? (titulo(r.vendedor) || '—') : A_CONFIRMAR; }
  function fatTxt(r) { return (r.faturamento_desde_inicio ? 'até ' : '') + data(r.faturamento); }
  function badge(f) { return '<span class="fatBadge fat' + f + '">' + esc(FAIXA_LABEL[f] || f) + '</span>'; }
  function soma(l) { return l.reduce(function (s, r) { return s + Number(r.financiado || 0); }, 0); }
  function opcoes(lista) { var s = {}; lista.forEach(function (x) { if (x) s[x] = true; }); return Object.keys(s).sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); }); }

  // período escolhido -> datas (De/Até) enviadas ao servidor, sempre pela data de faturamento
  function intervalo() {
    var f = S.filtros, h = new Date(); h.setHours(12, 0, 0, 0);
    function mesesAtras(n) { var d = new Date(h); d.setMonth(d.getMonth() - n); return d; }
    if (f.periodo === 'mes') return { ini: iso(new Date(h.getFullYear(), h.getMonth(), 1)), fim: iso(h) };
    if (f.periodo === 'ultimo') return { ini: iso(new Date(h.getFullYear(), h.getMonth() - 1, 1)), fim: iso(new Date(h.getFullYear(), h.getMonth(), 0)) };
    if (f.periodo === '3m') return { ini: iso(mesesAtras(3)), fim: iso(h) };
    if (f.periodo === '6m') return { ini: iso(mesesAtras(6)), fim: iso(h) };
    if (f.periodo === '12m') return { ini: iso(mesesAtras(12)), fim: iso(h) };
    if (f.periodo === 'custom') return { ini: f.ini || null, fim: f.fim || null };
    return { ini: null, fim: null };
  }
  function dentro(r, iv) { var d = r.faturamento || ''; return (!iv.ini || d >= iv.ini) && (!iv.fim || d <= iv.fim); }
  function foraDoPeriodo() {
    if (!S.todas) return 0;
    var iv = intervalo();
    if (!iv.ini && !iv.fim) return 0;
    return S.todas.filter(function (r) { return !dentro(r, iv); }).length;
  }
  // loja / banco / vendedor (a barra das faixas usa esta base; a lista ainda aplica a faixa)
  function base() {
    var f = S.filtros, ab = (S.dados && S.dados.abertas) || [];
    return ab.filter(function (r) {
      return (!f.loja || r.loja === f.loja) && (!f.banco || r.banco === f.banco) && (!f.vendedor || vendedorDe(r) === f.vendedor);
    });
  }
  function filtradas() { var fx = S.filtros.faixa; return base().filter(function (r) { return !fx || r.faixa === fx; }); }
  function ordenar(l) { return l.slice().sort(function (a, b) { return Number(b.dias) - Number(a.dias) || String(a.faturamento).localeCompare(String(b.faturamento)); }); }

  // ---------------------------------------------------------------- tela
  function topoHtml() {
    var c = S.dados && S.dados.carga, n = filtradas().length;
    var selo = c ? '<span class="fatSelo' + (c.desatualizada ? ' fatSeloAviso' : '') + '"' +
      (c.desatualizada ? ' title="A última carga do SPF tem ' + esc(c.dias_uteis_desde) + ' dias úteis: propostas pagas depois disso ainda aparecem em aberto até a próxima importação da Base 03."' : '') +
      '>Carga do SPF: <b>' + esc(dataCurta(c.data)) + '</b>' + (c.desatualizada ? ' · há ' + esc(c.dias_uteis_desde) + ' dias úteis' : '') + '</span>' : '';
    return '<header class="fatTopo">' +
      '<div class="fatTopoTexto"><p class="modEyebrow">Só Master</p><h1 class="modTitle">Análise de Faturamentos</h1>' +
      '<p class="modSubtitle">Propostas de financiamento faturadas e ainda sem pagamento do banco para a loja.</p></div>' +
      '<div class="fatTopoAcoes">' + selo +
      '<button type="button" class="modBtn modBtnPrimary fatExportar" data-acao="exportar"' + (S.dados && n ? '' : ' disabled') + '>Exportar Excel</button></div>' +
      '</header>' +
      (c && c.desatualizada ? '<p class="fatAvisoCarga" role="status">A última carga do SPF tem ' + esc(c.dias_uteis_desde) +
        ' dias úteis: propostas pagas depois disso ainda aparecem em aberto até a próxima importação da Base 03.</p>' : '');
  }
  function periodoHtml() {
    var f = S.filtros;
    var h = '<section class="fatPeriodo" aria-label="Período por data de faturamento">' +
      '<span class="fatRotulo">Faturadas em</span><div class="modSegmentedGroup fatPerSeg" role="group" aria-label="Período">' +
      PERIODOS.map(function (p) {
        return '<button type="button" class="modSegItem' + (f.periodo === p.v ? ' modSegItemActive' : '') + '" data-acao="periodo" data-v="' + p.v + '" aria-pressed="' + (f.periodo === p.v) + '">' + p.label + '</button>';
      }).join('') + '</div>';
    if (f.periodo === 'custom') {
      h += '<div class="fatDatas"><label class="fatData">De <input type="date" id="fatF_ini" value="' + esc(f.ini) + '"></label>' +
        '<label class="fatData">Até <input type="date" id="fatF_fim" value="' + esc(f.fim) + '"></label></div>';
    }
    h += '</section>';
    var fora = foraDoPeriodo();
    if (fora > 0) h += '<p class="fatFora" role="status">Há <b>' + fora + '</b> proposta' + (fora > 1 ? 's' : '') + ' em aberto fora deste período — ' +
      '<button type="button" class="fatLink" data-acao="periodo" data-v="tudo">ver todas</button></p>';
    return h;
  }
  function filtrosHtml() {
    var f = S.filtros, ab = (S.dados && S.dados.abertas) || [];
    function sel(id, rotulo, valor, lista, nomeDe) {
      return '<label class="fatSel"><span>' + rotulo + '</span><select id="' + id + '" data-filtro="' + id.slice(5) + '">' +
        '<option value="">Todos</option>' + lista.map(function (x) {
          return '<option value="' + esc(x) + '"' + (valor === x ? ' selected' : '') + '>' + esc(nomeDe ? nomeDe(x) : x) + '</option>';
        }).join('') + '</select></label>';
    }
    var algum = f.loja || f.banco || f.vendedor || f.faixa;
    return '<div class="fatFiltros">' +
      sel('fatF_loja', 'Loja', f.loja, opcoes(ab.map(function (r) { return r.loja; })), loja) +
      sel('fatF_banco', 'Banco/Financeira', f.banco, opcoes(ab.map(function (r) { return r.banco; }))) +
      sel('fatF_vendedor', 'Vendedor', f.vendedor, opcoes(ab.map(vendedorDe))) +
      '<button type="button" class="modBtn modBtnGhost fatLimpar" data-acao="limpar"' + (algum ? '' : ' disabled') + '>Limpar filtros</button></div>';
  }
  function resumoHtml() {
    var l = base(), total = soma(l), fx = S.filtros.faixa;
    var media = l.length ? l.reduce(function (s, r) { return s + Number(r.dias || 0); }, 0) / l.length : null;
    var cont = {}, val = {};
    BARRA.forEach(function (f) { cont[f] = 0; val[f] = 0; });
    l.forEach(function (r) { cont[r.faixa] = (cont[r.faixa] || 0) + 1; val[r.faixa] = (val[r.faixa] || 0) + Number(r.financiado || 0); });
    var info = {}; FAIXAS.forEach(function (x) { info[x.v] = x; });
    var barra = '<div class="fatBarra" role="group" aria-label="Propostas em aberto por faixa">' + BARRA.filter(function (f) { return cont[f] > 0; }).map(function (f) {
      return '<button type="button" class="fatBarSeg fat' + f + (fx === f ? ' ativa' : '') + (fx && fx !== f ? ' apagada' : '') + '" style="flex-grow:' + cont[f] + '"' +
        ' data-acao="faixa" data-v="' + f + '" aria-pressed="' + (fx === f) + '" title="' + esc(FAIXA_LABEL[f] + ': ' + cont[f]) + '">' +
        '<span class="fatSegNum">' + cont[f] + '</span></button>';
    }).join('') + (l.length ? '' : '<span class="fatBarraVazia">Nenhuma proposta em aberto</span>') + '</div>';
    var legenda = '<div class="fatLegenda">' + BARRA.map(function (f) {
      return '<button type="button" class="fatLeg fat' + f + (fx === f ? ' ativa' : '') + (fx && fx !== f ? ' apagada' : '') + '" data-acao="faixa" data-v="' + f + '" aria-pressed="' + (fx === f) + '">' +
        '<span class="fatLegNome"><i aria-hidden="true"></i>' + esc(FAIXA_LABEL[f]) + '</span>' +
        '<span class="fatLegQtd">' + num(cont[f]) + '<small> · ' + esc(brl(val[f])) + '</small></span>' +
        '<span class="fatLegDias">' + esc(info[f].dias) + '</span></button>';
    }).join('') + '</div>';
    return '<section class="fatResumo">' +
      '<div class="fatAberto"><p class="fatRotulo">Em aberto</p><p class="fatAbertoQtd">' + num(l.length) + '</p>' +
      '<p class="fatAbertoValor">' + esc(brl(total)) + ' <span>financiados</span></p>' +
      '<p class="fatAbertoMedia">Média de <b>' + (media == null ? '—' : num(media, 1)) + '</b> dias úteis em aberto</p></div>' +
      '<div class="fatFaixas"><p class="fatRotulo">Por faixa' + (fx ? ' <button type="button" class="fatLink" data-acao="faixa" data-v="' + fx + '">mostrar todas</button>' : ' <span class="fatDica">clique numa faixa para filtrar</span>') + '</p>' +
      barra + legenda + '</div></section>';
  }
  function linhaHtml(r) {
    return '<tr class="fatLinha fat' + r.faixa + '">' +
      '<td class="fatColDias"><b>' + esc(r.dias) + '</b></td>' +
      '<td class="fatMono">' + esc(chassiDe(r)) + '</td>' +
      '<td class="fatCorta" title="' + esc(seLigado(r, r.modelo)) + '">' + esc(seLigado(r, r.modelo)) + '</td>' +
      '<td class="fatCorta">' + esc(loja(r.loja)) + '</td>' +
      '<td class="fatCorta" title="' + esc(r.banco || '—') + '">' + esc(r.banco || '—') + '</td>' +
      '<td class="fatNum">' + esc(brl(r.financiado)) + '</td>' +
      '<td class="fatNum">' + esc(fatTxt(r)) + '</td>' +
      '<td class="fatColAcao"><button type="button" class="fatMais" data-acao="detalhe" data-id="' + esc(r._k) + '" aria-label="Mais detalhes da proposta ' + esc(chassiDe(r)) + '">+ detalhes</button></td></tr>';
  }
  function cartaoHtml(r) {
    return '<li class="fatCartao fat' + r.faixa + '"><div class="fatCartaoTopo">' + badge(r.faixa) +
      '<span class="fatCartaoDias"><b>' + esc(r.dias) + '</b> dias úteis</span></div>' +
      '<p class="fatCartaoModelo">' + esc(seLigado(r, r.modelo)) + '</p>' +
      '<p class="fatMono fatCartaoChassi">' + esc(chassiDe(r)) + '</p>' +
      '<dl><div><dt>Loja</dt><dd>' + esc(loja(r.loja)) + '</dd></div><div><dt>Banco</dt><dd>' + esc(r.banco || '—') + '</dd></div>' +
      '<div><dt>Financiado</dt><dd>' + esc(brl(r.financiado)) + '</dd></div><div><dt>Faturamento</dt><dd>' + esc(fatTxt(r)) + '</dd></div></dl>' +
      '<button type="button" class="fatMais" data-acao="detalhe" data-id="' + esc(r._k) + '">+ detalhes</button></li>';
  }
  function listaHtml() {
    var lista = ordenar(filtradas());
    var h = '<section class="fatLista"><h2 class="modSectionTitle">Propostas em aberto <span class="modMuted">(' + lista.length + ')</span></h2>';
    if (!lista.length) return h + '<div class="modEmptyState">Nenhuma proposta faturada em aberto com esses filtros.</div></section>';
    FAIXAS.forEach(function (x) {
      var g = lista.filter(function (r) { return r.faixa === x.v; });
      if (!g.length) return;
      h += '<div class="fatGrupo fat' + x.v + '"><h3 class="fatGrupoTopo"><span class="fatGrupoNome"><i aria-hidden="true"></i>' + esc(x.label) +
        ' <small>' + esc(x.dias) + '</small></span><span class="fatGrupoTot">' + g.length + ' proposta' + (g.length > 1 ? 's' : '') + ' · ' + esc(brl(soma(g))) + '</span></h3>' +
        '<div class="fatTabela"><table class="fatTab"><colgroup><col class="cDias"><col class="cChassi"><col class="cModelo"><col class="cLoja"><col class="cBanco">' +
        '<col class="cValor"><col class="cData"><col class="cAcao"></colgroup>' +
        '<thead><tr><th class="fatColDias">Dias úteis</th><th>Chassi</th><th>Modelo</th><th>Loja</th><th>Banco</th><th class="fatNum">Financiado</th>' +
        '<th class="fatNum">Faturamento</th><th class="fatColAcao"><span class="fatSr">Ações</span></th></tr></thead><tbody>' +
        g.map(linhaHtml).join('') + '</tbody></table></div>' +
        '<ul class="fatCartoes">' + g.map(cartaoHtml).join('') + '</ul></div>';
    });
    var desde = S.dados.carga && S.dados.carga.primeira;
    return h + '<p class="modMuted fatNota">Data de faturamento: dia da primeira carga do SPF em que a proposta apareceu FATURADA ' +
      '(o relatório do SPF ainda não traz essa data; as cargas começam em ' + esc(data(desde)) + ' — "até" = já estava faturada na primeira carga). ' +
      '"A confirmar": o chassi não foi ligado com segurança pelo nome do cliente na Base 02.</p></section>';
  }
  function bancosHtml() {
    var p = (S.dados && S.dados.pagas_por_banco) || [];
    var h = '<section class="fatBancos"><h2 class="modSectionTitle">Prazo médio de pagamento por banco</h2>' +
      '<p class="modMuted">Propostas já pagas no período: média de dias úteis entre o faturamento e o pagamento.</p>';
    if (!p.length) return h + '<p class="modMuted">Nenhuma proposta paga no período.</p></section>';
    return h + '<ul class="fatBancosLista">' + p.map(function (b) {
      return '<li><span class="fatCorta">' + esc(b.banco) + '</span><span class="fatNum">' + num(b.quantidade) + ' paga' + (Number(b.quantidade) === 1 ? '' : 's') + '</span>' +
        '<b class="fatNum">' + num(b.media_dias, 1) + ' <small>dias úteis</small></b></li>';
    }).join('') + '</ul></section>';
  }
  function detalheHtml() {
    var id = S.detalhe;
    var r = id && ((S.dados && S.dados.abertas) || []).filter(function (x) { return x._k === String(id); })[0];
    if (!r) return '';
    var carga = r.faturamento_desde_inicio ? 'Já aparecia faturada na primeira carga do SPF (' + dataLonga(r.faturamento) + ')' : 'Carga do SPF de ' + dataLonga(r.faturamento);
    function item(rot, v, cls) { return '<div' + (cls ? ' class="' + cls + '"' : '') + '><dt>' + rot + '</dt><dd>' + v + '</dd></div>'; }
    return '<div class="fatVeu" data-acao="fechar"></div>' +
      '<aside class="fatDetalhe fat' + r.faixa + '" role="dialog" aria-modal="true" aria-labelledby="fatDetTitulo">' +
      '<div class="fatDetTopo"><div><p class="modEyebrow">Proposta faturada em aberto</p><h2 id="fatDetTitulo" class="fatDetTitulo">' + esc(r.cliente || '—') + '</h2></div>' +
      '<button type="button" class="fatFechar" data-acao="fechar" aria-label="Fechar detalhes">×</button></div>' +
      '<div class="fatDetDestaque"><b>' + esc(r.dias) + '</b><span>dias úteis em aberto</span>' + badge(r.faixa) + '</div>' +
      '<dl class="fatDetLista">' +
      item('Cliente', esc(r.cliente || '—')) +
      item('Vendedor', esc(vendedorDe(r))) +
      item('Data de inclusão', esc(dataLonga(r.inclusao))) +
      item('Data de faturamento', esc((r.faturamento_desde_inicio ? 'até ' : '') + dataLonga(r.faturamento))) +
      item('Chassi', '<span class="fatMono">' + esc(chassiDe(r)) + '</span>') +
      item('Modelo', esc(seLigado(r, r.modelo))) +
      item('Loja', esc(loja(r.loja))) +
      item('Banco/Financeira', esc(r.banco || '—')) +
      item('Valor financiado', esc(brl(r.financiado))) +
      item('Dias úteis em aberto', esc(r.dias)) +
      item('Faixa', badge(r.faixa)) +
      item('Apareceu faturada', esc(carga)) +
      '</dl></aside>';
  }
  function render() {
    if (!outletRef) return;
    var corpo;
    if (S.erro) corpo = topoHtml() + '<div class="modErrorState">' + esc(S.erro) + ' <button type="button" class="modBtn modBtnSecondary" data-acao="recarregar">Tentar novamente</button></div>';
    else if (!S.dados) corpo = topoHtml() + '<div class="modLoadingState">Carregando…</div>';
    else {
      corpo = topoHtml() + periodoHtml() + filtrosHtml() + (S.msg ? '<div class="modErrorState" role="status">' + esc(S.msg) + '</div>' : '') +
        (S.carregando ? '<div class="modLoadingState fatAtualizando">Atualizando…</div>' : '') + resumoHtml() + listaHtml() + bancosHtml() + detalheHtml();
    }
    outletRef.innerHTML = '<div class="fatPage' + (S.detalhe ? ' fatComDetalhe' : '') + '">' + corpo + '</div>';
    if (S.detalhe) { var bt = outletRef.querySelector('.fatFechar'); if (bt) bt.focus(); }
  }

  // ---------------------------------------------------------------- ações
  function carregar() {
    S.carregando = true; S.msg = null; render();
    var iv = intervalo();
    var pedidos = [buscar(iv.ini, iv.fim)];
    if (!S.todas) pedidos.push((iv.ini || iv.fim) ? buscar(null, null) : null);
    return Promise.all(pedidos).then(function (res) {
      S.dados = res[0] || { abertas: [], pagas_por_banco: [] };
      (S.dados.abertas || []).forEach(function (r, i) { r._k = String(i); });
      if (!S.todas) S.todas = (res[1] || S.dados).abertas || [];
      S.erro = null; S.carregando = false; render();
    }).catch(function (e) {
      S.carregando = false;
      if (e && e.state === 'SESSION_EXPIRED' && window.NX_AUTH_CORE && window.NX_AUTH_CORE.reportSessionExpired) { window.NX_AUTH_CORE.reportSessionExpired(); return; }
      if (S.dados && e && e.state === 'VALIDATION') S.msg = e.message; else S.erro = (e && e.message) || 'Não foi possível carregar agora.';
      render();
    });
  }
  function exportar() {
    var H = window.NX_XLSX_EXPORT_HELPER, lista = ordenar(filtradas());
    if (!H || !window.XLSX || !lista.length) return;
    var headers = ['Chassi', 'Nome do cliente', 'Modelo', 'Loja', 'Vendedor', 'Banco/financeira', 'Valor financiado', 'Data de inclusão',
                   'Data de faturamento', 'Dias úteis em aberto', 'Faixa', 'Proposta SPF'];
    var linhas = lista.map(function (r) {
      return [chassiDe(r), r.cliente || '', seLigado(r, r.modelo), loja(r.loja), vendedorDe(r), r.banco || '',
              Number(r.financiado) || 0, H.excelDateValue(r.inclusao) || '', H.excelDateValue(r.faturamento) || '', Number(r.dias) || 0,
              FAIXA_LABEL[r.faixa] || r.faixa, r.proposta || ''];
    });
    H.downloadWorkbook(headers, linhas, 'Faturamentos em aberto', 'Faturamentos_em_aberto_' + H.excelFileStamp() + '.xlsx', {
      moneyCols: new Set(['Valor financiado']), pctCols: new Set(), dateCols: new Set(['Data de inclusão', 'Data de faturamento']),
      intCols: new Set(['Dias úteis em aberto']),
      textCols: new Set(['Chassi', 'Nome do cliente', 'Modelo', 'Loja', 'Vendedor', 'Banco/financeira', 'Faixa', 'Proposta SPF'])
    });
  }
  function fecharDetalhe() {
    S.detalhe = null; render();
    if (focoAntes) {
      var alvo = outletRef.querySelector('.fatMais[data-id="' + focoAntes + '"]');
      if (alvo && alvo.offsetParent) alvo.focus();
      focoAntes = null;
    }
  }
  function onClick(e) {
    var b = e.target.closest ? e.target.closest('[data-acao]') : null;
    if (!b || !b.closest('.fatPage') || !outletRef.contains(b) || b.disabled) return;
    var a = b.getAttribute('data-acao');
    if (a === 'periodo') {
      var v = b.getAttribute('data-v');
      if (v === S.filtros.periodo) return;
      S.filtros.periodo = v;
      if (v === 'custom') { var iv = intervalo(); S.filtros.ini = S.filtros.ini || ''; S.filtros.fim = S.filtros.fim || ''; render(); if (!iv.ini && !iv.fim) return; }
      carregar();
    }
    else if (a === 'faixa') { var fx = b.getAttribute('data-v'); S.filtros.faixa = S.filtros.faixa === fx ? '' : fx; render(); }
    else if (a === 'limpar') { S.filtros.loja = ''; S.filtros.banco = ''; S.filtros.vendedor = ''; S.filtros.faixa = ''; render(); }
    else if (a === 'exportar') exportar();
    else if (a === 'recarregar') { S.todas = null; carregar(); }
    else if (a === 'detalhe') { focoAntes = b.getAttribute('data-id'); S.detalhe = focoAntes; render(); }
    else if (a === 'fechar') fecharDetalhe();
  }
  function onChange(e) {
    var t = e.target;
    if (!t || !t.closest || !t.closest('.fatPage')) return;
    if (t.id === 'fatF_ini' || t.id === 'fatF_fim') {
      S.filtros[t.id.slice(5)] = t.value;
      if (S.filtros.ini && S.filtros.fim && S.filtros.fim < S.filtros.ini) { S.msg = 'A data "Até" precisa ser igual ou depois da data "De".'; render(); return; }
      carregar(); return;
    }
    var k = t.getAttribute('data-filtro');
    if (k) { S.filtros[k] = t.value; render(); }
  }
  function onKey(e) {
    if (!S || !S.detalhe) return;
    if (e.key === 'Escape') { e.preventDefault(); fecharDetalhe(); return; }
    if (e.key === 'Tab') {   // mantém o foco dentro do painel
      var foc = outletRef.querySelectorAll('.fatDetalhe button, .fatDetalhe [href], .fatDetalhe [tabindex]:not([tabindex="-1"])');
      if (!foc.length) return;
      var pri = foc[0], ult = foc[foc.length - 1];
      if (e.shiftKey && document.activeElement === pri) { e.preventDefault(); ult.focus(); }
      else if (!e.shiftKey && document.activeElement === ult) { e.preventDefault(); pri.focus(); }
    }
  }

  window.NX_ANALISE_FATURAMENTOS_PAGE = {
    getState: function () { return S; },
    render: function (outlet) {
      if (outletRef && outletRef !== outlet) { outletRef.removeEventListener('click', onClick); outletRef.removeEventListener('change', onChange); }
      if (outletRef !== outlet) { outlet.addEventListener('click', onClick); outlet.addEventListener('change', onChange); }
      if (!outletRef) document.addEventListener('keydown', onKey);
      outletRef = outlet;
      S = { filtros: { periodo: '6m', ini: '', fim: '', loja: '', banco: '', vendedor: '', faixa: '' },
            dados: null, todas: null, erro: null, msg: null, carregando: false, detalhe: null };
      return carregar();
    }
  };
})();
