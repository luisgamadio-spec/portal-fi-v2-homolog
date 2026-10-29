/* PORTAL-NEXT V2 — Avaliações de Seminovos (Fase 1, 27/10/2026; vistoria da Fase 2, 28/10/2026).
   Uso principal no celular, no pátio: uma coluna, botões grandes.
   Fase 1: identificação (placa/chassi -> versões -> ano, km, cor, carroceria),
   referências (FIPE + vendas reais do grupo) e, só para o Master, as regras de
   margem em versões com prévia do cálculo. Fase 2: vistoria com o carro 3D
   (avaliacoes-vistoria.mjs), avarias por peça, fotos e checklist, com rascunho no
   celular para funcionar sem sinal; tabela de reparos em versões (Master).
   Resultado com os 4 valores + aprovação (Fase 3) ainda não existe nesta tela.

   Zero regra de negócio aqui: acesso, loja, validações e o cálculo ficam no
   servidor (RPCs aval_*). Acesso ao módulo: PERMISSION_MATRIX 'avaliacoes'. */
(function () {
  'use strict';

  var P = function () { return window.NX_AVALIACOES_PROVIDER; };

  var CARROCERIAS = [
    { v: 'HATCH', label: 'Hatch' }, { v: 'SEDAN', label: 'Sedan' },
    { v: 'SUV', label: 'SUV' }, { v: 'PICKUP', label: 'Pickup' }
  ];
  var STATUS_LABEL = {
    RASCUNHO: 'Rascunho', ENVIADA: 'Enviada', DEVOLVIDA: 'Devolvida', APROVADA: 'Aprovada',
    REPROVADA: 'Reprovada', COMPRADA: 'Comprada', DESCARTADA: 'Descartada', EXPIRADA: 'Expirada'
  };
  var REGRA_CAMPOS = [
    { k: 'impostos_pct', label: 'Impostos', suf: '%' },
    { k: 'margem_loja_pct', label: 'Margem Loja', suf: '%' },
    { k: 'margem_loja_min', label: 'Margem Loja mínima', suf: 'R$' },
    { k: 'preparacao_padrao', label: 'Preparação padrão', suf: 'R$' },
    { k: 'margem_repasse_pct', label: 'Margem Repasse', suf: '%' },
    { k: 'margem_repasse_min', label: 'Margem Repasse mínima', suf: 'R$' },
    { k: 'desconto_restricao_pct', label: 'Desconto Repasse com restrição', suf: '%' },
    { k: 'desconto_reprovado_pct', label: 'Desconto Repasse reprovado', suf: '%' }
  ];

  var outletRef = null;
  var S = null;

  function novoEstado() {
    return {
      view: 'lista', carregando: true, erro: null, msg: null, ocupado: false,
      ctx: null, lista: [], filtro: '',
      nova: null, detalhe: null, regras: null, vis: null
    };
  }

  // ---------------------------------------------------------------- utilidades
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function brl(v) {
    if (v == null || v === '' || isNaN(Number(v))) return '—';
    return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  }
  function km(v) { return v == null ? '—' : Number(v).toLocaleString('pt-BR') + ' km'; }
  function data(v) {
    if (!v) return '—';
    var d = String(v).length === 10 ? new Date(v + 'T12:00:00') : new Date(v);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  }
  function placaFmt(p) { return p ? String(p).replace(/^([A-Z]{3})([0-9A-Z]{4})$/, '$1-$2') : ''; }
  function so(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function sugereCarroceria(modelo) {
    var m = String(modelo || '').toUpperCase();
    if (/L200|TRITON|HILUX|RANGER|S10|TORO|MAVERICK|AMAROK|FRONTIER|STRADA|SAVEIRO|MONTANA|RAM /.test(m)) return 'PICKUP';
    if (/ECLIPSE|OUTLANDER|ASX|PAJERO|COMPASS|CROSS|HR-V|KICKS|TUCSON|CRETA|RENEGADE|TIGUAN|SANTA FE|RAV4|SW4|TRACKER|NIVUS|PULSE|FASTBACK|COMMANDER|TAOS|DUSTER|Q3|X1|GLA/.test(m)) return 'SUV';
    if (/COROLLA|CIVIC|VIRTUS|CRUZE|SENTRA|ONIX PLUS|HB20S|CITY|JETTA|VERSA|CRONOS|YARIS SEDAN|LANCER/.test(m)) return 'SEDAN';
    return 'HATCH';
  }
  function msgHtml() {
    if (!S.msg) return '';
    return '<div class="avMsg ' + (S.msg.erro ? 'err' : 'ok') + '" role="status" aria-live="polite">' + esc(S.msg.texto) + '</div>';
  }
  function falha(e) {
    if (e && e.state === 'SESSION_EXPIRED' && window.NX_AUTH_CORE && window.NX_AUTH_CORE.reportSessionExpired) {
      window.NX_AUTH_CORE.reportSessionExpired();
      return;
    }
    S.ocupado = false;
    S.msg = { erro: true, texto: (e && e.message) || 'Não foi possível concluir agora. Tente novamente.' };
    render();
  }
  function ir(view) { S.view = view; S.msg = null; render(); window.scrollTo && window.scrollTo(0, 0); }
  function val(id) { var el = document.getElementById(id); return el ? el.value : ''; }

  // ---------------------------------------------------------------- carregamentos
  function carregarLista() {
    S.carregando = true; render();
    return P().listar(S.filtro || null).then(function (rows) {
      S.lista = Array.isArray(rows) ? rows : [];
      S.carregando = false; render();
    }).catch(function (e) { S.carregando = false; falha(e); });
  }

  function abrirDetalhe(id) {
    // voltando da vistoria (talvez sem sinal), mantém a avaliação já carregada enquanto atualiza
    var mesma = S.detalhe && S.detalhe.av && S.detalhe.av.id === id ? S.detalhe : null;
    S.view = 'detalhe'; S.detalhe = { av: mesma ? mesma.av : null, refs: mesma ? mesma.refs : null, vis: mesma ? mesma.vis : null, carregandoRefs: !mesma }; S.msg = null; render();
    return P().obter(id).then(function (av) {
      S.detalhe.av = av; render();
      P().vistoria(id).then(function (v) { if (S.detalhe && S.detalhe.av && S.detalhe.av.id === id) { S.detalhe.vis = v; if (S.view === 'detalhe') render(); } }).catch(noop);
      return P().referencias(id, null);
    }).then(function (refs) {
      S.detalhe.refs = refs; S.detalhe.carregandoRefs = false; render();
    }).catch(function (e) { if (S.detalhe) S.detalhe.carregandoRefs = false; falha(e); });
  }

  function buscarReferencias() {
    var termo = val('avTermo').trim();
    S.detalhe.carregandoRefs = true; S.msg = null; render();
    P().referencias(S.detalhe.av.id, termo).then(function (refs) {
      S.detalhe.refs = refs; S.detalhe.carregandoRefs = false; render();
    }).catch(function (e) { S.detalhe.carregandoRefs = false; falha(e); });
  }

  function abrirRegras() {
    S.view = 'regras'; S.regras = { lista: null, form: null, previa: null }; S.msg = null; render();
    P().regras().then(function (lista) {
      S.regras.lista = lista || [];
      var vig = (lista && lista[0] && lista[0].parametros) || {};
      S.regras.form = {};
      REGRA_CAMPOS.forEach(function (c) { S.regras.form[c.k] = vig[c.k] == null ? '' : String(vig[c.k]); });
      render();
      return P().reparos().then(function (t) { if (S.regras) { S.regras.reparos = t || []; render(); } });
    }).catch(falha);
  }

  // ---------------------------------------------------------------- nova avaliação
  function iniciarNova(av) {
    S.view = 'nova'; S.msg = null;
    S.nova = {
      etapa: av ? 'confirmar' : 'busca', modo: 'placa', valor: '', consulta: null, versaoIdx: null, manual: !av || !av.consulta_id,
      editId: av ? av.id : null,
      form: av ? {
        placa: av.placa || '', chassi: av.chassi || '', marca: av.marca || '', modelo: av.modelo || '', versao: av.versao || '',
        ano_fabricacao: av.ano_fabricacao || '', ano_modelo: av.ano_modelo || '', km: av.km != null ? String(av.km) : '',
        cor: av.cor || '', carroceria: av.carroceria || '', observacao: av.observacao || '', loja: av.loja || '',
        combustivel: av.combustivel || ''
      } : null
    };
    if (av && av.consulta_id && Array.isArray(av.versoes_consulta)) {
      S.nova.manual = false;
      S.nova.consulta = { consulta_id: av.consulta_id, versoes: av.versoes_consulta, simulado: av.fipe_simulado,
                          restricoes: { gravame: av.restricao_gravame, leilao: av.restricao_leilao, sinistro: av.restricao_sinistro } };
      S.nova.versaoIdx = av.versoes_consulta.findIndex(function (v) { return v.fipe_codigo === av.fipe_codigo; });
    }
    render();
  }

  function consultar() {
    var n = S.nova;
    n.valor = so(val('avBusca'));
    if (n.modo === 'placa' && !/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(n.valor)) {
      S.msg = { erro: true, texto: 'Placa inválida. Ex.: ABC1D23 ou ABC1234.' }; render(); return;
    }
    if (n.modo === 'chassi' && !/^[A-HJ-NPR-Z0-9]{17}$/.test(n.valor)) {
      S.msg = { erro: true, texto: 'Chassi inválido: 17 caracteres, sem I, O ou Q.' }; render(); return;
    }
    S.ocupado = true; S.msg = null; render();
    P().consultarPlaca(n.modo === 'placa' ? n.valor : null, n.modo === 'chassi' ? n.valor : null).then(function (r) {
      S.ocupado = false;
      n.consulta = r; n.versaoIdx = r.versoes && r.versoes.length === 1 ? 0 : null; n.manual = false;
      n.etapa = 'versoes'; render();
    }).catch(function (e) {
      if (e && (e.state === 'BACKEND_ERROR' || e.state === 'VALIDATION') && /manualmente/i.test(e.message || '')) {
        S.ocupado = false; S.msg = { erro: true, texto: e.message }; n.consultaFalhou = true; render(); return;
      }
      falha(e);
    });
  }

  function irParaConfirmar(manual) {
    var n = S.nova;
    n.manual = !!manual;
    var v = !manual && n.consulta && n.versaoIdx != null ? n.consulta.versoes[n.versaoIdx] : null;
    if (!manual && !v) { S.msg = { erro: true, texto: 'Escolha a versão do carro.' }; render(); return; }
    var c = n.consulta || {};
    n.form = {
      placa: n.modo === 'placa' ? n.valor : '', chassi: n.modo === 'chassi' ? n.valor : ((v && v.chassi) || ''),
      marca: v ? v.marca : '', modelo: v ? v.modelo : '', versao: v ? v.versao : '',
      ano_fabricacao: c.ano_fabricacao || (v ? v.ano_modelo : ''), ano_modelo: v ? v.ano_modelo : '',
      km: '', cor: c.cor || '', carroceria: sugereCarroceria(v ? v.modelo : ''), observacao: '', loja: '',
      combustivel: v ? v.combustivel : ''
    };
    n.etapa = 'confirmar'; S.msg = null; render();
  }

  function lerForm() {
    var f = S.nova.form;
    ['placa', 'chassi', 'marca', 'modelo', 'versao', 'ano_fabricacao', 'ano_modelo', 'km', 'cor', 'observacao', 'loja'].forEach(function (k) {
      var el = document.getElementById('avF_' + k);
      if (el) f[k] = el.value;
    });
    return f;
  }

  function salvar() {
    var n = S.nova, f = lerForm();
    var v = !n.manual && n.consulta && n.versaoIdx != null ? n.consulta.versoes[n.versaoIdx] : null;
    var dados = {
      placa: so(f.placa) || null, chassi: so(f.chassi) || null, km: f.km, cor: f.cor,
      ano_fabricacao: f.ano_fabricacao, ano_modelo: f.ano_modelo, carroceria: f.carroceria,
      observacao: f.observacao, loja: f.loja || null
    };
    if (v) {
      dados.consulta_id = n.consulta.consulta_id; dados.fipe_codigo = v.fipe_codigo; dados.ano_modelo_fipe = String(v.ano_modelo);
    } else {
      dados.marca = f.marca; dados.modelo = f.modelo; dados.versao = f.versao; dados.combustivel = f.combustivel;
    }
    S.ocupado = true; S.msg = null; render();
    P().salvarIdentificacao(n.editId, dados).then(function (r) {
      S.ocupado = false;
      abrirDetalhe(r.id).then(function () {
        S.msg = { erro: false, texto: 'Avaliação AV-' + r.codigo + ' salva como rascunho.' }; render();
      });
    }).catch(falha);
  }

  function descartar() {
    var motivo = window.prompt('Descartar esta avaliação? Escreva o motivo (opcional):', '');
    if (motivo === null) return;
    S.ocupado = true; render();
    P().descartar(S.detalhe.av.id, motivo).then(function () {
      S.ocupado = false; S.view = 'lista'; S.msg = { erro: false, texto: 'Avaliação descartada.' };
      carregarLista();
    }).catch(falha);
  }

  // ---------------------------------------------------------------- regras (Master)
  function lerRegraForm() {
    var p = {};
    REGRA_CAMPOS.forEach(function (c) {
      var raw = val('avR_' + c.k).replace(/\./g, '').replace(',', '.').trim();
      S.regras.form[c.k] = val('avR_' + c.k);
      p[c.k] = raw === '' ? null : raw;
    });
    return p;
  }
  function previa() {
    var p = lerRegraForm();
    var venda = Number(val('avR_venda').replace(/\./g, '').replace(',', '.'));
    var prep = val('avR_prep').trim() === '' ? null : Number(val('avR_prep').replace(/\./g, '').replace(',', '.'));
    var rep = Number(val('avR_reparos').replace(/\./g, '').replace(',', '.')) || 0;
    S.regras.vendaPrevia = val('avR_venda'); S.regras.prepPrevia = val('avR_prep'); S.regras.reparosPrevia = val('avR_reparos');
    S.ocupado = true; render();
    P().previa(venda, prep, rep, p).then(function (r) { S.ocupado = false; S.regras.previa = r; render(); }).catch(falha);
  }
  function salvarRegra() {
    var p = lerRegraForm();
    var obs = val('avR_obs');
    if (!window.confirm('Criar uma nova versão das regras de margem? Avaliações já calculadas guardam a versão que usaram.')) return;
    S.ocupado = true; render();
    P().salvarRegra(p, obs).then(function (r) {
      S.ocupado = false;
      abrirRegras();
      S.msg = { erro: false, texto: 'Versão ' + r.versao + ' das regras criada.' };
    }).catch(falha);
  }

  // ---------------------------------------------------------------- telas
  function cabecalho(titulo, sub, voltar) {
    return '<div class="modPageHeader avHeader"><div class="modHeaderMain">' +
      (voltar ? '<button type="button" class="btn btn-tertiary avVoltar" data-acao="' + voltar + '">‹ Voltar</button>' : '') +
      '<h1 class="modTitle">' + titulo + '</h1>' + (sub ? '<p class="modSubtitle">' + sub + '</p>' : '') +
      '</div></div>';
  }

  function telaLista() {
    var ctx = S.ctx || {};
    var filtros = [['', 'Em andamento'], ['RASCUNHO', 'Rascunhos'], ['DESCARTADA', 'Descartadas']];
    var html = cabecalho('Avaliações de Seminovos',
      ctx.escopo === 'GRUPO' ? 'Todas as lojas do grupo.' : 'Loja ' + esc(ctx.loja || '') + '.');
    html += '<div class="avTopo">';
    if (ctx.pode_criar) html += '<button type="button" class="btn btn-primary avBtnGrande" data-acao="nova">+ Nova avaliação</button>';
    if (ctx.pode_regras) html += '<button type="button" class="btn btn-secondary" data-acao="regras">Regras de margem</button>';
    html += '</div>';
    html += '<div class="avChips" role="group" aria-label="Filtrar">' + filtros.map(function (f) {
      return '<button type="button" class="avChip' + (S.filtro === f[0] ? ' active' : '') + '" data-acao="filtro" data-v="' + f[0] + '" aria-pressed="' + (S.filtro === f[0]) + '">' + f[1] + '</button>';
    }).join('') + '</div>';
    html += msgHtml();
    if (S.carregando) return html + '<div class="avVazio">Carregando…</div>';
    if (!S.lista.length) return html + '<div class="avVazio">Nenhuma avaliação aqui ainda.</div>';
    html += '<ul class="avLista">' + S.lista.map(function (a) {
      return '<li><button type="button" class="avItem" data-acao="abrir" data-id="' + esc(a.id) + '">' +
        '<span class="avItemTopo"><b>' + esc(placaFmt(a.placa) || ('Chassi …' + String(a.chassi || '').slice(-6))) + '</b>' +
        '<span class="avStatus avSt' + esc(a.status) + '">' + esc(STATUS_LABEL[a.status] || a.status) + '</span></span>' +
        '<span class="avItemModelo">' + esc([a.marca, a.modelo, a.versao].filter(Boolean).join(' ') || 'Modelo não informado') + '</span>' +
        '<span class="avItemMeta">' + esc([a.ano_fabricacao && a.ano_modelo ? a.ano_fabricacao + '/' + a.ano_modelo : null, a.km != null ? km(a.km) : null,
          ctx.escopo === 'GRUPO' ? a.loja : null, 'AV-' + a.codigo, data(a.criado_em)].filter(Boolean).join(' · ')) + '</span>' +
        '</button></li>';
    }).join('') + '</ul>';
    return html;
  }

  function badgeSimulado(sim) {
    return sim ? '<span class="avBadgeSim" title="Fornecedor de placa simulado: dados fictícios até a contratação">SIMULADO</span>' : '';
  }

  function restricoesHtml(r) {
    if (!r) return '';
    var itens = [['gravame', 'Gravame'], ['leilao', 'Leilão'], ['sinistro', 'Sinistro']];
    return '<div class="avRestricoes">' + itens.map(function (i) {
      var x = r[i[0]];
      var t = x === true ? 'Sim' : (x === false ? 'Não' : '—');
      return '<span class="avRestr' + (x === true ? ' sim' : '') + '">' + i[1] + ': <b>' + t + '</b></span>';
    }).join('') + '</div>';
  }

  function telaNova() {
    var n = S.nova, ctx = S.ctx || {};
    var html = cabecalho(n.editId ? 'Editar identificação' : 'Nova avaliação', null, n.editId ? 'voltarDetalhe' : 'voltarLista');
    var passos = ['Placa', 'Versão', 'Dados'];
    var idx = n.etapa === 'busca' ? 0 : n.etapa === 'versoes' ? 1 : 2;
    html += '<ol class="avPassos">' + passos.map(function (p, i) {
      return '<li class="' + (i === idx ? 'atual' : i < idx ? 'feito' : '') + '">' + p + '</li>';
    }).join('') + '</ol>';
    html += msgHtml();

    if (n.etapa === 'busca') {
      html += '<div class="avCard">' +
        '<div class="avSeg" role="group" aria-label="Buscar por">' +
        '<button type="button" class="avSegBtn' + (n.modo === 'placa' ? ' active' : '') + '" data-acao="modo" data-v="placa">Placa</button>' +
        '<button type="button" class="avSegBtn' + (n.modo === 'chassi' ? ' active' : '') + '" data-acao="modo" data-v="chassi">Chassi</button></div>' +
        '<label class="avLabel" for="avBusca">' + (n.modo === 'placa' ? 'Placa do carro' : 'Chassi (17 caracteres)') + '</label>' +
        '<input id="avBusca" class="avInput avInputGrande" autocomplete="off" autocapitalize="characters" spellcheck="false" ' +
        'maxlength="' + (n.modo === 'placa' ? 8 : 17) + '" placeholder="' + (n.modo === 'placa' ? 'ABC1D23' : '9BR…') + '" value="' + esc(n.valor) + '">' +
        '<button type="button" class="btn btn-primary avBtnGrande" data-acao="consultar"' + (S.ocupado ? ' disabled' : '') + '>' +
        (S.ocupado ? 'Consultando…' : 'Consultar') + '</button>' +
        (n.consultaFalhou && ctx.pode_criar ? '<button type="button" class="btn btn-secondary avBtnGrande" data-acao="manual">Preencher manualmente</button>' : '') +
        '</div>';
      return html;
    }

    if (n.etapa === 'versoes') {
      var c = n.consulta;
      html += '<div class="avCard"><p class="avCardTitulo">Escolha a versão ' + badgeSimulado(c.simulado) + '</p>' +
        '<p class="avNota">' + esc(placaFmt(n.modo === 'placa' ? n.valor : '') || n.valor) +
        (c.cache ? ' · consulta reaproveitada de ' + esc(data(c.consultado_em)) + ' (sem custo)' : '') + '</p>' +
        restricoesHtml(c.restricoes) +
        '<div class="avVersoes">' + c.versoes.map(function (v, i) {
          return '<button type="button" class="avVersao' + (n.versaoIdx === i ? ' active' : '') + '" data-acao="versao" data-i="' + i + '" aria-pressed="' + (n.versaoIdx === i) + '">' +
            '<span class="avVersaoNome">' + esc(v.marca + ' ' + v.modelo) + '</span>' +
            '<span class="avVersaoDet">' + esc(v.versao) + '</span>' +
            '<span class="avVersaoMeta">' + esc(v.ano_modelo + ' · ' + (v.combustivel || '') + ' · FIPE ' + brl(v.fipe_valor)) + '</span>' +
            '</button>';
        }).join('') + '</div>' +
        '<button type="button" class="btn btn-primary avBtnGrande" data-acao="confirmarVersao">Continuar</button>' +
        '<button type="button" class="btn btn-tertiary" data-acao="manual">Nenhuma serve: preencher manualmente</button>' +
        '<button type="button" class="btn btn-tertiary" data-acao="novaBusca">Buscar outra placa</button></div>';
      return html;
    }

    // confirmar
    var f = n.form;
    var v = !n.manual && n.consulta && n.versaoIdx != null ? n.consulta.versoes[n.versaoIdx] : null;
    html += '<div class="avCard">';
    if (v) {
      html += '<p class="avCardTitulo">' + esc(v.marca + ' ' + v.modelo) + ' ' + badgeSimulado(n.consulta.simulado) + '</p>' +
        '<p class="avNota">' + esc(v.versao) + ' · FIPE ' + esc(brl(v.fipe_valor)) + '</p>' + restricoesHtml(n.consulta.restricoes);
    } else {
      html += '<p class="avCardTitulo">Dados do carro (manual)</p>' +
        campo('marca', 'Marca', f.marca) + campo('modelo', 'Modelo', f.modelo, 'Ex.: ECLIPSE CROSS') + campo('versao', 'Versão', f.versao);
    }
    if (!f.placa || n.manual) html += campo('placa', 'Placa', f.placa, 'ABC1D23');
    if (n.manual || !v) html += campo('chassi', 'Chassi (opcional)', f.chassi);
    html += '<div class="avDupla">' + campo('ano_fabricacao', 'Ano fabricação', f.ano_fabricacao, '2022', 'numeric') +
      campo('ano_modelo', 'Ano modelo', f.ano_modelo, '2023', 'numeric', !!v) + '</div>';
    html += campo('km', 'Quilometragem', f.km, 'Ex.: 45000', 'numeric');
    html += campo('cor', 'Cor', f.cor);
    html += '<p class="avLabel">Carroceria</p><div class="avCarrocerias" role="group" aria-label="Carroceria">' + CARROCERIAS.map(function (c) {
      return '<button type="button" class="avCarr' + (f.carroceria === c.v ? ' active' : '') + '" data-acao="carroceria" data-v="' + c.v + '" aria-pressed="' + (f.carroceria === c.v) + '">' + c.label + '</button>';
    }).join('') + '</div>';
    if (ctx.escopo === 'GRUPO' && !n.editId) {
      html += '<label class="avLabel" for="avF_loja">Loja</label><select id="avF_loja" class="avInput"><option value="">Escolha…</option>' +
        (ctx.lojas || []).map(function (l) { return '<option' + (f.loja === l ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join('') + '</select>';
    }
    html += '<label class="avLabel" for="avF_observacao">Observação (opcional)</label><textarea id="avF_observacao" class="avInput" rows="2">' + esc(f.observacao) + '</textarea>';
    html += '<button type="button" class="btn btn-primary avBtnGrande" data-acao="salvar"' + (S.ocupado ? ' disabled' : '') + '>' +
      (S.ocupado ? 'Salvando…' : 'Salvar rascunho') + '</button>';
    if (!n.editId) html += '<button type="button" class="btn btn-tertiary" data-acao="novaBusca">Recomeçar</button>';
    html += '</div>';
    return html;
  }

  function campo(k, label, valor, ph, modo, travado) {
    return '<div class="avCampo"><label class="avLabel" for="avF_' + k + '">' + label + '</label>' +
      '<input id="avF_' + k + '" class="avInput" value="' + esc(valor) + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') +
      (modo ? ' inputmode="' + modo + '"' : '') + (travado ? ' readonly title="Vem da versão escolhida"' : '') + ' autocomplete="off"></div>';
  }

  function telaDetalhe() {
    var d = S.detalhe, a = d.av;
    var html = cabecalho('Avaliação' + (a ? ' AV-' + esc(a.codigo) : ''), null, 'voltarLista') + msgHtml();
    if (!a) return html + '<div class="avVazio">Carregando…</div>';
    var podeEditar = S.ctx.pode_criar && (a.status === 'RASCUNHO' || a.status === 'DEVOLVIDA');
    html += '<div class="avCard">' +
      '<div class="avItemTopo"><b class="avPlaca">' + esc(placaFmt(a.placa) || ('Chassi …' + String(a.chassi || '').slice(-6))) + '</b>' +
      '<span class="avStatus avSt' + esc(a.status) + '">' + esc(STATUS_LABEL[a.status] || a.status) + '</span></div>' +
      '<p class="avCardTitulo">' + esc([a.marca, a.modelo].filter(Boolean).join(' ')) + ' ' + badgeSimulado(a.fipe_simulado) + '</p>' +
      '<p class="avNota">' + esc(a.versao || '') + '</p>' +
      '<dl class="avDados">' +
      dd('Ano', a.ano_fabricacao && a.ano_modelo ? a.ano_fabricacao + '/' + a.ano_modelo : '—') + dd('Km', km(a.km)) +
      dd('Cor', a.cor || '—') + dd('Carroceria', a.carroceria ? (CARROCERIAS.filter(function (c) { return c.v === a.carroceria; })[0] || { label: a.carroceria }).label : '—') +
      dd('Combustível', a.combustivel || '—') + dd('Loja', a.loja) + dd('Avaliador', a.avaliador || '—') + dd('Criada', data(a.criado_em)) +
      '</dl>' +
      restricoesHtml({ gravame: a.restricao_gravame, leilao: a.restricao_leilao, sinistro: a.restricao_sinistro }) +
      (a.observacao ? '<p class="avNota">Obs.: ' + esc(a.observacao) + '</p>' : '') +
      (podeEditar ? '<div class="avAcoes"><button type="button" class="btn btn-secondary" data-acao="editar">Editar identificação</button>' +
        '<button type="button" class="btn btn-tertiary avPerigo" data-acao="descartar">Descartar</button></div>' : '') +
      '</div>';

    html += cardVistoriaHtml();

    // referências
    var r = d.refs;
    html += '<h2 class="avSecao">Referências</h2>';
    html += '<div class="avRefs">';
    html += '<div class="avCard"><p class="kpiLabel">FIPE ' + esc((r && r.fipe && r.fipe.mes_ref) || a.fipe_mes_ref || '') + ' ' + badgeSimulado(a.fipe_simulado) + '</p>' +
      '<p class="avValor">' + brl(a.fipe_valor) + '</p>' +
      '<p class="avNota">' + (a.fipe_codigo ? 'Código ' + esc(a.fipe_codigo) : 'Sem consulta de placa: FIPE não informada.') + '</p></div>';
    html += '</div>';
    if (d.carregandoRefs) {
      html += '<div class="avCard"><p class="avNota">Buscando vendas do grupo…</p></div>';
    } else if (r) {
      var b = r.base || {};
      html += '<p class="avNota avBase">Vendas do grupo (12 meses) parecidas com: <b>' +
        esc([b.familia, b.motor, b.versao, (b.edicao || []).join(' '), b.combustivel, b.tracao].filter(Boolean).join(' · ')) +
        '</b> · ano-modelo ' + esc(b.ano_modelo) + ' (±1)</p>';
      html += '<div class="avRefs">' + grupoHtml('Mesma versão e ano', r.mesma_versao_ano, r.amostra_pequena_abaixo_de) +
        grupoHtml('Versão ou ano próximo', r.versao_ou_ano_proximo, r.amostra_pequena_abaixo_de) + '</div>';
      if (r.ignoradas > 0) {
        html += '<p class="avNota">' + esc(r.ignoradas) + ' venda' + (r.ignoradas > 1 ? 's ignoradas' : ' ignorada') + ' por valor absurdo' +
          (r.ignoradas_milhares ? ' (' + esc(r.ignoradas_milhares) + ' lançada' + (r.ignoradas_milhares > 1 ? 's' : '') + ' em milhares na carga histórica' +
            (r.ignoradas_fora_da_faixa ? '; ' + esc(r.ignoradas_fora_da_faixa) + ' fora da faixa' : '') + ')' :
            (r.ignoradas_fora_da_faixa ? ' (fora da faixa)' : '')) + '.</p>';
      }
    }
    html += '<div class="avCard"><label class="avLabel" for="avTermo">Buscar como (modelo e versão)</label>' +
      '<div class="avBuscaTermo"><input id="avTermo" class="avInput" value="' + esc((r && r.termo) || a.termo_referencia || [a.modelo, a.versao].filter(Boolean).join(' ')) + '" autocapitalize="characters">' +
      '<button type="button" class="btn btn-secondary" data-acao="buscarRefs"' + (d.carregandoRefs ? ' disabled' : '') + '>Buscar</button></div>' +
      '<p class="avNota">' + esc((r && r.observacao) || '') + '</p>';
    if (r && r.vendas && r.vendas.length) {
      html += '<ul class="avVendas">' + r.vendas.map(function (v) {
        var tag = v.ignorada ? '<span class="avTag ign">ignorada</span>' : (v.grupo === 'mesma' ? '<span class="avTag mesma">mesma</span>' : '<span class="avTag">próxima</span>');
        return '<li' + (v.ignorada ? ' class="avIgn"' : '') + '><span class="avVendaQuando">' + tag + esc(data(v.data)) + ' · ' + esc(v.loja) + ' · ' + esc(v.ano || '—') + '</span><b>' + brl(v.valor) + '</b><span class="avVendaModelo">' + esc(v.modelo) + '</span></li>';
      }).join('') + '</ul>';
    } else if (r) {
      html += '<p class="avNota">Nenhuma venda parecida nos últimos 12 meses.</p>';
    }
    html += '</div>';
    html += '<div class="avProximas">Próxima fase: resultado com os 4 valores e aprovação do gerente (Fase 3).</div>';
    return html;
  }
  function grupoHtml(titulo, g, minimo) {
    g = g || {};
    var n = g.quantidade || 0;
    var h = '<div class="avCard"><p class="kpiLabel">' + titulo + '</p>';
    if (!n) return h + '<p class="avValor avValorVazio">—</p><p class="avNota">Nenhuma venda.</p></div>';
    return h + '<p class="avValor">' + brl(g.mediana) + '</p><p class="avNota">mediana de ' + n + ' venda' + (n > 1 ? 's' : '') +
      (g.amostra_pequena ? ' · <b class="avAviso">amostra pequena (menos de ' + esc(minimo || 5) + ')</b>' : '') + '</p>' +
      '<p class="avNota">Metade entre ' + brl(g.p25) + ' e ' + brl(g.p75) + ' · menor ' + brl(g.minimo) + ' · maior ' + brl(g.maximo) + '</p></div>';
  }
  function dd(k, v) { return '<div><dt>' + k + '</dt><dd>' + esc(v) + '</dd></div>'; }

  function telaRegras() {
    var R = S.regras;
    var html = cabecalho('Regras de margem', 'Cada alteração cria uma nova versão. Avaliações calculadas guardam a versão usada.', 'voltarLista') + msgHtml();
    if (!R.lista || !R.form) return html + '<div class="avVazio">Carregando…</div>';
    var vig = R.lista[0];
    html += '<div class="avCard"><p class="avCardTitulo">Fórmula</p>' +
      '<p class="avNota"><b>Loja</b> = venda provável − impostos − maior entre (margem Loja % e margem Loja mínima) − preparação − reparos.<br>' +
      '<b>Repasse</b> = a mesma conta com a margem do Repasse (maior que a da Loja).<br>' +
      '<b>Repasse com restrição</b> e <b>Repasse reprovado</b> = Repasse menos o desconto de cada um.<br>' +
      'Campo em branco = valor ainda não definido; o cálculo mostra "a definir" em vez de inventar um número.</p></div>';
    html += '<div class="avCard"><p class="avCardTitulo">Nova versão' + (vig ? ' (vigente: v' + esc(vig.versao) + ')' : '') + '</p><div class="avRegraGrid">' +
      REGRA_CAMPOS.map(function (c) {
        return '<div class="avCampo"><label class="avLabel" for="avR_' + c.k + '">' + c.label + ' (' + c.suf + ')</label>' +
          '<input id="avR_' + c.k + '" class="avInput" inputmode="decimal" value="' + esc(R.form[c.k]) + '" placeholder="a definir"></div>';
      }).join('') + '</div>' +
      '<label class="avLabel" for="avR_obs">Observação da versão</label><input id="avR_obs" class="avInput" placeholder="Ex.: margens de repasse aprovadas em …">' +
      '<p class="avCardTitulo avPreviaTit">Prévia</p><div class="avRegraGrid">' +
      '<div class="avCampo"><label class="avLabel" for="avR_venda">Venda provável (R$)</label><input id="avR_venda" class="avInput" inputmode="decimal" value="' + esc(R.vendaPrevia || '100000') + '"></div>' +
      '<div class="avCampo"><label class="avLabel" for="avR_prep">Preparação (R$, vazio = padrão)</label><input id="avR_prep" class="avInput" inputmode="decimal" value="' + esc(R.prepPrevia || '') + '"></div>' +
      '<div class="avCampo"><label class="avLabel" for="avR_reparos">Reparos (R$)</label><input id="avR_reparos" class="avInput" inputmode="decimal" value="' + esc(R.reparosPrevia || '0') + '"></div></div>' +
      '<div class="avAcoes"><button type="button" class="btn btn-secondary" data-acao="previa"' + (S.ocupado ? ' disabled' : '') + '>Calcular prévia</button>' +
      '<button type="button" class="btn btn-primary" data-acao="salvarRegra"' + (S.ocupado ? ' disabled' : '') + '>Salvar nova versão</button></div>';
    if (R.previa) {
      var p = R.previa;
      html += '<div class="avQuatro">' +
        [['Loja', p.loja], ['Repasse', p.repasse], ['Repasse com restrição', p.repasse_restricao], ['Repasse reprovado', p.repasse_reprovado]].map(function (x) {
          return '<div class="avQuatroItem"><p class="kpiLabel">' + x[0] + '</p><p class="avValor">' + (x[1] == null ? 'a definir' : brl(x[1])) + '</p></div>';
        }).join('') + '</div>' +
        '<p class="avNota">Impostos ' + brl(p.impostos) + ' · margem Loja ' + brl(p.margem_loja) + ' · margem Repasse ' + brl(p.margem_repasse) +
        ' · preparação ' + brl(p.preparacao) + ' · reparos ' + brl(p.reparos) + '</p>';
    }
    html += '</div>';
    html += '<h2 class="avSecao">Versões</h2><ul class="avVersoesRegra">' + R.lista.map(function (r) {
      var par = r.parametros || {};
      return '<li><b>v' + esc(r.versao) + '</b> · ' + esc(data(r.vigente_desde)) + (r.criado_por ? ' · ' + esc(r.criado_por) : '') +
        '<span class="avNota">' + REGRA_CAMPOS.map(function (c) { return c.label + ': ' + (par[c.k] == null ? 'a definir' : esc(par[c.k]) + (c.suf === '%' ? '%' : '')); }).join(' · ') + '</span>' +
        (r.observacao ? '<span class="avNota">' + esc(r.observacao) + '</span>' : '') + '</li>';
    }).join('') + '</ul>';
    html += tabelaReparosHtml();
    return html;
  }

  // ================================================================ vistoria (Fase 2)
  // Carro 3D (avaliacoes-vistoria.mjs) + avarias por peça, fotos comprimidas no celular, checklist.
  // Rascunho no próprio celular (IndexedDB): sem sinal, tudo continua funcionando e é enviado depois
  // (avarias e checklist pelo estado inteiro, fotos uma a uma; os ids vêm do celular, então reenviar não duplica).
  var GRAVIDADES = [['LEVE', 'Leve'], ['MEDIA', 'Média'], ['GRAVE', 'Grave']];
  var GRAV_LABEL = { LEVE: 'Leve', MEDIA: 'Média', GRAVE: 'Grave' };
  var GRAV_ORDEM = { LEVE: 1, MEDIA: 2, GRAVE: 3 };
  var TIPOS_AVARIA = {
    lataria: ['Risco', 'Amassado', 'Pintura danificada', 'Repintura', 'Ferrugem'],
    'para-choque': ['Risco', 'Amassado', 'Trinca/quebra', 'Pintura danificada', 'Repintura'],
    vidro: ['Risco', 'Trinca/quebra'],
    farol: ['Trinca/quebra', 'Embaçado/infiltração', 'Opaco/amarelado', 'Faltando'],
    grade: ['Risco', 'Trinca/quebra', 'Faltando'],
    roda: ['Risco', 'Empeno', 'Faltando'],
    pneu: ['Desgaste', 'Corte/bolha', 'Remendo', 'Faltando'],
    retrovisor: ['Risco', 'Trinca/quebra', 'Faltando'],
    estrutura: ['Amassado', 'Trinca/solda', 'Repintura']
  };
  var GRUPO_LABEL = { lataria: 'Lataria', 'para-choque': 'Para-choque', vidro: 'Vidro', farol: 'Farol/lanterna', grade: 'Grade',
    roda: 'Roda', pneu: 'Pneu', retrovisor: 'Retrovisor', estrutura: 'Estrutura' };
  var CHECKLIST = [
    ['interior', 'Interior (bancos, forros, carpete)', [['BOM', 'Bom'], ['REGULAR', 'Regular'], ['RUIM', 'Ruim']]],
    ['luzes_painel', 'Luzes de alerta no painel', [['NENHUMA', 'Nenhuma'], ['ACESAS', 'Acesa(s)']]],
    ['ar_condicionado', 'Ar-condicionado', [['GELA', 'Gela'], ['FRACO', 'Fraco'], ['NAO_FUNCIONA', 'Não funciona']]],
    ['chave_reserva', 'Chave reserva', [['TEM', 'Tem'], ['NAO_TEM', 'Não tem']]],
    ['manual', 'Manual do proprietário', [['TEM', 'Tem'], ['NAO_TEM', 'Não tem']]],
    ['revisoes', 'Revisões', [['EM_DIA', 'Em dia na concessionária'], ['PARCIAIS', 'Parciais'], ['SEM_COMPROVACAO', 'Sem comprovação']]]
  ];
  var VISTAS_3D = ['3D', 'Frente', 'Traseira', 'Lat. esq.', 'Lat. dir.', 'Teto'];
  var ITENS_REPARO = ['Porta', 'Para-lama', 'Capô', 'Teto', 'Tampa', 'Lateral traseira / caçamba', 'Caçamba (assoalho)', 'Para-choque',
    'Coluna', 'Para-brisa', 'Vidro traseiro', 'Vidro lateral', 'Farol', 'Lanterna', 'Grade', 'Retrovisor', 'Roda', 'Pneu'];

  function noop() {}
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16); crypto.getRandomValues(b); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  // ---------- rascunho no celular (IndexedDB)
  var IDB = (function () {
    var abrir = null;
    function db() {
      if (!abrir) {
        abrir = new Promise(function (res, rej) {
          if (!window.indexedDB) { rej(new Error('Sem armazenamento local.')); return; }
          var r = indexedDB.open('nx-avaliacoes', 1);
          r.onupgradeneeded = function () {
            var d = r.result;
            if (!d.objectStoreNames.contains('rascunhos')) d.createObjectStore('rascunhos', { keyPath: 'id' });
            if (!d.objectStoreNames.contains('fotos')) d.createObjectStore('fotos', { keyPath: 'id' }).createIndex('avaliacao', 'avaliacao_id');
          };
          r.onsuccess = function () { res(r.result); };
          r.onerror = function () { abrir = null; rej(r.error); };
        });
      }
      return abrir;
    }
    function tx(loja, modo, fn) {
      return db().then(function (d) {
        return new Promise(function (res, rej) {
          var t = d.transaction(loja, modo), pedido = fn(t.objectStore(loja)), out;
          if (pedido) pedido.onsuccess = function () { out = pedido.result; };
          t.oncomplete = function () { res(out); };
          t.onerror = t.onabort = function () { rej(t.error); };
        });
      });
    }
    return {
      get: function (loja, k) { return tx(loja, 'readonly', function (s) { return s.get(k); }); },
      put: function (loja, v) { return tx(loja, 'readwrite', function (s) { return s.put(v); }); },
      del: function (loja, k) { return tx(loja, 'readwrite', function (s) { return s.delete(k); }); },
      fotos: function (avId) { return tx('fotos', 'readonly', function (s) { return s.index('avaliacao').getAll(avId); }); }
    };
  })();

  // ---------- foto: reduz para no máximo 1600 px e JPEG ~70% (cerca de 200–400 KB)
  function comprimirFoto(arquivo) {
    var ler = window.createImageBitmap
      ? createImageBitmap(arquivo, { imageOrientation: 'from-image' }).catch(function () { return createImageBitmap(arquivo); })
      : new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = rej; i.src = URL.createObjectURL(arquivo); });
    return ler.then(function (img) {
      var MAX = 1600, w = img.width, h = img.height, k = Math.min(1, MAX / Math.max(w, h));
      var c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      var gerar = function (q) { return new Promise(function (res) { c.toBlob(res, 'image/jpeg', q); }); };
      return gerar(0.72).then(function (b) { return b && b.size > 1900000 ? gerar(0.5) : b; });
    }).then(function (b) {
      if (!b) throw new Error('Não foi possível ler a foto.');
      return b;
    });
  }

  // ---------- estado da vistoria
  function estadoLocal(V) { return { id: V.id, avarias: V.avarias, checklist: V.checklist, sujo: V.sujo, carroceria: V.carroceria, pode: V.pode, quando: Date.now() }; }
  function doServidor(est) {
    return (est.avarias || []).map(function (a) {
      return { id: a.id, peca: a.peca, grupo: a.grupo, tipo: a.tipo, gravidade: a.gravidade, observacao: a.observacao || '' };
    });
  }
  function abrirVistoria() {
    var av = S.detalhe && S.detalhe.av; if (!av) return;
    fecharVistoria();
    S.view = 'vistoria'; S.msg = null;
    var V = S.vis = { id: av.id, av: av, carregando: true, avarias: [], checklist: {}, servidor: null, sujo: false, seq: 0,
                      pode: false, carroceria: av.carroceria, offline: false, salvando: null, fotosLocais: {}, urls: {},
                      folha: null, ctrl: null, erro3d: null, montado: false, vista: '3D' };
    render();
    Promise.all([
      P().vistoria(av.id).catch(function (e) { return { _erro: e }; }),
      IDB.get('rascunhos', av.id).catch(function () { return null; }),
      IDB.fotos(av.id).catch(function () { return []; })
    ]).then(function (r) {
      if (S.vis !== V) return;
      var srv = r[0], local = r[1];
      (r[2] || []).forEach(function (f) { V.fotosLocais[f.id] = { avaria_id: f.avaria_id, url: URL.createObjectURL(f.blob) }; });
      if (srv && srv._erro) {
        if (srv._erro.state === 'SESSION_EXPIRED') return falha(srv._erro);
        if (!(srv._erro.rede && local)) { V.carregando = false; S.msg = { erro: true, texto: srv._erro.message }; render(); return; }
        // sem sinal, mas com rascunho neste celular: continua dele
        V.offline = true; V.pode = local.pode; V.carroceria = local.carroceria || V.carroceria;
        V.avarias = local.avarias || []; V.checklist = local.checklist || {}; V.sujo = !!local.sujo;
      } else {
        V.servidor = srv; V.pode = !!srv.pode_editar; V.carroceria = srv.carroceria || V.carroceria;
        if (local && local.sujo && V.pode) { V.avarias = local.avarias || []; V.checklist = local.checklist || {}; V.sujo = true; }
        else { V.avarias = doServidor(srv); V.checklist = srv.checklist || {}; }
      }
      V.carregando = false; render();
      carregarFotosServidor(V);
      if (V.sujo || Object.keys(V.fotosLocais).length) sincronizar();
    });
  }
  function fecharVistoria() {
    var V = S.vis; if (!V) return;
    if (V.ctrl) { try { V.ctrl.destruir(); } catch (e) { /* já destruído */ } }
    Object.keys(V.fotosLocais).forEach(function (k) { URL.revokeObjectURL(V.fotosLocais[k].url); });
    clearTimeout(V.timer);
    S.vis = null;
  }
  function carregarFotosServidor(V) {
    if (V.offline || !V.servidor) return;
    P().verFotos(V.id).then(function (r) {
      if (S.vis !== V) return;
      (r && r.fotos || []).forEach(function (f) { if (f.url) V.urls[f.id] = f.url; });
      atualizarVistoria();
    }).catch(noop);
  }
  function montar3d(V) {
    var palco = document.getElementById('avVisPalco');
    var api = window.NX_AVALIACOES_VISTORIA;
    if (!palco) return;
    if (!api) { V.erro3d = 'O desenho 3D não carregou. Recarregue a página.'; atualizarVistoria(); return; }
    V.montando = true;
    api.criar(palco, { carroceria: V.carroceria, aoTocar: function (nome, grupo) { abrirFolhaAvaria(nome, grupo); } }).then(function (ctrl) {
      V.montando = false;
      if (S.vis !== V || !palco.isConnected) { ctrl.destruir(); return; }
      V.ctrl = ctrl; V.erro3d = null; pintar3d(); if (V.vista !== '3D') ctrl.vista(V.vista);
    }).catch(function () { V.montando = false; V.erro3d = 'O desenho 3D não carregou (sem sinal?). A lista de avarias continua funcionando.'; atualizarVistoria(); });
  }
  function pintar3d() {
    var V = S.vis; if (!V || !V.ctrl) return;
    var m = {};
    V.avarias.forEach(function (a) { if (!m[a.peca] || GRAV_ORDEM[a.gravidade] > GRAV_ORDEM[m[a.peca]]) m[a.peca] = a.gravidade; });
    V.ctrl.marcar(m);
    V.ctrl.destacar(V.folha ? V.folha.peca : null);
  }

  // ---------- alterações (sempre: grava no celular e agenda o envio)
  function alterou() {
    var V = S.vis; V.seq++; V.sujo = true;
    IDB.put('rascunhos', estadoLocal(V)).catch(noop);
    clearTimeout(V.timer); V.timer = setTimeout(sincronizar, 1200);
    pintar3d(); atualizarVistoria();
  }
  function sincronizar() {
    var V = S.vis;
    if (!V || !V.pode) return Promise.resolve();
    if (V.salvando) { V.denovo = true; return V.salvando; }
    if (navigator.onLine === false) { V.offline = true; atualizarVistoria(); return Promise.resolve(); }
    var seq = V.seq, enviar = { avarias: V.avarias, checklist: V.checklist };
    V.erroSync = null;
    var p = (V.sujo ? P().salvarVistoria(V.id, enviar).then(function (est) {
      V.servidor = est; V.offline = false;
      if (V.seq === seq) { V.sujo = false; IDB.put('rascunhos', estadoLocal(V)).catch(noop); }
    }) : Promise.resolve()).then(function () {
      return enviarFotosPendentes(V);
    }).catch(function (e) {
      if (e && e.state === 'SESSION_EXPIRED') { falha(e); return; }
      if (e && e.rede) V.offline = true; else V.erroSync = (e && e.message) || 'Não foi possível salvar agora.';
    }).then(function () {
      V.salvando = null; if (S.vis === V) atualizarVistoria();
      if (V.denovo) { V.denovo = false; return sincronizar(); }
    });
    V.salvando = p; atualizarVistoria();
    return p;
  }
  function enviarFotosPendentes(V) {
    return IDB.fotos(V.id).then(function (lista) {
      var salvas = {}; ((V.servidor && V.servidor.avarias) || []).forEach(function (a) { salvas[a.id] = true; });
      var fila = (lista || []).filter(function (f) { return !f.avaria_id || salvas[f.avaria_id]; });
      var enviou = 0;
      return fila.reduce(function (cad, f) {
        return cad.then(function () {
          return P().enviarFoto(V.id, f.avaria_id, f.id, f.blob).then(function () {
            enviou++;
            return IDB.del('fotos', f.id).then(function () {
              if (V.fotosLocais[f.id]) { V.urls[f.id] = V.fotosLocais[f.id].url; delete V.fotosLocais[f.id]; }
            });
          });
        });
      }, Promise.resolve()).then(function () {
        if (!enviou) return;
        V.offline = false;
        return P().vistoria(V.id).then(function (est) { V.servidor = est; });
      });
    });
  }

  // ---------- folha da avaria (abre ao tocar na peça)
  function abrirFolhaAvaria(peca, grupo) {
    var V = S.vis; if (!V) return;
    V.folha = { peca: peca, grupo: grupo, tipo: null, gravidade: 'LEVE', fotos: [] };
    pintar3d(); atualizarVistoria();
  }
  function fecharFolha() {
    var V = S.vis; if (!V || !V.folha) return;
    V.folha.fotos.forEach(function (f) { URL.revokeObjectURL(f.url); });
    V.folha = null; pintar3d(); atualizarVistoria();
  }
  function salvarFolha() {
    var V = S.vis, f = V.folha; if (!f || !f.tipo) return;
    var obs = (document.getElementById('avVisObs') || {}).value || '';
    var a = { id: uuid(), peca: f.peca, grupo: f.grupo, tipo: f.tipo, gravidade: f.gravidade, observacao: obs.trim().slice(0, 300) };
    V.avarias.push(a);
    f.fotos.forEach(function (ft) { guardarFoto(V, a.id, ft.id, ft.blob, ft.url); });
    f.fotos = []; V.folha = null;
    alterou();
  }
  function guardarFoto(V, avariaId, fotoId, blob, url) {
    V.fotosLocais[fotoId] = { avaria_id: avariaId, url: url || URL.createObjectURL(blob) };
    IDB.put('fotos', { id: fotoId, avaliacao_id: V.id, avaria_id: avariaId, blob: blob, criado: Date.now() }).catch(function () {
      S.msg = { erro: true, texto: 'Este celular não conseguiu guardar a foto. Libere espaço e tente de novo.' }; atualizarVistoria();
    });
  }
  function removerAvaria(id) {
    var V = S.vis;
    if (!window.confirm('Remover esta avaria e as fotos dela?')) return;
    V.avarias = V.avarias.filter(function (a) { return a.id !== id; });
    Object.keys(V.fotosLocais).forEach(function (k) {
      if (V.fotosLocais[k].avaria_id === id) { URL.revokeObjectURL(V.fotosLocais[k].url); delete V.fotosLocais[k]; IDB.del('fotos', k).catch(noop); }
    });
    alterou();
  }
  function fotoEscolhida(input) {
    var V = S.vis, arq = input.files && input.files[0], alvo = input.getAttribute('data-foto');
    input.value = '';
    if (!V || !arq) return;
    S.msg = null;
    comprimirFoto(arq).then(function (blob) {
      if (S.vis !== V) return;
      var id = uuid();
      if (alvo === 'folha') {
        if (V.folha) V.folha.fotos.push({ id: id, blob: blob, url: URL.createObjectURL(blob) });
        atualizarVistoria();
      } else {
        guardarFoto(V, alvo, id, blob);
        atualizarVistoria(); sincronizar();
      }
    }).catch(function () { S.msg = { erro: true, texto: 'Não foi possível ler essa foto. Tente tirar de novo.' }; atualizarVistoria(); });
  }
  function removerFotoServidor(fotoId) {
    var V = S.vis;
    if (!window.confirm('Remover esta foto?')) return;
    P().removerFoto(fotoId).then(function (est) { V.servidor = est; delete V.urls[fotoId]; atualizarVistoria(); }).catch(falha);
  }
  function concluirVistoria() {
    var V = S.vis;
    S.msg = null;
    sincronizar().then(function () {
      if (V.sujo || Object.keys(V.fotosLocais).length) {
        S.msg = { erro: true, texto: 'Ainda há alterações ou fotos só neste celular. Espere o sinal voltar para concluir.' }; atualizarVistoria(); return;
      }
      return P().concluirVistoria(V.id).then(function (est) {
        V.servidor = est; S.msg = { erro: false, texto: 'Vistoria concluída.' }; atualizarVistoria();
      });
    }).catch(function (e) { S.msg = { erro: true, texto: (e && e.message) || 'Não foi possível concluir.' }; atualizarVistoria(); });
  }

  // ---------- telas da vistoria
  function custoDe(id) {
    var V = S.vis, s = V.servidor && (V.servidor.avarias || []).filter(function (a) { return a.id === id; })[0];
    if (!s || V.sujo) return '…';
    return s.custo == null ? 'a definir' : brl(s.custo);
  }
  function fotosDaAvaria(id) {
    var V = S.vis, out = [];
    var s = V.servidor && (V.servidor.avarias || []).filter(function (a) { return a.id === id; })[0];
    ((s && s.fotos) || []).forEach(function (f) { if (f.status === 'ENVIADA') out.push({ id: f.id, url: V.urls[f.id], enviada: true }); });
    Object.keys(V.fotosLocais).forEach(function (k) { if (V.fotosLocais[k].avaria_id === id) out.push({ id: k, url: V.fotosLocais[k].url, enviada: false }); });
    return out;
  }
  function statusVistoriaHtml() {
    var V = S.vis, pend = Object.keys(V.fotosLocais).length, t;
    if (V.offline) t = 'Sem sinal: rascunho salvo neste celular' + (pend ? ' · ' + pend + ' foto(s) aguardando' : '') + '. Envia sozinho quando o sinal voltar.';
    else if (V.salvando) t = 'Salvando…';
    else if (V.erroSync) t = 'Não salvou: ' + V.erroSync;
    else if (V.sujo || pend) t = 'Rascunho salvo neste celular' + (pend ? ' · ' + pend + ' foto(s) para enviar' : '') + '.';
    else t = 'Tudo salvo.';
    return '<div class="avVisStatus' + (V.offline || V.erroSync ? ' alerta' : '') + '" role="status" aria-live="polite">' + esc(t) + '</div>';
  }
  function listaAvariasHtml() {
    var V = S.vis, est = V.servidor || {};
    var h = '<h2 class="avSecao avVisSecao"><span>Avarias</span><span class="avNota">' + V.avarias.length + ' marcada(s)' +
      (V.sujo ? '' : ' · reparos: ' + (est.total_reparos == null ? 'a definir' : brl(est.total_reparos))) + '</span></h2>';
    if (!V.avarias.length) return h + '<div class="avCard avNota">Nenhuma avaria marcada. Toque na peça do carro para marcar.</div>';
    return h + '<ul class="avVisLista">' + V.avarias.map(function (a) {
      var fotos = fotosDaAvaria(a.id), pedeFoto = (a.gravidade === 'MEDIA' || a.gravidade === 'GRAVE') && !fotos.length;
      return '<li class="avVisItem g' + a.gravidade + '"><div class="avVisItemTopo"><div><b>' + esc(a.peca) + '</b> · ' + esc(a.tipo) +
        '<span class="avNota">' + esc(GRAV_LABEL[a.gravidade]) + (a.observacao ? ' · ' + esc(a.observacao) : '') + '</span></div>' +
        '<span class="avVisCusto">' + esc(custoDe(a.id)) + '</span></div>' +
        (fotos.length ? '<div class="avVisFotos">' + fotos.map(function (f) {
          return '<span class="avVisFoto' + (f.enviada ? '' : ' pendente') + '">' + (f.url ? '<img src="' + esc(f.url) + '" alt="Foto da avaria">' : '<i>foto</i>') +
            (f.enviada && V.pode ? '<button type="button" class="avVisFotoX" data-acao="visRemoverFoto" data-id="' + esc(f.id) + '" aria-label="Remover foto">×</button>' : '') + '</span>';
        }).join('') + '</div>' : '') +
        (pedeFoto ? '<p class="avNota avAviso">Falta foto (obrigatória em média e grave).</p>' : '') +
        (V.pode ? '<div class="avAcoes"><label class="btn btn-secondary avVisBtnFoto">📷 Foto<input type="file" accept="image/*" capture="environment" data-foto="' + esc(a.id) + '" hidden></label>' +
          '<button type="button" class="btn btn-tertiary avPerigo" data-acao="visRemover" data-id="' + esc(a.id) + '">Remover</button></div>' : '') +
        '</li>';
    }).join('') + '</ul>';
  }
  function checklistHtml() {
    var V = S.vis;
    return '<h2 class="avSecao" id="avVisChecklist">Checklist</h2>' + CHECKLIST.map(function (q) {
      return '<div class="avCard avVisChk"><p class="avVisPerg">' + esc(q[1]) + '</p><div class="avChips">' + q[2].map(function (o) {
        var on = V.checklist[q[0]] === o[0];
        return '<button type="button" class="avChip' + (on ? ' active' : '') + '" data-acao="visCheck" data-q="' + q[0] + '" data-v="' + o[0] + '"' +
          (V.pode ? '' : ' disabled') + ' aria-pressed="' + on + '">' + esc(o[1]) + '</button>';
      }).join('') + '</div></div>';
    }).join('');
  }
  function folhaHtml() {
    var V = S.vis, f = V.folha;
    if (!f) return '';
    var ja = V.avarias.filter(function (a) { return a.peca === f.peca; });
    var h = '<div class="avVisFolha" role="dialog" aria-label="' + esc(f.peca) + '"><h3>' + esc(f.peca) + '</h3>' +
      '<p class="avNota">' + esc(GRUPO_LABEL[f.grupo] || '') + (ja.length ? ' · já tem ' + ja.length + ' avaria(s): ' + esc(ja.map(function (a) { return a.tipo + ' (' + GRAV_LABEL[a.gravidade] + ')'; }).join(', ')) : '') + '</p>';
    if (!V.pode) return h + '<div class="avVisAcoesFolha um"><button type="button" class="btn btn-secondary" data-acao="visFolhaCancelar">Fechar</button></div></div>';
    h += '<p class="avLabel">Tipo de avaria</p><div class="avChips">' + (TIPOS_AVARIA[f.grupo] || []).map(function (t) {
      return '<button type="button" class="avChip' + (f.tipo === t ? ' active' : '') + '" data-acao="visTipo" data-v="' + esc(t) + '" aria-pressed="' + (f.tipo === t) + '">' + esc(t) + '</button>';
    }).join('') + '</div>' +
      '<p class="avLabel">Gravidade</p><div class="avChips avVisGrav">' + GRAVIDADES.map(function (g) {
        return '<button type="button" class="avChip g' + g[0] + (f.gravidade === g[0] ? ' active' : '') + '" data-acao="visGrav" data-v="' + g[0] + '" aria-pressed="' + (f.gravidade === g[0]) + '">' + g[1] + '</button>';
      }).join('') + '</div>' +
      '<label class="avLabel" for="avVisObs">Observação (opcional)</label><input id="avVisObs" class="avInput" maxlength="300" autocomplete="off">' +
      '<p class="avNota">Desconto pela tabela de reparos: <b>a definir</b> até a vistoria salvar.</p>' +
      '<div class="avVisFotos">' + f.fotos.map(function (ft) { return '<span class="avVisFoto pendente"><img src="' + esc(ft.url) + '" alt="Foto"></span>'; }).join('') +
      '<label class="btn btn-secondary avVisBtnFoto">📷 Tirar foto<input type="file" accept="image/*" capture="environment" data-foto="folha" hidden></label></div>' +
      '<p class="avNota">Foto obrigatória em média e grave.</p>' +
      '<div class="avVisAcoesFolha"><button type="button" class="btn btn-secondary" data-acao="visFolhaCancelar">Cancelar</button>' +
      '<button type="button" class="btn btn-primary" data-acao="visFolhaSalvar"' + (f.tipo ? '' : ' disabled') + '>Marcar avaria</button></div></div>';
    return h;
  }
  function resumoVistoriaHtml() {
    var V = S.vis, est = V.servidor || {};
    var resp = CHECKLIST.filter(function (q) { return V.checklist[q[0]]; }).length;
    var h = '<div class="avCard"><p class="avNota">Checklist ' + resp + '/' + CHECKLIST.length +
      (est.avarias_sem_foto && !V.sujo ? ' · ' + est.avarias_sem_foto + ' avaria(s) sem foto' : '') +
      (est.concluida_em && !V.sujo ? ' · <b>vistoria concluída em ' + esc(data(est.concluida_em)) + '</b>' : '') + '</p>';
    if (V.pode) h += '<button type="button" class="btn btn-primary avBtnGrande" data-acao="visConcluir"' + (V.salvando ? ' disabled' : '') + '>' +
      (est.concluida_em && !V.sujo ? 'Concluída · conferir de novo' : 'Concluir vistoria') + '</button>';
    return h + '</div>';
  }
  function telaVistoria() {
    var V = S.vis, a = V.av;
    var html = cabecalho('Vistoria' + (a ? ' · AV-' + esc(a.codigo) : ''),
      esc([placaFmt(a.placa), a.modelo, (CARROCERIAS.filter(function (c) { return c.v === V.carroceria; })[0] || {}).label].filter(Boolean).join(' · ')), 'visVoltar');
    if (V.carregando) return html + '<div class="avVazio">Carregando a vistoria…</div>';
    return html + '<div id="avVisMsg">' + msgHtml() + '</div><div id="avVisStatus">' + statusVistoriaHtml() + '</div>' +
      '<div class="avVisPalco" id="avVisPalco"><div class="avVisLegenda"><span><i class="gLEVE"></i>leve</span><span><i class="gMEDIA"></i>média</span><span><i class="gGRAVE"></i>grave</span></div>' +
      '<div class="avVisDica">Arraste para girar · toque na peça</div><div id="avVisErro3d" class="avVisErro3d"></div></div>' +
      '<div class="avVisVistas" role="group" aria-label="Vistas">' + VISTAS_3D.map(function (v) {
        return '<button type="button" class="avChip' + (V.vista === v ? ' active' : '') + '" data-acao="visVista" data-v="' + v + '">' + v + '</button>';
      }).join('') + '</div>' +
      '<div class="avVisExtra"><button type="button" class="btn btn-secondary" data-acao="visEstepe">Pneu estepe</button>' +
      '<button type="button" class="btn btn-secondary" data-acao="visIrChecklist">Ir para o checklist ↓</button></div>' +
      '<div id="avVisLista">' + listaAvariasHtml() + '</div><div id="avVisCheck">' + checklistHtml() + '</div>' +
      '<div id="avVisResumo">' + resumoVistoriaHtml() + '</div><div id="avVisFolha">' + folhaHtml() + '</div>';
  }
  // atualiza só as partes da tela (o carro 3D não é recriado)
  function atualizarVistoria() {
    var V = S.vis; if (!V || S.view !== 'vistoria') return;
    if (!document.getElementById('avVisPalco')) { render(); return; }
    var obs = document.getElementById('avVisObs'), obsValor = obs ? obs.value : null;
    document.getElementById('avVisMsg').innerHTML = msgHtml();
    document.getElementById('avVisStatus').innerHTML = statusVistoriaHtml();
    document.getElementById('avVisLista').innerHTML = listaAvariasHtml();
    document.getElementById('avVisCheck').innerHTML = checklistHtml();
    document.getElementById('avVisResumo').innerHTML = resumoVistoriaHtml();
    document.getElementById('avVisFolha').innerHTML = folhaHtml();
    document.body.classList.toggle('avVisFolhaAberta', !!V.folha);
    var novoObs = document.getElementById('avVisObs'); if (novoObs && obsValor != null) novoObs.value = obsValor;
    document.getElementById('avVisErro3d').textContent = V.erro3d || '';
    Array.prototype.forEach.call(document.querySelectorAll('.avVisVistas .avChip'), function (b) { b.classList.toggle('active', b.getAttribute('data-v') === V.vista); });
  }
  function acaoVistoria(a, b) {
    var V = S.vis; if (!V) return false;
    switch (a) {
      case 'visVoltar': fecharVistoria(); document.body.classList.remove('avVisFolhaAberta'); abrirDetalhe(S.detalhe.av.id); return true;
      case 'visVista': V.vista = b.getAttribute('data-v'); if (V.ctrl) V.ctrl.vista(V.vista); atualizarVistoria(); return true;
      case 'visEstepe': abrirFolhaAvaria('Pneu estepe', 'pneu'); return true;
      case 'visIrChecklist': var c = document.getElementById('avVisChecklist'); if (c) c.scrollIntoView({ behavior: 'smooth' }); return true;
      case 'visTipo': if (V.folha) { V.folha.tipo = b.getAttribute('data-v'); atualizarVistoria(); } return true;
      case 'visGrav': if (V.folha) { V.folha.gravidade = b.getAttribute('data-v'); atualizarVistoria(); } return true;
      case 'visFolhaCancelar': fecharFolha(); return true;
      case 'visFolhaSalvar': salvarFolha(); return true;
      case 'visRemover': removerAvaria(b.getAttribute('data-id')); return true;
      case 'visRemoverFoto': removerFotoServidor(b.getAttribute('data-id')); return true;
      case 'visCheck': V.checklist[b.getAttribute('data-q')] = b.getAttribute('data-v'); alterou(); return true;
      case 'visConcluir': concluirVistoria(); return true;
    }
    return false;
  }
  window.addEventListener('online', function () { if (S && S.vis) { S.vis.offline = false; sincronizar(); } });

  // resumo da vistoria no detalhe da avaliação
  function cardVistoriaHtml() {
    var d = S.detalhe, v = d && d.vis, a = d && d.av;
    if (!a) return '';
    var h = '<h2 class="avSecao">Vistoria</h2><div class="avCard">';
    if (!v) return h + '<p class="avNota">Carregando o resumo…</p>' + (a.carroceria ? '<button type="button" class="btn btn-secondary avBtnGrande" data-acao="abrirVistoria">Abrir vistoria</button>' : '') + '</div>';
    var iniciada = v.avarias.length || Object.keys(v.checklist || {}).length;
    h += '<p class="avCardTitulo">' + (v.concluida_em ? 'Concluída em ' + esc(data(v.concluida_em)) : iniciada ? 'Em andamento' : 'Não iniciada') + '</p>' +
      '<p class="avNota">' + v.avarias.length + ' avaria(s) · reparos ' + (v.total_reparos == null ? 'a definir' : brl(v.total_reparos)) +
      ' · checklist ' + v.checklist_respondidos + '/' + v.checklist_total + '</p>';
    if (!a.carroceria) return h + '<p class="avNota">Informe a carroceria na identificação para fazer a vistoria.</p></div>';
    return h + '<button type="button" class="btn btn-primary avBtnGrande" data-acao="abrirVistoria">' +
      (v.pode_editar ? (iniciada ? 'Continuar vistoria' : 'Fazer vistoria') : 'Ver vistoria') + '</button></div>';
  }

  // tabela de reparos (Master), na tela de Regras
  function tabelaReparosHtml() {
    var R = S.regras, T = R.reparos;
    var h = '<h2 class="avSecao">Tabela de reparos</h2>';
    if (!T) return h + '<div class="avVazio">Carregando…</div>';
    var vig = T[0] || { itens: {} };
    h += '<div class="avCard"><p class="avNota">Custo de cada reparo por gravidade (R$). Em branco = <b>a definir</b>: a vistoria mostra "a definir" e o total só aparece quando todos os itens marcados tiverem valor. Cada alteração cria uma nova versão (vigente: v' + esc(vig.versao || 1) + ').</p>' +
      '<div class="avTabRep"><div class="avTabRepCab"><span>Item</span><span>Leve</span><span>Média</span><span>Grave</span></div>' +
      ITENS_REPARO.map(function (it, i) {
        var lin = (vig.itens || {})[it] || {};
        return '<div class="avTabRepLinha"><span>' + esc(it) + '</span>' + GRAVIDADES.map(function (g) {
          var v = lin[g[0]];
          return '<input class="avInput" id="avTR_' + i + '_' + g[0] + '" inputmode="decimal" aria-label="' + esc(it + ' ' + g[1]) + '" placeholder="a definir" value="' + (v == null ? '' : esc(String(v).replace('.', ','))) + '">';
        }).join('') + '</div>';
      }).join('') + '</div>' +
      '<label class="avLabel" for="avTR_obs">Observação da versão</label><input id="avTR_obs" class="avInput" placeholder="Ex.: valores da oficina de …">' +
      '<div class="avAcoes"><button type="button" class="btn btn-primary" data-acao="salvarReparos"' + (S.ocupado ? ' disabled' : '') + '>Salvar nova versão da tabela</button></div></div>';
    return h;
  }
  function salvarReparos() {
    var itens = {};
    ITENS_REPARO.forEach(function (it, i) {
      itens[it] = {};
      GRAVIDADES.forEach(function (g) { itens[it][g[0]] = val('avTR_' + i + '_' + g[0]).replace(/\./g, '').replace(',', '.').trim() || null; });
    });
    if (!window.confirm('Criar uma nova versão da tabela de reparos?')) return;
    S.ocupado = true; render();
    P().salvarReparos(itens, val('avTR_obs')).then(function (r) {
      S.ocupado = false;
      return P().reparos().then(function (lista) { S.regras.reparos = lista || []; S.msg = { erro: false, texto: 'Versão ' + r.versao + ' da tabela de reparos criada.' }; render(); });
    }).catch(falha);
  }

  // ---------------------------------------------------------------- render + eventos
  function render() {
    if (!outletRef) return;
    if (S.view === 'vistoria' && S.vis) {
      // o carro 3D vive dentro do palco: com o palco na tela, só as outras partes são redesenhadas
      if (document.getElementById('avVisPalco') && (S.vis.ctrl || S.vis.montando)) { atualizarVistoria(); return; }
      if (S.vis.ctrl) { try { S.vis.ctrl.destruir(); } catch (e) { /* já destruído */ } S.vis.ctrl = null; }
    }
    if (S.view !== 'vistoria' && S.vis) { fecharVistoria(); document.body.classList.remove('avVisFolhaAberta'); }
    var corpo;
    if (S.erro) {
      corpo = cabecalho('Avaliações de Seminovos') + '<div class="avErro">' + esc(S.erro) +
        '<button type="button" class="btn btn-secondary" data-acao="recarregar">Tentar novamente</button></div>';
    } else if (!S.ctx) {
      corpo = cabecalho('Avaliações de Seminovos') + '<div class="avVazio">Carregando…</div>';
    } else if (S.view === 'nova') corpo = telaNova();
    else if (S.view === 'detalhe') corpo = telaDetalhe();
    else if (S.view === 'regras') corpo = telaRegras();
    else if (S.view === 'vistoria' && S.vis) corpo = telaVistoria();
    else corpo = telaLista();
    outletRef.innerHTML = '<div class="avPage">' + corpo + '</div>';
    if (S.view === 'vistoria' && S.vis && !S.vis.carregando) { atualizarVistoria(); montar3d(S.vis); }
    var busca = document.getElementById('avBusca');
    if (busca && S.view === 'nova' && S.nova.etapa === 'busca' && !S.ocupado) {
      busca.addEventListener('keydown', function (e) { if (e.key === 'Enter') consultar(); });
    }
  }

  function onClick(e) {
    var b = e.target.closest ? e.target.closest('[data-acao]') : null;
    // o outlet é o mesmo de todos os módulos: só reage dentro da página das Avaliações
    if (!b || !b.closest('.avPage') || !outletRef.contains(b) || b.disabled) return;
    var a = b.getAttribute('data-acao');
    if (S.view === 'vistoria' && acaoVistoria(a, b)) return;
    switch (a) {
      case 'abrirVistoria': abrirVistoria(); break;
      case 'salvarReparos': salvarReparos(); break;
      case 'nova': iniciarNova(null); break;
      case 'regras': abrirRegras(); break;
      case 'filtro': S.filtro = b.getAttribute('data-v'); carregarLista(); break;
      case 'abrir': abrirDetalhe(b.getAttribute('data-id')); break;
      case 'voltarLista': S.view = 'lista'; S.msg = null; carregarLista(); break;
      case 'voltarDetalhe': abrirDetalhe(S.nova.editId); break;
      case 'modo': S.nova.modo = b.getAttribute('data-v'); S.nova.valor = ''; S.msg = null; render(); break;
      case 'consultar': consultar(); break;
      case 'manual': S.nova.valor = so(val('avBusca')) || S.nova.valor; irParaConfirmar(true); break;
      case 'novaBusca': iniciarNova(null); break;
      case 'versao': S.nova.versaoIdx = Number(b.getAttribute('data-i')); S.msg = null; render(); break;
      case 'confirmarVersao': irParaConfirmar(false); break;
      case 'carroceria': lerForm(); S.nova.form.carroceria = b.getAttribute('data-v'); render(); break;
      case 'salvar': salvar(); break;
      case 'editar': iniciarNova(S.detalhe.av); break;
      case 'descartar': descartar(); break;
      case 'buscarRefs': buscarReferencias(); break;
      case 'previa': previa(); break;
      case 'salvarRegra': salvarRegra(); break;
      case 'recarregar': iniciar(); break;
    }
  }

  function onChange(e) {
    var t = e.target;
    if (!t || !t.closest || !t.closest('.avPage') || !t.matches('input[type=file][data-foto]')) return;
    fotoEscolhida(t);
  }

  function iniciar() {
    if (S && S.vis) fecharVistoria();
    S = novoEstado(); render();
    return P().contexto().then(function (ctx) {
      S.ctx = ctx; return carregarLista();
    }).catch(function (e) {
      if (e && e.state === 'SESSION_EXPIRED') return falha(e);
      S.erro = e && e.state === 'PERMISSION_DENIED' ? (e.message || 'Seu perfil não tem acesso às Avaliações.')
        : 'Não foi possível abrir as Avaliações. Tente novamente.';
      render();
    });
  }

  window.NX_AVALIACOES_PAGE = {
    getState: function () { return S; },
    render: function (outlet) {
      if (outletRef && outletRef !== outlet) { outletRef.removeEventListener('click', onClick); outletRef.removeEventListener('change', onChange); }
      if (outletRef !== outlet) { outlet.addEventListener('click', onClick); outlet.addEventListener('change', onChange); }
      outletRef = outlet;
      return iniciar();
    }
  };
})();
