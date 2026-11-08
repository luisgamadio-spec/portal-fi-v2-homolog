/* PORTAL-NEXT V2 — Análise de Faturamentos (08/11/2026, pedido do Luis). SOMENTE Master.
   Propostas de financiamento FATURADAS e ainda sem pagamento (o banco não liberou o dinheiro para a loja).

   Acesso: MASTER_ONLY no registro (menu e rota) + a função master_faturamentos confere o Master no banco a cada
   chamada. Fonte: a mesma da Análise F&I do Grupo (propostas do SPF/Base 03, financiamentos/Base 02, vendas/Base 01).
   O relatório do SPF ainda não traz data de faturamento nem de pagamento: vale o dia da primeira carga do SPF em que a
   proposta apareceu FATURADA / PAGA (decisão do Luis, opção A). Dias em aberto = dias úteis (sem fim de semana,
   feriados nacionais e Carnaval), contados no banco. O período vai ao servidor; loja, banco, vendedor e faixa filtram
   aqui mesmo. Nunca recebe nem mostra CPF. */
(function () {
  'use strict';

  var FAIXAS = [
    { v: 'NORMAL', label: 'Normal', dias: '1–3 dias úteis' },
    { v: 'ATENCAO', label: 'Em atenção', dias: '4–5 dias úteis' },
    { v: 'URGENCIA', label: 'Urgência', dias: '6–9 dias úteis' },
    { v: 'GRAVE', label: 'Grave', dias: 'acima de 9 dias úteis' }
  ];
  var FAIXA_LABEL = { NORMAL: 'Normal', ATENCAO: 'Em atenção', URGENCIA: 'Urgência', GRAVE: 'Grave' };
  var A_CONFIRMAR = 'a confirmar';

  var outletRef = null, S = null;

  // ---------------------------------------------------------------- servidor
  function buscar(por, ini, fim) {
    var cfg = window.NX_INTELLIGENCE_CONFIG || {};
    if (!cfg.supabaseUrl || !cfg.supabasePublishableKey) return Promise.reject({ state: 'BACKEND_ERROR', message: 'Configuração real ausente neste ambiente.' });
    if (!window.NX_AUTH || typeof window.NX_AUTH.getAccessToken !== 'function') return Promise.reject({ state: 'SESSION_EXPIRED', message: 'Sessão indisponível.' });
    return window.NX_AUTH.getAccessToken().then(function (token) {
      if (!token) return Promise.reject({ state: 'SESSION_EXPIRED', message: 'Sessão expirada.' });
      return fetch(cfg.supabaseUrl + '/rest/v1/rpc/master_faturamentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': cfg.supabasePublishableKey, 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ p_por: por, p_ini: ini || null, p_fim: fim || null })
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
  function dataCurta(v) { if (!v) return '—'; var p = String(v).slice(0, 10).split('-'); return p[2] + '/' + p[1]; }
  function loja(code) { return code ? (window.NX_STORE_DISPLAY ? window.NX_STORE_DISPLAY.storeDisplayName(code) : code) : '—'; }
  function titulo(s) { return String(s || '').toLowerCase().replace(/(^|\s)\S/g, function (m) { return m.toUpperCase(); }); }
  function chassiDe(r) { return r.ligacao === 'OK' && r.chassi ? r.chassi : A_CONFIRMAR; }
  function seLigado(r, v) { return r.ligacao === 'OK' ? (v || '—') : A_CONFIRMAR; }
  function badge(f) { return '<span class="fatBadge fat' + f + '">' + esc(FAIXA_LABEL[f] || f) + '</span>'; }
  function opcoes(lista) { var s = {}; lista.forEach(function (x) { if (x) s[x] = true; }); return Object.keys(s).sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); }); }

  function filtradas() {
    var f = S.filtros, ab = (S.dados && S.dados.abertas) || [];
    return ab.filter(function (r) {
      return (!f.loja || r.loja === f.loja) && (!f.banco || r.banco === f.banco) &&
        (!f.vendedor || (r.ligacao === 'OK' ? r.vendedor : A_CONFIRMAR) === f.vendedor) && (!f.faixa || r.faixa === f.faixa);
    });
  }
  function ranking(lista, chave) {
    var c = {};
    lista.forEach(function (r) { if (r.faixa !== 'GRAVE') return; var k = chave(r); c[k] = (c[k] || 0) + 1; });
    return Object.keys(c).sort(function (a, b) { return c[b] - c[a] || a.localeCompare(b, 'pt-BR'); }).slice(0, 3).map(function (k) { return { nome: k, n: c[k] }; });
  }

  // ---------------------------------------------------------------- tela
  function cabecalho() {
    return '<div class="modPageHeader"><div class="modHeaderMain"><p class="modEyebrow">Só Master</p>' +
      '<h1 class="modTitle">Análise de Faturamentos</h1>' +
      '<p class="modSubtitle">Propostas de financiamento faturadas e ainda sem pagamento do banco para a loja.</p></div></div>';
  }
  function cargaHtml() {
    var c = S.dados && S.dados.carga;
    if (!c) return '';
    return '<div class="fatCarga"><span>Situação da carga do SPF: <b>' + esc(dataCurta(c.data)) + '</b></span>' +
      (c.desatualizada ? '<span class="fatAviso" role="status">A última carga do SPF tem ' + esc(c.dias_uteis_desde) + ' dias úteis. ' +
        'Propostas pagas depois disso ainda aparecem em aberto até a próxima importação da Base 03.</span>' : '') + '</div>';
  }
  function filtrosHtml() {
    var f = S.filtros, ab = (S.dados && S.dados.abertas) || [];
    function sel(id, rotulo, valor, lista, nomeDe) {
      return '<div class="modField"><label for="' + id + '">' + rotulo + '</label><select id="' + id + '" data-filtro="' + id.slice(5) + '">' +
        '<option value="">Todos</option>' + lista.map(function (x) {
          return '<option value="' + esc(x) + '"' + (valor === x ? ' selected' : '') + '>' + esc(nomeDe ? nomeDe(x) : x) + '</option>';
        }).join('') + '</select></div>';
    }
    return '<div class="modFilters fatFiltros">' +
      '<div class="modField"><label>Período por</label><div class="modSegmentedGroup" role="group" aria-label="Período por">' +
      ['faturamento', 'inclusao'].map(function (p) {
        return '<button type="button" class="modSegItem' + (f.por === p ? ' modSegItemActive' : '') + '" data-acao="por" data-v="' + p + '" aria-pressed="' + (f.por === p) + '">' +
          (p === 'faturamento' ? 'Data de faturamento' : 'Data de inclusão') + '</button>';
      }).join('') + '</div></div>' +
      '<div class="modField"><label for="fatF_ini">De</label><input type="date" id="fatF_ini" value="' + esc(f.ini) + '"></div>' +
      '<div class="modField"><label for="fatF_fim">Até</label><input type="date" id="fatF_fim" value="' + esc(f.fim) + '"></div>' +
      sel('fatF_loja', 'Loja', f.loja, opcoes(ab.map(function (r) { return r.loja; })), loja) +
      sel('fatF_banco', 'Banco/financeira', f.banco, opcoes(ab.map(function (r) { return r.banco; }))) +
      sel('fatF_vendedor', 'Vendedor', f.vendedor, opcoes(ab.map(function (r) { return r.ligacao === 'OK' ? r.vendedor : A_CONFIRMAR; })), titulo) +
      '<div class="modField"><label for="fatF_faixa">Faixa</label><select id="fatF_faixa" data-filtro="faixa"><option value="">Todas</option>' +
      FAIXAS.map(function (x) { return '<option value="' + x.v + '"' + (f.faixa === x.v ? ' selected' : '') + '>' + x.label + '</option>'; }).join('') + '</select></div>' +
      '<div class="modField fatLimpar"><label>&nbsp;</label><button type="button" class="modBtn modBtnGhost" data-acao="limpar">Limpar filtros</button></div>' +
      '</div>';
  }
  function resumoHtml(lista) {
    var total = lista.reduce(function (s, r) { return s + Number(r.financiado || 0); }, 0);
    var media = lista.length ? lista.reduce(function (s, r) { return s + Number(r.dias || 0); }, 0) / lista.length : null;
    var cont = {}; FAIXAS.forEach(function (x) { cont[x.v] = 0; }); lista.forEach(function (r) { cont[r.faixa] = (cont[r.faixa] || 0) + 1; });
    var h = '<div class="modKpiGrid fatKpis">' +
      '<div class="modKpiCard fatKpiTotal"><p class="modKpiLabel">Em aberto</p><p class="modKpiValue">' + num(lista.length) + '</p><p class="modKpiHint">' + esc(brl(total)) + ' financiados</p></div>' +
      FAIXAS.map(function (x) {
        return '<button type="button" class="modKpiCard fatKpiFaixa fat' + x.v + (S.filtros.faixa === x.v ? ' ativa' : '') + '" data-acao="faixa" data-v="' + x.v + '" aria-pressed="' + (S.filtros.faixa === x.v) + '">' +
          '<span class="modKpiLabel">' + x.label + '</span><span class="modKpiValue">' + num(cont[x.v]) + '</span><span class="modKpiHint">' + x.dias + '</span></button>';
      }).join('') +
      '<div class="modKpiCard"><p class="modKpiLabel">Média em aberto</p><p class="modKpiValue">' + (media == null ? '—' : num(media, 1)) + '</p><p class="modKpiHint">dias úteis</p></div></div>';
    var rl = ranking(lista, function (r) { return loja(r.loja); }), rb = ranking(lista, function (r) { return r.banco || '—'; }),
        rv = ranking(lista, function (r) { return r.ligacao === 'OK' ? titulo(r.vendedor) : A_CONFIRMAR; });
    function bloco(t, r) {
      return '<div class="fatTop"><p class="modKpiLabel">' + t + '</p>' + (r.length ? '<ol>' + r.map(function (x) {
        return '<li><span>' + esc(x.nome) + '</span><b>' + x.n + '</b></li>'; }).join('') + '</ol>' : '<p class="modMuted">Nenhum caso grave.</p>') + '</div>';
    }
    return h + '<div class="modPanel fatTops"><p class="modSectionTitle">Mais casos graves</p><div class="fatTopsGrid">' +
      bloco('Lojas', rl) + bloco('Bancos', rb) + bloco('Vendedores', rv) + '</div></div>';
  }
  function listaHtml(lista) {
    var h = '<div class="fatListaTopo"><p class="modSectionTitle">Chassi a chassi <span class="modMuted">(' + lista.length + ', do mais grave para o mais leve)</span></p>' +
      '<button type="button" class="modBtn modBtnSecondary" data-acao="exportar"' + (lista.length ? '' : ' disabled') + '>Exportar Excel</button></div>';
    if (!lista.length) return h + '<div class="modEmptyState">Nenhuma proposta faturada em aberto com esses filtros.</div>';
    var desde = S.dados.carga && S.dados.carga.primeira;
    function fatTxt(r) { return (r.faturamento_desde_inicio ? 'até ' : '') + data(r.faturamento); }
    h += '<div class="modTableWrap fatTabela"><table class="modTable"><thead><tr>' +
      '<th>Chassi</th><th>Cliente</th><th>Modelo</th><th>Loja</th><th>Vendedor</th><th>Banco</th><th class="modCurrencyCol">Financiado</th>' +
      '<th>Inclusão</th><th>Faturamento</th><th class="modNumCol">Dias úteis</th><th>Faixa</th></tr></thead><tbody>' +
      lista.map(function (r) {
        return '<tr class="fatLinha fat' + r.faixa + '"><td class="fatMono">' + esc(chassiDe(r)) + '</td><td>' + esc(r.cliente || '—') + '</td>' +
          '<td>' + esc(seLigado(r, r.modelo)) + '</td><td>' + esc(loja(r.loja)) + '</td><td>' + esc(r.ligacao === 'OK' ? titulo(r.vendedor) || '—' : A_CONFIRMAR) + '</td>' +
          '<td>' + esc(r.banco || '—') + '</td><td class="modCurrencyCol">' + esc(brl(r.financiado)) + '</td><td>' + esc(data(r.inclusao)) + '</td>' +
          '<td>' + esc(fatTxt(r)) + '</td><td class="modNumCol">' + esc(r.dias) + '</td><td>' + badge(r.faixa) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    h += '<ul class="fatCartoes">' + lista.map(function (r) {
      return '<li class="fatCartao fat' + r.faixa + '"><div class="fatCartaoTopo">' + badge(r.faixa) + '<b class="fatDias">' + esc(r.dias) + ' dias úteis</b></div>' +
        '<p class="fatCliente">' + esc(r.cliente || '—') + '</p>' +
        '<p class="fatMono">' + esc(chassiDe(r)) + ' · ' + esc(seLigado(r, r.modelo)) + '</p>' +
        '<dl><div><dt>Loja</dt><dd>' + esc(loja(r.loja)) + '</dd></div><div><dt>Vendedor</dt><dd>' + esc(r.ligacao === 'OK' ? titulo(r.vendedor) || '—' : A_CONFIRMAR) + '</dd></div>' +
        '<div><dt>Banco</dt><dd>' + esc(r.banco || '—') + '</dd></div><div><dt>Financiado</dt><dd>' + esc(brl(r.financiado)) + '</dd></div>' +
        '<div><dt>Inclusão</dt><dd>' + esc(data(r.inclusao)) + '</dd></div><div><dt>Faturamento</dt><dd>' + esc(fatTxt(r)) + '</dd></div></dl></li>';
    }).join('') + '</ul>';
    return h + '<p class="modMuted fatNota">Datas de faturamento e pagamento: dia da primeira carga do SPF em que a proposta apareceu ' +
      'FATURADA / PAGA (o relatório do SPF ainda não traz essas datas; as cargas começam em ' + esc(data(desde)) + '). ' +
      '"A confirmar": o chassi não foi ligado com segurança pelo nome do cliente na Base 02.</p>';
  }
  function bancosHtml() {
    var p = (S.dados && S.dados.pagas_por_banco) || [];
    var h = '<div class="modPanel fatBancos"><p class="modSectionTitle">Prazo médio de pagamento por banco</p>' +
      '<p class="modMuted">Propostas já pagas no período: média de dias úteis entre o faturamento e o pagamento.</p>';
    if (!p.length) return h + '<div class="modEmptyState">Nenhuma proposta paga no período.</div></div>';
    return h + '<div class="modTableWrap"><table class="modTable"><thead><tr><th>Banco/financeira</th><th class="modNumCol">Pagas</th><th class="modNumCol">Média (dias úteis)</th></tr></thead><tbody>' +
      p.map(function (b) { return '<tr><td>' + esc(b.banco) + '</td><td class="modNumCol">' + num(b.quantidade) + '</td><td class="modNumCol">' + num(b.media_dias, 1) + '</td></tr>'; }).join('') +
      '</tbody></table></div></div>';
  }
  function render() {
    if (!outletRef) return;
    var corpo = cabecalho();
    if (S.erro) corpo += '<div class="modErrorState">' + esc(S.erro) + ' <button type="button" class="modBtn modBtnSecondary" data-acao="recarregar">Tentar novamente</button></div>';
    else if (!S.dados) corpo += '<div class="modLoadingState">Carregando…</div>';
    else {
      var lista = filtradas();
      corpo += cargaHtml() + filtrosHtml() + (S.msg ? '<div class="modErrorState" role="status">' + esc(S.msg) + '</div>' : '') +
        (S.carregando ? '<div class="modLoadingState">Atualizando…</div>' : '') + resumoHtml(lista) + listaHtml(lista) + bancosHtml();
    }
    outletRef.innerHTML = '<div class="fatPage">' + corpo + '</div>';
  }

  // ---------------------------------------------------------------- ações
  function carregar() {
    S.carregando = true; S.msg = null; render();
    return buscar(S.filtros.por, S.filtros.ini, S.filtros.fim).then(function (d) {
      S.dados = d || { abertas: [], pagas_por_banco: [] }; S.erro = null; S.carregando = false; render();
    }).catch(function (e) {
      S.carregando = false;
      if (e && e.state === 'SESSION_EXPIRED' && window.NX_AUTH_CORE && window.NX_AUTH_CORE.reportSessionExpired) { window.NX_AUTH_CORE.reportSessionExpired(); return; }
      if (S.dados && e && e.state === 'VALIDATION') S.msg = e.message; else S.erro = (e && e.message) || 'Não foi possível carregar agora.';
      render();
    });
  }
  function exportar() {
    var H = window.NX_XLSX_EXPORT_HELPER, lista = filtradas();
    if (!H || !window.XLSX || !lista.length) return;
    var headers = ['Chassi', 'Nome do cliente', 'Modelo', 'Loja', 'Vendedor', 'Banco/financeira', 'Valor financiado', 'Data de inclusão',
                   'Data de faturamento', 'Dias úteis em aberto', 'Faixa', 'Proposta SPF'];
    var linhas = lista.map(function (r) {
      return [chassiDe(r), r.cliente || '', seLigado(r, r.modelo), loja(r.loja), r.ligacao === 'OK' ? titulo(r.vendedor) : A_CONFIRMAR, r.banco || '',
              Number(r.financiado) || 0, H.excelDateValue(r.inclusao) || '', H.excelDateValue(r.faturamento) || '', Number(r.dias) || 0,
              FAIXA_LABEL[r.faixa] || r.faixa, r.proposta || ''];
    });
    H.downloadWorkbook(headers, linhas, 'Faturamentos em aberto', 'Faturamentos_em_aberto_' + H.excelFileStamp() + '.xlsx', {
      moneyCols: new Set(['Valor financiado']), pctCols: new Set(), dateCols: new Set(['Data de inclusão', 'Data de faturamento']),
      intCols: new Set(['Dias úteis em aberto']),
      textCols: new Set(['Chassi', 'Nome do cliente', 'Modelo', 'Loja', 'Vendedor', 'Banco/financeira', 'Faixa', 'Proposta SPF'])
    });
  }
  function onClick(e) {
    var b = e.target.closest ? e.target.closest('[data-acao]') : null;
    if (!b || !b.closest('.fatPage') || !outletRef.contains(b) || b.disabled) return;
    var a = b.getAttribute('data-acao');
    if (a === 'por') { S.filtros.por = b.getAttribute('data-v'); carregar(); }
    else if (a === 'faixa') { var v = b.getAttribute('data-v'); S.filtros.faixa = S.filtros.faixa === v ? '' : v; render(); }
    else if (a === 'limpar') { S.filtros = { por: S.filtros.por, ini: '', fim: '', loja: '', banco: '', vendedor: '', faixa: '' }; carregar(); }
    else if (a === 'exportar') exportar();
    else if (a === 'recarregar') carregar();
  }
  function onChange(e) {
    var t = e.target;
    if (!t || !t.closest || !t.closest('.fatPage')) return;
    if (t.id === 'fatF_ini' || t.id === 'fatF_fim') { S.filtros[t.id.slice(5)] = t.value; carregar(); return; }
    var k = t.getAttribute('data-filtro');
    if (k) { S.filtros[k] = t.value; render(); }
  }

  window.NX_ANALISE_FATURAMENTOS_PAGE = {
    getState: function () { return S; },
    render: function (outlet) {
      if (outletRef && outletRef !== outlet) { outletRef.removeEventListener('click', onClick); outletRef.removeEventListener('change', onChange); }
      if (outletRef !== outlet) { outlet.addEventListener('click', onClick); outlet.addEventListener('change', onChange); }
      outletRef = outlet;
      S = { filtros: { por: 'faturamento', ini: '', fim: '', loja: '', banco: '', vendedor: '', faixa: '' }, dados: null, erro: null, msg: null, carregando: false };
      return carregar();
    }
  };
})();
