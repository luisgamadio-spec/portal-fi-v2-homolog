/* PORTAL-NEXT V2 -- Painel Master / Revisões Cadastrais: transporte REAL
   (paridade com o v1, auditoria de 07/10/2026).

   Divergências de Loja/Login NBS informadas pelo próprio usuário em "Ativar
   meu acesso" (já aplicadas no cadastro na conclusão da ativação). O Master
   só revisa depois: Aprovar (confirma) ou Corrigir (substitui pelo valor
   certo). Contrato real, lido com pg_get_functiondef em 07/10/2026 -- as
   mesmas 3 RPCs que o v1 chama (portal-app.js, Fase 4.3), nada novo no banco:
     master_list_revisoes_cadastrais(p_status)          -> { rows[], total_pendentes }
     master_aprovar_revisao_cadastral(p_revisao_id)     -> { ok, codigo? }
     master_corrigir_revisao_cadastral(p_revisao_id, p_valor_correto, p_observacao) -> { ok, codigo?, valor_aplicado? }
   Todas exigem MASTER no servidor (42501 caso contrário).

   Mesmo desenho dos providers irmãos (master-pendencias-provider.js): callRpc
   próprio, erro de transporte classificado aqui, falha de negócio (ok:false)
   repassada com o `codigo` real para a tela escolher a mensagem. Trava de
   ambiente: fora de AUTHORIZED_PRODUCTION, Aprovar/Corrigir são recusados
   antes da rede (HOMOLOG_BLOCKED); a listagem (leitura) continua liberada. */
(function () {
  'use strict';

  var DEFAULT_TIMEOUT_MS = 15000;
  var WRITE_NAMES = { master_aprovar_revisao_cadastral: true, master_corrigir_revisao_cadastral: true };

  function isProductionEnvironment() {
    return !!(window.NX_ENVIRONMENT && window.NX_ENVIRONMENT.name === 'AUTHORIZED_PRODUCTION');
  }
  function classifyError(code, httpStatus) {
    if (code === '42501') return 'AUTH_DENIED';
    if (httpStatus === 401 || httpStatus === 403) return 'SESSION_EXPIRED';
    return 'RPC_ERROR';
  }

  function callRpc(fnName, params, signal) {
    if (WRITE_NAMES[fnName] && !isProductionEnvironment()) {
      return Promise.reject({ state: 'HOMOLOG_BLOCKED', codigo: 'MODO_HOMOLOGACAO', message: 'MODO HOMOLOGAÇÃO — nenhuma alteração é gravada neste ambiente.' });
    }
    var cfg = window.NX_INTELLIGENCE_CONFIG || {};
    if (!cfg.supabaseUrl || !cfg.supabasePublishableKey) {
      return Promise.reject({ state: 'RPC_ERROR', message: 'Configuração real ausente neste ambiente.' });
    }
    if (!window.NX_AUTH || typeof window.NX_AUTH.getAccessToken !== 'function') {
      return Promise.reject({ state: 'SESSION_EXPIRED', message: 'Sessão indisponível.' });
    }
    return window.NX_AUTH.getAccessToken().then(function (token) {
      if (!token) return Promise.reject({ state: 'SESSION_EXPIRED', message: 'Sessão expirada.' });
      var tc = (!signal && typeof AbortController === 'function') ? new AbortController() : null;
      var timer = tc ? setTimeout(function () { tc.abort(); }, DEFAULT_TIMEOUT_MS) : null;
      return fetch(cfg.supabaseUrl + '/rest/v1/rpc/' + fnName, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': cfg.supabasePublishableKey, 'Authorization': 'Bearer ' + token },
        body: JSON.stringify(params || {}),
        signal: signal || (tc && tc.signal)
      }).then(function (resp) {
        if (timer) clearTimeout(timer);
        return resp.json().catch(function () { return null; }).then(function (body) {
          if (!resp.ok) return Promise.reject({ state: classifyError(body && body.code, resp.status), message: (body && body.message) || 'Erro ao processar solicitação.' });
          return body;
        });
      }, function (err) {
        if (timer) clearTimeout(timer);
        if (err && err.name === 'AbortError') {
          if (signal && signal.aborted) return Promise.reject({ state: 'ABORTED', message: 'Requisição cancelada.' });
          return Promise.reject({ state: 'TIMEOUT', message: 'Tempo de resposta excedido.' });
        }
        return Promise.reject({ state: 'NETWORK_ERROR', message: 'Falha de rede.' });
      });
    });
  }

  function rejectIfNotOk(data) {
    if (!data || typeof data !== 'object' || typeof data.ok !== 'boolean') {
      return Promise.reject({ state: 'MALFORMED_RESPONSE', message: 'Resposta inesperada do servidor.' });
    }
    if (data.ok !== true) return Promise.reject({ state: 'RPC_ERROR', codigo: data.codigo, data: data });
    return data;
  }

  function listRevisoes(status, params) {
    params = params || {};
    return callRpc('master_list_revisoes_cadastrais', { p_status: status || 'PENDENTE' }, params.signal).then(function (data) {
      if (!data || typeof data !== 'object' || !Array.isArray(data.rows)) {
        return Promise.reject({ state: 'MALFORMED_RESPONSE', message: 'Resposta inesperada do servidor.' });
      }
      return { rows: data.rows, totalPendentes: Number(data.total_pendentes) || 0 };
    });
  }
  function aprovarRevisao(revisaoId, params) {
    params = params || {};
    return callRpc('master_aprovar_revisao_cadastral', { p_revisao_id: revisaoId }, params.signal).then(rejectIfNotOk);
  }
  function corrigirRevisao(revisaoId, valorCorreto, observacao, params) {
    params = params || {};
    return callRpc('master_corrigir_revisao_cadastral', {
      p_revisao_id: revisaoId, p_valor_correto: valorCorreto, p_observacao: observacao || null
    }, params.signal).then(rejectIfNotOk);
  }

  window.NX_MASTER_REVISOES_PROVIDER = {
    isHomologationMode: function () { return !isProductionEnvironment(); },
    listRevisoes: listRevisoes,
    aprovarRevisao: aprovarRevisao,
    corrigirRevisao: corrigirRevisao
  };
})();
