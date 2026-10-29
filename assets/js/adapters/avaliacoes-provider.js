/* PORTAL-NEXT V2 — Avaliações de Seminovos: provider (Fase 1 + vistoria da Fase 2).
   Transporte fino, mesmo padrão dos outros providers reais: chama as RPCs
   aval_* (SECURITY DEFINER; perfil, loja e módulo 'avaliacoes' conferidos no
   servidor a cada chamada) e a Edge Function avaliacao-consulta-placa (a chave
   do fornecedor só existe lá). Nenhuma regra de negócio aqui.
   Fotos da vistoria: Edge Function avaliacao-fotos (bucket privado; só ela lê e grava).
   Falha de rede vem marcada com rede:true (a tela guarda o rascunho e reenvia depois). */
(function () {
  'use strict';

  function classifyError(code, httpStatus) {
    if (code === '42501' || httpStatus === 403) return 'PERMISSION_DENIED';
    if (httpStatus === 401) return 'SESSION_EXPIRED';
    if (code === '22023' || code === 'P0002' || httpStatus === 400 || httpStatus === 404) return 'VALIDATION';
    if (code === '54000' || httpStatus === 429) return 'LIMIT';
    return 'BACKEND_ERROR';
  }

  function request(path, body, tipoBinario) {
    var cfg = window.NX_INTELLIGENCE_CONFIG || {};
    if (!cfg.supabaseUrl || !cfg.supabasePublishableKey) {
      return Promise.reject({ state: 'BACKEND_ERROR', message: 'Configuração real ausente neste ambiente.' });
    }
    if (!window.NX_AUTH || typeof window.NX_AUTH.getAccessToken !== 'function') {
      return Promise.reject({ state: 'SESSION_EXPIRED', message: 'Sessão indisponível.' });
    }
    return window.NX_AUTH.getAccessToken().then(function (token) {
      if (!token) return Promise.reject({ state: 'SESSION_EXPIRED', message: 'Sessão expirada.' });
      return fetch(cfg.supabaseUrl + path, {
        method: 'POST',
        headers: { 'Content-Type': tipoBinario || 'application/json', 'apikey': cfg.supabasePublishableKey, 'Authorization': 'Bearer ' + token },
        body: tipoBinario ? body : JSON.stringify(body || {})
      }).then(function (resp) {
        return resp.json().catch(function () { return null; }).then(function (b) {
          if (!resp.ok) {
            var code = b && b.code;
            var state = classifyError(code, resp.status);
            // só mensagens de validação/limite (escritas por nós no servidor) chegam à tela
            var msg = (state === 'VALIDATION' || state === 'LIMIT' || state === 'PERMISSION_DENIED') && b && (b.message || b.erro)
              ? (b.message || b.erro) : 'Não foi possível concluir agora. Tente novamente.';
            return Promise.reject({ state: state, message: msg });
          }
          return b;
        });
      }, function () {
        return Promise.reject({ state: 'BACKEND_ERROR', rede: true, message: 'Sem conexão. Confira o sinal e tente de novo.' });
      });
    });
  }

  function rpc(name, body) { return request('/rest/v1/rpc/' + name, body); }

  window.NX_AVALIACOES_PROVIDER = {
    contexto: function () { return rpc('aval_contexto', {}); },
    listar: function (status) { return rpc('aval_listar', { p_status: status || null, p_limite: 60 }); },
    obter: function (id) { return rpc('aval_obter', { p_id: id }); },
    salvarIdentificacao: function (id, dados) { return rpc('aval_salvar_identificacao', { p_id: id || null, p_dados: dados }); },
    descartar: function (id, motivo) { return rpc('aval_descartar', { p_id: id, p_motivo: motivo || '' }); },
    referencias: function (id, termo) { return rpc('aval_referencias', { p_id: id, p_termo: termo || null }); },
    consultarPlaca: function (placa, chassi) {
      return request('/functions/v1/avaliacao-consulta-placa', { placa: placa || null, chassi: chassi || null });
    },
    regras: function () { return rpc('aval_regras_listar', {}); },
    salvarRegra: function (parametros, observacao) { return rpc('aval_master_salvar_regra', { p_parametros: parametros, p_observacao: observacao || '' }); },
    previa: function (venda, preparacao, reparos, parametros) {
      return rpc('aval_previa_calculo', { p_venda: venda, p_preparacao: preparacao, p_reparos: reparos || 0, p_parametros: parametros || null });
    },
    // vistoria (Fase 2)
    vistoria: function (id) { return rpc('aval_vistoria_obter', { p_id: id }); },
    salvarVistoria: function (id, estado) { return rpc('aval_vistoria_salvar', { p_id: id, p_estado: estado }); },
    concluirVistoria: function (id) { return rpc('aval_vistoria_concluir', { p_id: id }); },
    removerFoto: function (fotoId) { return rpc('aval_foto_remover', { p_foto: fotoId }); },
    enviarFoto: function (avaliacaoId, avariaId, fotoId, blob) {
      return request('/functions/v1/avaliacao-fotos?acao=enviar&avaliacao_id=' + encodeURIComponent(avaliacaoId) +
        '&foto_id=' + encodeURIComponent(fotoId) + (avariaId ? '&avaria_id=' + encodeURIComponent(avariaId) : ''), blob, 'image/jpeg');
    },
    verFotos: function (avaliacaoId) {
      return request('/functions/v1/avaliacao-fotos?acao=ver&avaliacao_id=' + encodeURIComponent(avaliacaoId), {});
    },
    reparos: function () { return rpc('aval_reparos_listar', {}); },
    salvarReparos: function (itens, observacao) { return rpc('aval_master_salvar_reparos', { p_itens: itens, p_observacao: observacao || '' }); }
  };
})();
