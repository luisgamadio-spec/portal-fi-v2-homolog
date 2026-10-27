/* PORTAL-NEXT V2 — Avaliações de Seminovos (Fase 1, 27/10/2026).
   Uso principal no celular, no pátio: uma coluna, botões grandes.
   Fase 1: identificação (placa/chassi -> versões -> ano, km, cor, carroceria),
   referências (FIPE + vendas reais do grupo) e, só para o Master, as regras de
   margem em versões com prévia do cálculo. Vistoria (Fase 2) e resultado com os
   4 valores + aprovação (Fase 3) ainda não existem nesta tela.

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
      nova: null, detalhe: null, regras: null
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
    S.view = 'detalhe'; S.detalhe = { av: null, refs: null, carregandoRefs: true }; S.msg = null; render();
    return P().obter(id).then(function (av) {
      S.detalhe.av = av; render();
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
    html += '<div class="avProximas">Próximas fases: vistoria com avarias e fotos (Fase 2); resultado com os 4 valores e aprovação do gerente (Fase 3).</div>';
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
    return html;
  }

  // ---------------------------------------------------------------- render + eventos
  function render() {
    if (!outletRef) return;
    var corpo;
    if (S.erro) {
      corpo = cabecalho('Avaliações de Seminovos') + '<div class="avErro">' + esc(S.erro) +
        '<button type="button" class="btn btn-secondary" data-acao="recarregar">Tentar novamente</button></div>';
    } else if (!S.ctx) {
      corpo = cabecalho('Avaliações de Seminovos') + '<div class="avVazio">Carregando…</div>';
    } else if (S.view === 'nova') corpo = telaNova();
    else if (S.view === 'detalhe') corpo = telaDetalhe();
    else if (S.view === 'regras') corpo = telaRegras();
    else corpo = telaLista();
    outletRef.innerHTML = '<div class="avPage">' + corpo + '</div>';
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
    switch (a) {
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

  function iniciar() {
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
      if (outletRef && outletRef !== outlet) outletRef.removeEventListener('click', onClick);
      if (outletRef !== outlet) outlet.addEventListener('click', onClick);
      outletRef = outlet;
      return iniciar();
    }
  };
})();
