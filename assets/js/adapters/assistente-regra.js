/* GERADO — não editar. Assistente de solução financeira: regra das 3 propostas (Simulador de Novos).
   Fonte: branch feature/brabus-intelligence-v1, supabase/functions/brabus-intelligence/engine/assistente.ts (commit 51727db).
   Gerador: docs/assistente/gerar_regra_navegador.ts. sha256 das fontes (16 primeiros):
   engine/assistente.ts e3f093f1da33dd3b
   engine/novos.ts 341f5dc0aa5382ef
   engine/ofertas.ts 7729e5f65d23adf7
   engine/comum.ts 5199112a8c402a3c
   engine/seminovos.ts 2bfcfcb2801df366
   Expõe window.NX_ASSISTENTE_REGRA (montarTresPropostas, CONFIG_PADRAO, AVISO_IOF_LINEAR, ...). */
(() => {
  var __defProp = Object.defineProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // supabase/functions/brabus-intelligence/engine/assistente.ts
  var assistente_exports = {};
  __export(assistente_exports, {
    CONFIG_PADRAO: () => CONFIG_PADRAO,
    ENTRADA_MIN_CAMPANHAS: () => ENTRADA_MIN_CAMPANHAS,
    alcancaEntradaCampanhas: () => alcancaEntradaCampanhas,
    campanhasPermitidas: () => campanhasPermitidas,
    montarTresPropostas: () => montarTresPropostas,
    perfilDasRespostas: () => perfilDasRespostas
  });

  // supabase/functions/brabus-intelligence/engine/comum.ts
  function pct(v) {
    return (v * 100).toLocaleString("pt-BR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }) + "%";
  }
  function taxaInterna(t) {
    return t + 12e-5;
  }
  var BASE_BALAO = {
    ADICIONAL: 0.062305,
    CAD: 980,
    REG: 339.67,
    IOF: 0.0321516
  };
  function baseInterna(fin) {
    const { ADICIONAL, CAD, REG, IOF } = BASE_BALAO;
    const subtotal = Math.max(0, fin) * (1 + ADICIONAL) + CAD + REG;
    return subtotal / (1 - IOF);
  }
  function fatorPrice(i, n) {
    return (1 - Math.pow(1 + i, -n)) / i;
  }

  // supabase/functions/brabus-intelligence/engine/novos.ts
  var PRAZOS_LINEAR = [
    12,
    18,
    24,
    30,
    36,
    42,
    48,
    60
  ];
  var TAXAS_SUBSIDIADAS = [
    0,
    49e-4,
    99e-4,
    0.0119
  ];
  function faixaLinear(pe) {
    if (pe >= 0.5) return 0.5;
    if (pe >= 0.4) return 0.4;
    if (pe >= 0.3) return 0.3;
    if (pe >= 0.2) return 0.2;
    return 0;
  }
  function baseCalculoLinear(fin, prazo) {
    const fatorIof = 38e-4 + 82e-6 * Math.max(0, prazo) * 30;
    return (Math.max(0, fin) + 980 + 339.67) / (1 - fatorIof);
  }
  function coefLinear(i, n) {
    if (!(n > 0)) return null;
    return i ? i / (1 - Math.pow(1 + i, -n)) : 1 / n;
  }
  function linear(bem, entrada, t) {
    if (!(bem > 0)) return {
      erro: "Informe o valor do bem."
    };
    if (entrada >= bem) return {
      erro: "A entrada deve ser menor que o valor do bem."
    };
    const financiado = Math.max(0, bem - entrada);
    const pctEntrada = entrada / bem;
    const faixa = faixaLinear(pctEntrada);
    const itens = PRAZOS_LINEAR.map((p) => {
      const row = t.linear.find((r) => r.prazo === p && Math.abs(r.entrada - faixa) < 1e-5);
      const base = baseCalculoLinear(financiado, p);
      const coef = row ? coefLinear(row.taxa, p) : null;
      const parcela = base > 0 && coef && coef > 0 ? base * coef : null;
      return {
        prazo: p,
        taxa: row ? row.taxa : null,
        parcela
      };
    });
    return {
      financiado,
      pctEntrada,
      faixa,
      itens
    };
  }
  function planoPorFaixa(tab, prazo, pe) {
    return tab.filter((r) => r.prazo === prazo && pe >= r.entrada).sort((a, b) => b.entrada - a.entrada)[0] ?? null;
  }
  function validaBaloes(baloes, prazo) {
    const lista = (baloes ?? []).map((b) => ({
      mes: Number(b.mes) || 0,
      valor: Number(b.valor) || 0
    })).filter((b) => b.mes || b.valor);
    const usados = /* @__PURE__ */ new Set();
    let total = 0;
    for (const b of lista) {
      if (!b.mes || b.mes < 1 || b.mes > prazo) return {
        erro: `Existe bal\xE3o fora do prazo. Use parcelas entre 1 e ${prazo}.`
      };
      if (usados.has(b.mes)) return {
        erro: "N\xE3o \xE9 permitido inserir dois bal\xF5es na mesma parcela."
      };
      if (b.valor <= 0) return {
        erro: "Informe valor v\xE1lido para todos os bal\xF5es."
      };
      usados.add(b.mes);
      total += b.valor;
    }
    return {
      lista,
      total
    };
  }
  var ENTRADA_MIN_BALAO_NOVOS = 0.1;
  var MAX_BALOES_TRADICIONAL = 4;
  function balaoTradicional(bem, entrada, prazo, baloes, t) {
    if (!(bem > 0)) return {
      erro: "Informe o valor do bem."
    };
    const fin = Math.max(0, bem - entrada);
    const pe = entrada / bem;
    if (pe < ENTRADA_MIN_BALAO_NOVOS) return {
      erro: "A entrada m\xEDnima permitida para este plano \xE9 de 10%."
    };
    if (fin <= 0) return {
      erro: "A entrada deve ser menor que o valor do bem."
    };
    const plano = planoPorFaixa(t.tradicional, prazo, pe);
    if (!plano) return {
      erro: "Prazo sem regra cadastrada na tabela para a faixa de entrada informada."
    };
    const v = validaBaloes(baloes, prazo);
    if ("erro" in v) return v;
    if (v.lista.length > MAX_BALOES_TRADICIONAL) return {
      erro: `Escolha at\xE9 ${MAX_BALOES_TRADICIONAL} bal\xF5es.`
    };
    const limite = fin * plano.max;
    if (v.total > limite + 1e-6) {
      return {
        erro: `A soma dos bal\xF5es ultrapassa o valor m\xE1ximo de bal\xE3o permitido (${pct(plano.max)} do financiado).`
      };
    }
    const i = taxaInterna(plano.taxa);
    const fator = fatorPrice(i, prazo);
    const vp = v.lista.reduce((s, b) => s + b.valor / Math.pow(1 + i, b.mes), 0);
    const saldo = baseInterna(fin) - vp;
    if (saldo <= 0) return {
      erro: "Os bal\xF5es escolhidos s\xE3o altos demais para gerar uma parcela mensal v\xE1lida."
    };
    const parcela = saldo / fator;
    const fluxo = v.lista.slice().sort((a, b) => a.mes - b.mes).map((b) => ({
      mes: b.mes,
      parcela,
      balao: b.valor,
      total: parcela + b.valor
    }));
    return {
      financiado: fin,
      pctEntrada: pe,
      prazo,
      taxa: plano.taxa,
      faixaEntrada: plano.entrada,
      limiteBaloes: limite,
      totalBaloes: v.total,
      parcela,
      fluxo
    };
  }
  function taxasSubsidiadas(bem, entrada, minVenda, t) {
    if (!(bem > 0)) return {
      erro: "Informe o valor do bem."
    };
    if (!(entrada > 0)) return {
      erro: "Informe o valor da entrada."
    };
    const pe = entrada / bem;
    const fin = bem - entrada;
    if (pe < 0.5) return {
      erro: "A entrada m\xEDnima permitida para esta modalidade \xE9 de 50%."
    };
    if (!(fin > 0)) return {
      erro: "O valor financiado precisa ser maior que zero."
    };
    if (minVenda && minVenda >= bem) return {
      erro: "O valor m\xEDnimo de venda deve ser menor que o valor do bem."
    };
    const linhas = t.rebates.filter((r) => TAXAS_SUBSIDIADAS.some((x) => Math.abs(x - r.taxa) < 1e-5)).map((r) => {
      const baseParcela = r.prazo <= 24 ? fin : fin + 2500;
      const rebateValor = fin * r.rebate;
      const valorFinalVenda = fin - rebateValor + entrada;
      return {
        prazo: r.prazo,
        taxa: r.taxa,
        parcela: baseParcela * r.coef,
        rebatePct: r.rebate,
        rebateValor,
        valorFinalVenda,
        viavel: minVenda > 0 ? valorFinalVenda >= minVenda : true,
        melhor: false
      };
    });
    const melhor = linhas.filter((r) => r.viavel).sort((a, b) => b.valorFinalVenda - a.valorFinalVenda || a.taxa - b.taxa || a.prazo - b.prazo)[0];
    if (melhor) melhor.melhor = true;
    return {
      financiado: fin,
      pctEntrada: pe,
      linhas
    };
  }

  // supabase/functions/brabus-intelligence/engine/ofertas.ts
  var BALAO_PREFERIDAS = [
    {
      prazo: 48,
      meses: [
        48
      ],
      nome: "48x com bal\xE3o na \xFAltima parcela",
      aceitacao: 1
    },
    {
      prazo: 48,
      meses: [
        36
      ],
      nome: "48x com bal\xE3o na 36\xAA parcela",
      aceitacao: 2
    },
    {
      prazo: 36,
      meses: [
        36
      ],
      nome: "36x com bal\xE3o na \xFAltima parcela",
      aceitacao: 3
    },
    {
      prazo: 36,
      meses: [
        24
      ],
      nome: "36x com bal\xE3o na 24\xAA parcela",
      aceitacao: 4
    }
  ];

  // supabase/functions/brabus-intelligence/engine/assistente.ts
  var ENTRADA_MIN_CAMPANHAS = 0.5;
  function alcancaEntradaCampanhas(valor, entrada, r) {
    if (!(valor > 0)) return false;
    const extra = r.dinheiro === "sim" && r.dinheiro_extra > 0 ? r.dinheiro_extra : 0;
    return entrada / valor >= ENTRADA_MIN_CAMPANHAS - 1e-12 || extra > 0 && (entrada + extra) / valor >= ENTRADA_MIN_CAMPANHAS - 1e-12;
  }
  function campanhasPermitidas(rebate) {
    return {
      taxa_subsidiada: rebate
    };
  }
  var CONFIG_PADRAO = {
    balao_pct: 0.3,
    limite_renda: 0.3,
    campanhas: {
      taxa_subsidiada: false
    }
  };
  function perfilDasRespostas(r) {
    return {
      parcela: "PARCELA",
      juros: "CUSTO_TOTAL",
      aplicado: "LIQUIDEZ",
      avista: "A_VISTA"
    }[r.prioridade];
  }
  var ehErro = (x) => !!x && typeof x === "object" && "erro" in x;
  var brl0 = (v) => v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0
  });
  function cand(c) {
    return {
      ...c,
      custo: c.entrada + c.parcela * c.prazo + c.baloes.reduce((s, b) => s + b.valor, 0)
    };
  }
  function balao(e, entrada, prazo, mes, nome, valorBalao) {
    const sim = balaoTradicional(e.valor, entrada, prazo, [
      {
        mes,
        valor: valorBalao
      }
    ], e.tabelas);
    if (ehErro(sim)) return null;
    return cand({
      plano: "BALAO",
      plano_nome: `Plano Bal\xE3o \u2014 ${nome}`,
      prazo,
      entrada,
      financiado: sim.financiado,
      parcela: sim.parcela,
      baloes: [
        {
          mes,
          valor: valorBalao
        }
      ]
    });
  }
  function limiteBalao(e, entrada, prazo) {
    const base = balaoTradicional(e.valor, entrada, prazo, [], e.tabelas);
    return ehErro(base) ? null : base.limiteBaloes;
  }
  function opcoesMensais(e, entrada, comBalao, cfg) {
    const out = [];
    const lin = linear(e.valor, entrada, e.tabelas);
    if (!ehErro(lin)) {
      for (const it of lin.itens) if (it.parcela && it.taxa !== null) {
        out.push(cand({
          plano: "LINEAR",
          plano_nome: "Financiamento Linear",
          prazo: it.prazo,
          entrada,
          financiado: lin.financiado,
          parcela: it.parcela,
          baloes: []
        }));
      }
    }
    if (comBalao) for (const est of BALAO_PREFERIDAS) {
      const lim = limiteBalao(e, entrada, est.prazo);
      if (lim === null) continue;
      const v = Math.min(Math.round((e.valor - entrada) * cfg.balao_pct), Math.floor(lim));
      const b = v > 0 ? balao(e, entrada, est.prazo, est.meses[0], est.nome, v) : null;
      if (b) out.push(b);
    }
    if (cfg.campanhas.taxa_subsidiada) {
      const sub = taxasSubsidiadas(e.valor, entrada, 0, e.tabelas);
      if (!ehErro(sub)) for (const l of sub.linhas) {
        out.push(cand({
          plano: "TAXA_SUBSIDIADA",
          plano_nome: "Taxa Subsidiada",
          prazo: l.prazo,
          variante: String(l.taxa),
          entrada,
          financiado: sub.financiado,
          parcela: l.parcela,
          baloes: []
        }));
      }
    }
    return out;
  }
  function entradasAvaliadas(e, r, perfil, cfg) {
    const out = [
      e.entrada
    ];
    if (perfil === "LIQUIDEZ" || r.dinheiro !== "sim" || !(r.dinheiro_extra > 0)) return out;
    const minimos = [];
    if (cfg.campanhas.taxa_subsidiada) minimos.push(0.5);
    for (const p of minimos) {
      const ent = Math.ceil(e.valor * p);
      if (ent > e.entrada && ent <= e.entrada + r.dinheiro_extra && ent < e.valor) out.push(ent);
    }
    return [
      ...new Set(out)
    ];
  }
  var chave = (c) => `${c.plano}|${c.variante ?? ""}|${c.prazo}|${c.entrada}|${c.baloes.map((b) => `${b.mes}:${b.valor}`).join(",")}`;
  var porCusto = (a, b) => a.custo - b.custo || a.parcela - b.parcela || a.prazo - b.prazo || (chave(a) < chave(b) ? -1 : 1);
  var porPrazo = (a, b) => a.prazo - b.prazo || a.custo - b.custo || a.parcela - b.parcela || (chave(a) < chave(b) ? -1 : 1);
  var porParcela = (a, b) => a.parcela - b.parcela || a.custo - b.custo || a.prazo - b.prazo || (chave(a) < chave(b) ? -1 : 1);
  function montarTresPropostas(e, r, config = {}) {
    const cfg = {
      ...CONFIG_PADRAO,
      ...config,
      campanhas: {
        ...CONFIG_PADRAO.campanhas,
        ...config.campanhas ?? {}
      }
    };
    cfg.campanhas = {
      taxa_subsidiada: !!cfg.campanhas.taxa_subsidiada
    };
    if (!alcancaEntradaCampanhas(e.valor, e.entrada, r)) cfg.campanhas = {
      taxa_subsidiada: false
    };
    if (!(e.valor > 0)) return {
      erro: "Informe o valor do ve\xEDculo."
    };
    if (!(e.entrada >= 0) || e.entrada >= e.valor) return {
      erro: "A entrada deve ser maior ou igual a zero e menor que o valor do ve\xEDculo."
    };
    if (!(cfg.balao_pct > 0 && cfg.balao_pct < 1)) return {
      erro: "Bal\xE3o padr\xE3o inv\xE1lido na configura\xE7\xE3o."
    };
    if (r.parcela_max !== null && !(r.parcela_max > 0)) return {
      erro: "Parcela confort\xE1vel inv\xE1lida."
    };
    const perfil = perfilDasRespostas(r);
    const max = r.parcela_max;
    const cabe = (c) => max === null || c.parcela <= max + 1e-9;
    const trocaCurta = r.troca === "sim";
    const base = opcoesMensais(e, e.entrada, true, cfg);
    if (!base.length) return {
      erro: "Nenhum plano do Simulador de Novos calcula para este valor e esta entrada."
    };
    const todas = entradasAvaliadas(e, r, perfil, cfg).flatMap((ent) => ent === e.entrada ? base : opcoesMensais(e, ent, false, cfg));
    const todasCabem = todas.filter(cabe);
    const ctx = {
      e,
      r,
      cfg,
      max,
      perfil
    };
    if (!todasCabem.length) {
      const naoBalao = todas.filter((c) => trocaCurta || c.plano !== "BALAO");
      const perto = [
        ...naoBalao.length ? naoBalao : todas
      ].sort(porParcela)[0];
      const falta = perto.parcela - max;
      return resultado(ctx, [
        prop(ctx, perto, "mais_perto", "Mais perto do que o cliente pediu", false, `Faltam ${brl0(Math.ceil(falta))} por m\xEAs para caber em ${brl0(max)}.`)
      ], todas.length, true, falta, paraCaber(ctx, trocaCurta));
    }
    const lim = max === null ? "" : ` em ${brl0(max)}`;
    const diferente = (a, b) => a.plano !== b.plano || a.prazo !== b.prazo;
    const criterio = r.prioridade === "juros" ? porPrazo : porParcela;
    const props = [];
    const pool1 = todasCabem.filter((c) => trocaCurta || c.plano !== "BALAO");
    const p1 = pool1.length ? pool1 : todasCabem;
    let c1, col1, rot1, mot1;
    if (r.prioridade === "juros") {
      c1 = [
        ...p1
      ].sort(porPrazo)[0];
      col1 = "menos_juros";
      rot1 = "Quita mais r\xE1pido";
      mot1 = `Cabe${lim} e \xE9 o menor prazo que cabe no bolso.`;
    } else {
      c1 = [
        ...p1
      ].sort(porParcela)[0];
      col1 = "leve";
      rot1 = "Parcela mais leve";
      mot1 = `\xC9 a menor parcela entre as op\xE7\xF5es que cabem${lim}.`;
      if (r.prioridade === "aplicado") {
        const fr = p1.filter((c) => !p1.some((o) => o !== c && o.parcela <= c.parcela && o.prazo <= c.prazo && (o.parcela < c.parcela || o.prazo < c.prazo))).sort(porParcela);
        if (fr.length >= 3) {
          c1 = fr[Math.floor((fr.length - 1) / 2)];
          col1 = "meio";
          rot1 = "Equil\xEDbrio";
          mot1 = `Meio-termo entre a parcela mais leve e o menor prazo que cabem${lim}.`;
        }
      }
    }
    props.push(prop(ctx, c1, col1, rot1, r.prioridade !== "avista", mot1 + (c1.plano === "BALAO" && !trocaCurta ? motivoBalao(c1) : "")));
    const okBalao = (c) => c.plano !== "BALAO" || trocaCurta || c.baloes[0]?.mes === c.prazo;
    const outroPlano = todasCabem.filter((c) => c.plano !== c1.plano && okBalao(c)).sort(criterio)[0];
    const c2 = outroPlano ?? todasCabem.filter((c) => diferente(c, c1) && okBalao(c)).sort(criterio)[0];
    if (c2) {
      const mot2 = c2.plano === "BALAO" ? `Plano Bal\xE3o em ${c2.prazo}x, que tamb\xE9m cabe${lim}.${motivoBalao(c2)}` : `${c2.plano_nome} em ${c2.prazo}x tamb\xE9m cabe${lim}.`;
      props.push(prop(ctx, c2, "outro_plano", outroPlano ? "Outro plano que cabe" : "Outro prazo que cabe", false, mot2));
    }
    const usados = props.map((p) => p);
    const livre = (c) => usados.every((u) => u.plano !== c.plano || u.prazo !== c.prazo);
    const jaCabe = todasCabem.filter((c) => c.plano !== "BALAO" && c.prazo < c1.prazo && livre(c)).sort(porPrazo)[0];
    if (jaCabe) {
      const extraJa = jaCabe.entrada - e.entrada;
      props.push(prop(ctx, jaCabe, "quitar_rapido", "Para quitar mais r\xE1pido", false, `Cabe${lim} e quita em ${jaCabe.prazo} meses.` + (extraJa > 0 ? ` Usa ${brl0(extraJa)} do dinheiro extra que o cliente disse ter.` : "")));
    } else if (max !== null) {
      const q = quitarComMaisEntrada(ctx, c1.prazo, livre);
      if (q) props.push(prop(ctx, q.c, "quitar_rapido", "Para quitar mais r\xE1pido", false, `${q.c.prazo}x cabe em ${brl0(max)} com ${brl0(q.extra)} a mais de entrada.`));
    }
    return resultado(ctx, props, todas.length, false, null, []);
  }
  function motivoBalao(c) {
    const b = c.baloes[0];
    return b ? ` O bal\xE3o de ${brl0(b.valor)} na ${b.mes}\xAA parcela${b.mes === c.prazo ? " (a \xFAltima)" : ""} pode ser quitado ou refinanciado no fim.` : "";
  }
  function quitarComMaisEntrada(ctx, prazoAtual, livre) {
    const { e, cfg, max } = ctx;
    const prazos = [
      ...new Set(opcoesMensais(e, e.entrada, false, cfg).concat(opcoesMensais(e, Math.floor((e.valor - 1) / 100) * 100, false, cfg)).filter((c) => c.plano !== "BALAO").map((c) => c.prazo))
    ].filter((p) => p < prazoAtual).sort((a, b) => b - a);
    const maxEnt = Math.floor((e.valor - 1) / 100) * 100;
    for (const alvo of prazos) {
      const cabeEm = (ent) => opcoesMensais(e, ent, false, cfg).filter((c2) => c2.prazo === alvo && c2.plano !== "BALAO" && c2.parcela <= max + 1e-9 && livre(c2));
      if (maxEnt <= e.entrada || !cabeEm(maxEnt).length) continue;
      let lo = e.entrada, hi = maxEnt;
      while (hi - lo > 100) {
        const mid = Math.round((lo + hi) / 200) * 100;
        if (mid <= lo || mid >= hi) break;
        if (cabeEm(mid).length) hi = mid;
        else lo = mid;
      }
      const c = cabeEm(hi).sort(porParcela)[0];
      return {
        c,
        extra: hi - e.entrada
      };
    }
    return null;
  }
  function paraCaber(ctx, comBalao) {
    const { e, cfg, max } = ctx;
    const out = [];
    const cabeCom = (ent) => opcoesMensais(e, ent, comBalao, cfg).filter((c) => c.parcela <= max + 1e-9);
    const maxEnt = Math.floor((e.valor - 1) / 100) * 100;
    if (maxEnt > e.entrada && cabeCom(maxEnt).length) {
      let lo = e.entrada, hi = maxEnt;
      while (hi - lo > 100) {
        const mid = Math.round((lo + hi) / 200) * 100;
        if (mid <= lo || mid >= hi) break;
        if (cabeCom(mid).length) hi = mid;
        else lo = mid;
      }
      const c = cabeCom(hi).sort(porCusto)[0];
      out.push({
        tipo: "entrada",
        valor: hi - e.entrada,
        texto: `Com ${brl0(hi - e.entrada)} a mais de entrada, em ${c.prazo} meses.`,
        proposta: prop(ctx, c, "mais_perto", "Com mais entrada", false, `Cabe em ${brl0(max)} com entrada de ${brl0(hi)}.`)
      });
    }
    const est = BALAO_PREFERIDAS.find((x) => x.meses[0] === x.prazo && x.prazo === 48) ?? BALAO_PREFERIDAS[0];
    const lim = limiteBalao(e, e.entrada, est.prazo);
    if (lim !== null) {
      const teto = Math.floor(lim / 100) * 100;
      const ok = (v) => {
        const b = balao(e, e.entrada, est.prazo, est.meses[0], est.nome, v);
        return b && b.parcela <= max + 1e-9 ? b : null;
      };
      if (teto > 0 && ok(teto)) {
        let lo = 0, hi = teto;
        while (hi - lo > 100) {
          const mid = Math.round((lo + hi) / 200) * 100;
          if (mid <= lo || mid >= hi) break;
          if (ok(mid)) hi = mid;
          else lo = mid;
        }
        const b = ok(hi);
        out.push({
          tipo: "balao",
          valor: hi,
          texto: `Com bal\xE3o de ${brl0(hi)} no fim (${est.prazo}x, bal\xE3o na ${est.meses[0]}\xAA parcela).`,
          proposta: prop(ctx, b, "mais_perto", "Com bal\xE3o no fim", false, `Cabe em ${brl0(max)} deixando ${brl0(hi)} para a \xFAltima parcela.`)
        });
      }
    }
    return out;
  }
  function prop(ctx, c, coluna, rotulo, destaque, motivo) {
    const extra = Math.max(0, c.entrada - ctx.e.entrada);
    const m = motivo + (extra > 0 && coluna !== "mais_perto" && coluna !== "quitar_rapido" ? ` Usa ${brl0(extra)} do dinheiro extra para chegar \xE0 entrada m\xEDnima da campanha.` : "");
    return {
      coluna,
      rotulo,
      motivo: m,
      plano: c.plano,
      plano_nome: c.plano_nome,
      prazo: c.prazo,
      entrada: c.entrada,
      financiado: c.financiado,
      parcela: c.parcela,
      baloes: c.baloes,
      usa_dinheiro_extra: extra,
      destaque
    };
  }
  function resultado(ctx, propostas, avaliadas, nenhuma, falta, para) {
    const renda = ctx.r.renda;
    return {
      perfil: ctx.perfil,
      propostas,
      nenhuma_cabe: nenhuma,
      falta_por_mes: falta,
      para_caber: para,
      alerta_renda: !!renda && renda > 0 && propostas.some((p) => p.parcela / renda > ctx.cfg.limite_renda),
      opcoes_avaliadas: avaliadas,
      criterios: [
        "Todas as propostas cabem na parcela confort\xE1vel; se nada couber, a mais perto e o que falta para caber.",
        "Parcela mais leve: menor parcela. Quita mais r\xE1pido: menor prazo que cabe (desempate pelo menor custo). Equil\xEDbrio: entre as duas, sem perder nas duas.",
        "Parcelas iguais \xE0s do Simulador (seguro prestamista dentro no Bal\xE3o).",
        "Rebate, valor final de venda, retorno e comiss\xE3o n\xE3o entram na escolha. O Plano Bal\xE3o n\xE3o tem prioridade.",
        "Campanhas: s\xF3 se o cliente chega a 50% de entrada (com ou sem o dinheiro extra); sem rebate, nenhuma; com rebate, a Taxa Subsidiada."
      ]
    };
  }

  // ../../Users/luis9/AppData/Local/Temp/78e0311dbf5dbb59/entrada.ts
  globalThis.NX_ASSISTENTE_REGRA = assistente_exports;
})();
