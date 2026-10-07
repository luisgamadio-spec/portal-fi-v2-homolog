/* PORTAL-NEXT V2 -- Painel Master / Revisões Cadastrais (paridade com o v1,
   auditoria de 07/10/2026; v1: portal-app.js, Fase 4.3 / 17.0).

   Seção autocontida: o shell-admin.js só a encaixa (menu, troca de seção,
   renderPanel). Toda a lógica e a marcação ficam aqui, para não misturar com
   as demais seções do Painel Master. Transporte: NX_MASTER_REVISOES_PROVIDER.

   Regras de negócio do v1 mantidas: Aprovar só confirma administrativamente
   (o valor já está em uso); Corrigir substitui pelo valor certo (Loja: só as
   8 lojas oficiais aceitas pelo servidor; Login NBS: validado no servidor
   contra o diretório de vendedores). Nenhuma ação bloqueia o usuário, altera
   e-mail/senha ou desativa a conta. */
(function () {
  'use strict';

  var LOJAS = ['ABC', 'ALPHAVILLE', 'ANALIA FRANCO', 'BANDEIRANTES', 'BARRA FUNDA', 'EUROPA', 'GASTAO', 'NACOES'];
  var FILTROS = [['PENDENTE', 'Pendentes'], ['APROVADO', 'Aprovadas'], ['CORRIGIDO', 'Corrigidas'], ['TODAS', 'Todas']];
  var CAMPO_LABEL = { LOJA: 'Loja', LOGIN_NBS: 'Login NBS' };
  var STATUS_LABEL = { PENDENTE: 'Pendente', APROVADO: 'Aprovada', CORRIGIDO: 'Corrigida' };
  var MENSAGENS = {
    LOJA_INVALIDA: 'Selecione uma loja válida da lista oficial.',
    NBS_NAO_ENCONTRADO: 'Login NBS não encontrado no diretório de vendedores.',
    NBS_VINCULADO_OUTRO_USUARIO: 'Este Login NBS já está vinculado a outro usuário.',
    NBS_CPF_DIVERGENTE: 'O CPF do Login NBS não corresponde ao cadastro deste usuário.',
    JA_PROCESSADA: 'Esta revisão já foi processada.',
    NAO_ENCONTRADA: 'Revisão não encontrada.',
    USUARIO_NAO_ENCONTRADO: 'Usuário da revisão não encontrado.',
    CAMPO_NAO_SUPORTADO: 'Este campo não pode ser corrigido por aqui.',
    VALOR_OBRIGATORIO: 'Informe o valor correto.',
    MODO_HOMOLOGACAO: 'MODO HOMOLOGAÇÃO — nenhuma alteração é gravada neste ambiente.'
  };

  var st = { panel: null, filtro: 'PENDENTE', loading: false, error: null, rows: [], totalPendentes: 0, seq: 0, msg: null, modal: null, busy: false };

  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtData(v) { if (!v) return '-'; try { return new Date(v).toLocaleString('pt-BR'); } catch (e) { return '-'; } }
  function valorTxt(v) { return v === null || v === undefined || v === '' ? '(vazio)' : String(v); }
  function provider() { return window.NX_MASTER_REVISOES_PROVIDER; }
  function homolog() { return !provider() || provider().isHomologationMode(); }
  function mounted() { return !!(st.panel && st.panel.isConnected && st.panel.getAttribute('data-revisoes') === '1'); }
  function errorMsg(err) {
    if (!err) return 'Não foi possível concluir a operação.';
    if (err.codigo && MENSAGENS[err.codigo]) return MENSAGENS[err.codigo];
    if (err.state === 'HOMOLOG_BLOCKED') return MENSAGENS.MODO_HOMOLOGACAO;
    if (err.state === 'AUTH_DENIED') return 'Acesso exclusivo do perfil Master.';
    if (err.state === 'NETWORK_ERROR') return 'Falha de rede. Verifique sua conexão e tente novamente.';
    if (err.state === 'TIMEOUT') return 'A resposta demorou demais. Tente novamente.';
    return 'Não foi possível concluir a operação agora. Tente novamente.';
  }

  // ---------- carga ----------
  function load() {
    var mySeq = ++st.seq;
    st.loading = true; st.error = null;
    paint();
    return provider().listRevisoes(st.filtro).then(function (r) {
      if (mySeq !== st.seq) return;
      st.loading = false; st.rows = r.rows; st.totalPendentes = r.totalPendentes;
      paint();
    }, function (err) {
      if (mySeq !== st.seq) return;
      st.loading = false; st.error = err || { state: 'RPC_ERROR' };
      if (err && err.state === 'SESSION_EXPIRED' && window.NX_AUTH_CORE && window.NX_AUTH_CORE.reportSessionExpired) window.NX_AUTH_CORE.reportSessionExpired();
      paint();
    });
  }

  // ---------- painel ----------
  function listHtml() {
    if (st.loading) return '<div class="modLoadingState">Carregando revisões…</div>';
    if (st.error) return '<div class="modErrorState"><b>Não foi possível carregar as revisões.</b> ' + esc(errorMsg(st.error)) + ' <button type="button" class="modBtnGhost" data-rv-acao="recarregar">Tentar novamente</button></div>';
    if (!st.rows.length) return '<div class="modEmptyState">Nenhuma revisão encontrada para este filtro.</div>';
    return '<div class="modTableWrap"><table class="modTable rvTable"><thead><tr><th>Usuário</th><th>Campo</th><th>Valor anterior → informado</th><th>Data</th><th>Status</th><th></th></tr></thead><tbody>' +
      st.rows.map(function (r, i) {
        var cls = r.status === 'PENDENTE' ? 'maBadgeInvited' : 'maBadgeActive';
        return '<tr data-rv-idx="' + i + '"><td>' + esc(r.usuario_nome) + '</td><td>' + esc(CAMPO_LABEL[r.campo] || r.campo) + '</td>' +
          '<td>' + esc(valorTxt(r.valor_anterior)) + ' → <b>' + esc(valorTxt(r.valor_novo)) + '</b></td><td>' + esc(fmtData(r.criado_em)) + '</td>' +
          '<td><span class="maBadge ' + cls + '">' + esc(STATUS_LABEL[r.status] || r.status) + '</span></td>' +
          '<td><button type="button" class="modBtnGhost" data-rv-acao="detalhe" data-rv-idx="' + i + '">Ver detalhes</button></td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  function paint() {
    if (!mounted()) return;
    st.panel.innerHTML =
      (homolog() ? '<p class="note gbWarn gbHomologBanner maHomologBanner">🧪 MODO HOMOLOGAÇÃO — nenhuma alteração será gravada neste ambiente.</p>' : '') +
      '<h2 class="modTitle">Revisões Cadastrais' + (st.totalPendentes ? ' <span class="maBadge maBadgeInvited">' + esc(st.totalPendentes) + ' pendente(s)</span>' : '') + '</h2>' +
      '<p class="modSubtitle">Divergências de Loja ou Login NBS informadas pelo usuário em <b>Ativar meu acesso</b>. O valor informado já está em uso — <b>Aprovar</b> só confirma administrativamente; <b>Corrigir</b> substitui pelo valor correto. Nenhuma ação bloqueia o usuário, altera e-mail/senha ou desativa a conta.</p>' +
      '<div class="modFilters rvFiltros" role="group" aria-label="Filtro de status">' + FILTROS.map(function (f) {
        return '<button type="button" class="' + (st.filtro === f[0] ? 'modBtn' : 'modBtnGhost') + '" data-rv-filtro="' + f[0] + '"' + (st.filtro === f[0] ? ' aria-pressed="true"' : ' aria-pressed="false"') + '>' + esc(f[1]) + '</button>';
      }).join('') + '</div>' +
      (st.msg ? '<div class="modSuccessState" role="status">' + esc(st.msg) + '</div>' : '') +
      '<div class="rvLista">' + listHtml() + '</div>';
    st.panel.querySelectorAll('[data-rv-filtro]').forEach(function (b) {
      b.addEventListener('click', function () { st.filtro = b.getAttribute('data-rv-filtro'); st.msg = null; load(); });
    });
    st.panel.querySelectorAll('[data-rv-acao="detalhe"]').forEach(function (b) {
      b.addEventListener('click', function () { abrirModal({ tipo: 'detalhe', idx: Number(b.getAttribute('data-rv-idx')) }); });
    });
    var rec = st.panel.querySelector('[data-rv-acao="recarregar"]');
    if (rec) rec.addEventListener('click', load);
  }

  // ---------- modal (mesma moldura do Painel Master: #nxModalRoot / maud*) ----------
  function fecharModal() {
    st.modal = null; st.busy = false;
    var root = document.getElementById('nxModalRoot');
    if (root) { root.innerHTML = ''; root.setAttribute('aria-hidden', 'true'); }
    document.body.classList.remove('maudModalOpen');
  }
  function abrirModal(m) { st.modal = m; pintarModal(); }
  function pintarModal(erro) {
    var root = document.getElementById('nxModalRoot');
    var m = st.modal;
    if (!root || !m) return;
    var r = st.rows[m.idx];
    if (!r) { fecharModal(); return; }
    var titulo = '', corpo = '';
    var campo = CAMPO_LABEL[r.campo] || r.campo;
    if (m.tipo === 'detalhe') {
      titulo = 'Detalhes da revisão cadastral';
      corpo = '<dl class="rvFicha">' +
        '<dt>Usuário</dt><dd>' + esc(r.usuario_nome) + '</dd><dt>Campo</dt><dd>' + esc(campo) + '</dd>' +
        '<dt>Valor anterior</dt><dd>' + esc(valorTxt(r.valor_anterior)) + '</dd><dt>Valor informado</dt><dd>' + esc(valorTxt(r.valor_novo)) + '</dd>' +
        '<dt>Data</dt><dd>' + esc(fmtData(r.criado_em)) + '</dd><dt>Status</dt><dd>' + esc(STATUS_LABEL[r.status] || r.status) + '</dd>' +
        (r.revisado_em ? '<dt>Revisado em</dt><dd>' + esc(fmtData(r.revisado_em)) + '</dd>' : '') + '</dl>' +
        (r.status === 'PENDENTE'
          ? '<div class="maDetailActions"><button type="button" class="modBtn" data-rv-m="aprovar">Aprovar</button><button type="button" class="modBtnGhost" data-rv-m="corrigir">Corrigir</button></div>'
          : '');
    } else if (m.tipo === 'aprovar') {
      titulo = 'Aprovar revisão cadastral';
      corpo = '<p>Aprovar a alteração de <b>' + esc(campo) + '</b> para <b>' + esc(valorTxt(r.valor_novo)) + '</b> — usuário <b>' + esc(r.usuario_nome) + '</b>?</p>' +
        '<p class="modSubtitle">O valor já está em uso; esta ação só confirma administrativamente.</p>' +
        '<div class="maDetailActions"><button type="button" class="modBtnGhost" data-rv-m="voltar">Voltar</button><button type="button" class="modBtn" data-rv-m="confirmar-aprovar"' + (st.busy ? ' disabled' : '') + '>' + (st.busy ? 'Aprovando…' : 'Aprovar') + '</button></div>';
    } else if (m.tipo === 'corrigir') {
      titulo = 'Corrigir revisão cadastral';
      var campoHtml;
      if (r.campo === 'LOJA') {
        campoHtml = '<p class="maWarnNote">Esta alteração modifica a loja cadastrada e poderá alterar o escopo de informações visualizadas pelo usuário.</p>' +
          '<div class="modField"><label for="rvValorCorreto">Loja correta</label><select id="rvValorCorreto"><option value="">Selecione…</option>' +
          LOJAS.map(function (l) { return '<option value="' + esc(l) + '">' + esc(l) + '</option>'; }).join('') + '</select></div>';
      } else {
        campoHtml = '<div class="modField"><label for="rvValorCorreto">' + (r.campo === 'LOGIN_NBS' ? 'Login NBS correto' : 'Valor correto') + '</label>' +
          '<input id="rvValorCorreto" type="text" autocomplete="off" placeholder="' + (r.campo === 'LOGIN_NBS' ? 'Login NBS' : 'Valor correto') + '"></div>';
      }
      corpo = '<p>Usuário <b>' + esc(r.usuario_nome) + '</b> — campo <b>' + esc(campo) + '</b><br>Valor informado: <b>' + esc(valorTxt(r.valor_novo)) + '</b></p>' + campoHtml +
        '<div class="maDetailActions"><button type="button" class="modBtnGhost" data-rv-m="voltar">Voltar</button><button type="button" class="modBtn" data-rv-m="confirmar-corrigir"' + (st.busy ? ' disabled' : '') + '>' + (st.busy ? 'Corrigindo…' : 'Corrigir') + '</button></div>';
    }
    root.setAttribute('aria-hidden', 'false');
    document.body.classList.add('maudModalOpen');
    root.innerHTML = '<div class="maudModalBackdrop" id="rvModalBackdrop"><div class="maudModalDialog" role="dialog" aria-modal="true" aria-labelledby="rvModalTitle" tabindex="-1" id="rvModalDialog">' +
      '<div class="maDetailHead"><h2 id="rvModalTitle">' + esc(titulo) + '</h2><button type="button" class="modBtnGhost" id="rvModalClose" aria-label="Fechar">×</button></div>' +
      '<div class="maudModalBody">' + (homolog() && m.tipo !== 'detalhe' ? '<p class="note gbWarn">🧪 MODO HOMOLOGAÇÃO — nada será gravado.</p>' : '') + corpo +
      '<p class="modErrorText" id="rvModalErro" role="alert"' + (erro ? '' : ' hidden') + '>' + esc(erro || '') + '</p></div></div></div>';
    document.getElementById('rvModalClose').addEventListener('click', fecharModal);
    document.getElementById('rvModalBackdrop').addEventListener('click', function (e) { if (e.target.id === 'rvModalBackdrop') fecharModal(); });
    root.querySelectorAll('[data-rv-m]').forEach(function (b) {
      b.addEventListener('click', function () { acaoModal(b.getAttribute('data-rv-m')); });
    });
    var dlg = document.getElementById('rvModalDialog'); if (dlg) dlg.focus();
  }
  function concluir(texto) {
    fecharModal();
    st.msg = texto;
    load();
  }
  function acaoModal(a) {
    var m = st.modal; if (!m || st.busy) return;
    var r = st.rows[m.idx]; if (!r) return;
    if (a === 'aprovar' || a === 'corrigir') { abrirModal({ tipo: a, idx: m.idx }); return; }
    if (a === 'voltar') { abrirModal({ tipo: 'detalhe', idx: m.idx }); return; }
    if (a === 'confirmar-aprovar') {
      st.busy = true; pintarModal();
      provider().aprovarRevisao(r.revisao_id).then(function () { concluir('Revisão aprovada.'); }, function (err) { st.busy = false; pintarModal(errorMsg(err)); });
      return;
    }
    if (a === 'confirmar-corrigir') {
      var el = document.getElementById('rvValorCorreto');
      var valor = (el && el.value || '').trim();
      if (!valor) { pintarModal(MENSAGENS.VALOR_OBRIGATORIO); return; }
      st.busy = true; pintarModal();
      provider().corrigirRevisao(r.revisao_id, valor, 'Corrigido via Painel Master (valor informado: ' + valorTxt(r.valor_novo) + ').').then(
        function () { concluir('Revisão corrigida.'); },
        function (err) { st.busy = false; pintarModal(errorMsg(err)); var e2 = document.getElementById('rvValorCorreto'); if (e2) e2.value = valor; });
    }
  }

  window.NX_MASTER_REVISOES_SECTION = {
    // Chamado pelo shell ao entrar na seção: monta no painel e carrega.
    enter: function (panel) {
      st.panel = panel; st.msg = null; st.modal = null; st.busy = false;
      if (panel) panel.setAttribute('data-revisoes', '1');
      return load();
    },
    // Chamado pelo shell em cada renderPanel(): repinta o estado atual.
    render: function (panel) {
      st.panel = panel;
      if (panel) panel.setAttribute('data-revisoes', '1');
      paint();
    },
    // Saída da seção: fecha o modal desta seção, se aberto.
    leave: function () { if (st.modal) fecharModal(); if (st.panel) st.panel.removeAttribute('data-revisoes'); st.panel = null; },
    LOJAS: LOJAS,
    _state: function () { return st; }
  };
})();
