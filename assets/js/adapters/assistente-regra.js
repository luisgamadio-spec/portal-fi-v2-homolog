/* GERADO — não editar. Assistente de solução financeira: regra das 3 propostas (Simulador de Novos).
   Fonte: branch feature/brabus-intelligence-v1, supabase/functions/brabus-intelligence/engine/assistente.ts (commit 1f45060).
   Gerador: docs/assistente/gerar_regra_navegador.ts. sha256 das fontes (16 primeiros):
   engine/assistente.ts 47178923ac6d8428
   engine/novos.ts 341f5dc0aa5382ef
   engine/ofertas.ts 2005d0d02d5ddf4d
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
  var PRAZOS_COPART = [
    12,
    18,
    24,
    36,
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
  function coefFor(prazo, taxa, txCoef) {
    const obj = txCoef[String(prazo)];
    if (!obj) return null;
    const k = Object.keys(obj).find((x) => Math.abs(Number(x) - taxa) < 1e-7);
    return k !== void 0 ? obj[k] : null;
  }
  function coparticipado(modelo, venda, entrada, t) {
    const m = t.copartModels.find((x) => x.name === modelo);
    if (!m) return {
      erro: `Modelo fora do Plano Coparticipado. Modelos v\xE1lidos: ${t.copartModels.map((x) => x.name).join(", ")}.`
    };
    if (!(venda > 0)) return {
      erro: "Informe o valor de venda."
    };
    if (!(entrada >= venda * m.entry)) return {
      erro: `A entrada m\xEDnima permitida para este plano \xE9 de ${pct(m.entry)}.`
    };
    const fin = Math.max(venda - entrada, 0);
    const termos = PRAZOS_COPART.map((p) => {
      const taxa = m.rates[String(p)];
      const coef = coefFor(p, taxa, t.copartTxCoef);
      const acrescimo = p <= 24 ? 0.0411 : 0.0622;
      return {
        prazo: p,
        taxa,
        parcela: coef ? fin * (1 + acrescimo) * coef : null
      };
    });
    const total = fin * m.rebate;
    const brabus = total * m.brabus;
    return {
      modelo: m.name,
      entradaMinima: m.entry,
      financiado: fin,
      termos,
      rebateTotal: total,
      rebateBrabus: brabus,
      rebateHpe: total * m.hpe,
      valorFinalVenda: Math.max(venda - brabus, 0)
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
  function normalizaModelo(s) {
    return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
  }
  function casaModelo(modelo, versao, nomes) {
    const alvo = normalizaModelo(`${modelo} ${versao ?? ""}`);
    return nomes.find((n) => normalizaModelo(n) === alvo) ?? null;
  }

  // supabase/functions/brabus-intelligence/engine/assistente.ts
  var ENTRADA_MIN_CAMPANHAS = 0.5;
  function alcancaEntradaCampanhas(valor, entrada, r) {
    if (!(valor > 0)) return false;
    const extra = r.dinheiro === "sim" && r.dinheiro_extra > 0 ? r.dinheiro_extra : 0;
    return entrada / valor >= ENTRADA_MIN_CAMPANHAS - 1e-12 || extra > 0 && (entrada + extra) / valor >= ENTRADA_MIN_CAMPANHAS - 1e-12;
  }
  function campanhasPermitidas(rebate, bonusTradeIn) {
    if (!rebate) return {
      taxa_subsidiada: false,
      coparticipado: false
    };
    return {
      taxa_subsidiada: true,
      coparticipado: !bonusTradeIn
    };
  }
  var CONFIG_PADRAO = {
    balao_pct: 0.3,
    limite_renda: 0.3,
    campanhas: {
      taxa_subsidiada: false,
      coparticipado: false
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
    if (cfg.campanhas.coparticipado) {
      const nome = casaModelo(e.modelo, e.versao, e.tabelas.copartModels.map((m) => m.name));
      if (nome) {
        const cp = coparticipado(nome, e.valor, entrada, e.tabelas);
        if (!ehErro(cp)) {
          for (const x of cp.termos) if (x.parcela) {
            out.push(cand({
              plano: "COPARTICIPADO",
              plano_nome: "Plano Coparticipado",
              prazo: x.prazo,
              entrada,
              financiado: cp.financiado,
              parcela: x.parcela,
              baloes: []
            }));
          }
        }
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
    if (cfg.campanhas.coparticipado) {
      const cp = casaModelo(e.modelo, e.versao, e.tabelas.copartModels.map((m) => m.name));
      if (cp) minimos.push(e.tabelas.copartModels.find((m) => m.name === cp).entry);
    }
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
    if (!alcancaEntradaCampanhas(e.valor, e.entrada, r)) cfg.campanhas = {
      taxa_subsidiada: false,
      coparticipado: false
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
    const comBalao = r.troca === "sim";
    const base = opcoesMensais(e, e.entrada, comBalao, cfg);
    if (!base.length) return {
      erro: "Nenhum plano do Simulador de Novos calcula para este valor e esta entrada."
    };
    const todas = entradasAvaliadas(e, r, perfil, cfg).flatMap((ent) => ent === e.entrada ? base : opcoesMensais(e, ent, false, cfg));
    const baseCabe = base.filter(cabe), todasCabem = todas.filter(cabe);
    const ctx = {
      e,
      r,
      cfg,
      max,
      perfil
    };
    if (!todasCabem.length) {
      const perto = [
        ...todas
      ].sort(porParcela)[0];
      const falta = perto.parcela - max;
      return resultado(ctx, [
        prop(ctx, perto, "mais_perto", "Mais perto do que o cliente pediu", false, `Faltam ${brl0(Math.ceil(falta))} por m\xEAs para caber em ${brl0(max)}.`)
      ], todas.length, true, falta, paraCaber(ctx, comBalao));
    }
    const usadas = /* @__PURE__ */ new Set();
    const pega = (lista) => {
      const c = lista.find((x) => !usadas.has(chave(x))) ?? null;
      if (c) usadas.add(chave(c));
      return c;
    };
    const menosJuros = pega([
      ...todasCabem
    ].sort(porPrazo));
    const levePool = baseCabe.length ? baseCabe : todasCabem;
    const maisLeve = [
      ...levePool
    ].sort(porParcela)[0];
    if (chave(maisLeve) === chave(menosJuros) || menosJuros.parcela <= maisLeve.parcela + 1e-9) {
      return dominante(ctx, todasCabem, levePool, menosJuros, todas.length);
    }
    const leve = pega([
      ...levePool
    ].sort(porParcela));
    let meio = null, rotuloMeio = "Equil\xEDbrio";
    if (leve) {
      const livres = levePool.filter((c) => !usadas.has(chave(c)));
      const fronteira = livres.filter((c) => !levePool.some((o) => o !== c && o.parcela <= c.parcela && o.prazo <= c.prazo && (o.parcela < c.parcela || o.prazo < c.prazo))).filter((c) => c.parcela > leve.parcela && c.parcela < menosJuros.parcela && c.prazo < leve.prazo && c.prazo > menosJuros.prazo).sort(porParcela);
      if (fronteira.length) meio = pega([
        fronteira[Math.floor((fronteira.length - 1) / 2)]
      ]);
      if (!meio && leve.plano === "BALAO" && menosJuros.plano === "BALAO") {
        meio = pega(livres.filter((c) => c.plano !== "BALAO").sort(porPrazo));
        if (meio) rotuloMeio = "Sem bal\xE3o";
      }
    }
    const meioEquilibrio = !!meio && rotuloMeio === "Equil\xEDbrio";
    const destaque = {
      PARCELA: meioEquilibrio ? "meio" : "menos_juros",
      CUSTO_TOTAL: "menos_juros",
      LIQUIDEZ: meioEquilibrio ? "meio" : "menos_juros",
      A_VISTA: null
    };
    const lim = max === null ? "" : ` em ${brl0(max)}`;
    const props = [];
    if (leve) props.push(prop(ctx, leve, "leve", "Parcela mais leve", destaque[perfil] === "leve", `\xC9 a menor parcela entre as op\xE7\xF5es que cabem${lim}.`));
    if (meio) props.push(prop(ctx, meio, "meio", rotuloMeio, destaque[perfil] === "meio", rotuloMeio === "Sem bal\xE3o" ? `Sem bal\xE3o no fim, com parcela que cabe${lim}.` : `Meio-termo: parcela menor que a de quem quita mais r\xE1pido e prazo menor que o da mais leve.`));
    props.push(prop(ctx, menosJuros, "menos_juros", "Quita mais r\xE1pido", destaque[perfil] === "menos_juros", `Cabe${lim} e \xE9 o menor prazo que cabe no bolso.`));
    return resultado(ctx, props, todas.length, false, null, []);
  }
  function dominante(ctx, todasCabem, baseCabe, melhor, avaliadas) {
    const campanha = melhor.plano === "TAXA_SUBSIDIADA" || melhor.plano === "COPARTICIPADO";
    const outra = (c) => melhor.plano === "BALAO" ? c.plano !== "BALAO" : campanha ? c.plano === "LINEAR" || c.plano === "BALAO" : c.plano !== melhor.plano;
    const prefixo = melhor.plano === "BALAO" ? "Sem bal\xE3o" : campanha ? "Sem campanha" : "Outro plano";
    const lim = ctx.max === null ? "" : ` em ${brl0(ctx.max)}`;
    const props = [
      prop(ctx, melhor, "melhor", "Mais leve e quita mais r\xE1pido", ctx.perfil !== "A_VISTA", `Cabe${lim} com a menor parcela e tamb\xE9m o menor prazo entre as op\xE7\xF5es.`)
    ];
    const altLeve = baseCabe.filter(outra).sort(porParcela)[0];
    const altJuros = todasCabem.filter(outra).sort(porPrazo)[0];
    if (altLeve) props.push(prop(ctx, altLeve, "leve", `${prefixo} \xB7 parcela mais leve`, false, `${prefixo}: a menor parcela que cabe${lim}.`));
    if (altJuros && (!altLeve || chave(altJuros) !== chave(altLeve))) props.push(prop(ctx, altJuros, "menos_juros", `${prefixo} \xB7 quita mais r\xE1pido`, false, `${prefixo}: cabe${lim} e \xE9 o menor prazo que cabe no bolso.`));
    if (props.length === 1) {
      const resto = todasCabem.filter((c) => chave(c) !== chave(melhor)).sort(porPrazo)[0];
      if (resto) props.push(prop(ctx, resto, "menos_juros", "Outra op\xE7\xE3o", false, `Tamb\xE9m cabe${lim}.`));
    }
    return resultado(ctx, props, avaliadas, false, null, []);
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
    const m = motivo + (extra > 0 && coluna !== "mais_perto" ? ` Usa ${brl0(extra)} do dinheiro extra para chegar \xE0 entrada m\xEDnima da campanha.` : "");
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
        "Parcelas iguais \xE0s do Simulador (seguro prestamista dentro no Bal\xE3o e no Coparticipado).",
        "Rebate, valor final de venda, retorno e comiss\xE3o n\xE3o entram na escolha. O Plano Bal\xE3o n\xE3o tem prioridade.",
        "Campanhas: s\xF3 se o cliente chega a 50% de entrada (com ou sem o dinheiro extra); sem rebate, nenhuma; com b\xF4nus de trade-in, s\xF3 a Taxa Subsidiada."
      ]
    };
  }

  // ../../Users/luis9/AppData/Local/Temp/66a404e3e4982b2d/entrada.ts
  globalThis.NX_ASSISTENTE_REGRA = assistente_exports;
})();
