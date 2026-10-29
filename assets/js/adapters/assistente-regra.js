/* GERADO — não editar. Assistente de solução financeira: regra das 3 propostas (Simulador de Novos).
   Fonte: branch feature/brabus-intelligence-v1, supabase/functions/brabus-intelligence/engine/assistente.ts (commit 4d20f3d).
   Gerador: docs/assistente/gerar_regra_navegador.ts. sha256 das fontes (16 primeiros):
   engine/assistente.ts baba0084348a38c9
   engine/novos.ts 341f5dc0aa5382ef
   engine/ofertas.ts 2005d0d02d5ddf4d
   engine/comum.ts 2fd6c72c675cfeb1
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
    AVISO_IOF_LINEAR: () => AVISO_IOF_LINEAR,
    CONFIG_PADRAO: () => CONFIG_PADRAO,
    baseLinearTetoLegal: () => baseLinearTetoLegal,
    cetEstimado: () => cetEstimado,
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
  function baseInternaSemSeguro(fin) {
    const { CAD, REG, IOF } = BASE_BALAO;
    return (Math.max(0, fin) + CAD + REG) / (1 - IOF);
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
  var CONFIG_PADRAO = {
    balao_pct: 0.3,
    limite_renda: 0.3,
    rendimento_aa: null,
    campanhas_liberadas: false
  };
  function perfilDasRespostas(r) {
    return {
      parcela: "PARCELA",
      juros: "CUSTO_TOTAL",
      aplicado: "LIQUIDEZ",
      avista: "A_VISTA"
    }[r.prioridade];
  }
  function cetEstimado(financiado, pagamentos) {
    if (!(financiado > 0) || !pagamentos.length) return null;
    const vp = (i) => pagamentos.reduce((s, p) => s + p.valor / Math.pow(1 + i, p.mes), 0) - financiado;
    if (vp(0) < 0) return null;
    let lo = 0, hi = 1;
    for (let k = 0; k < 200; k++) {
      const mid = (lo + hi) / 2;
      if (vp(mid) > 0) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }
  var AVISO_IOF_LINEAR = "Parcela calculada com IOF pelo teto legal; pode ficar um pouco abaixo do simulador.";
  var IOF_BASE = 38e-4;
  var IOF_DIARIO = 82e-6;
  var IOF_TETO_DIAS = 365;
  function baseLinearTetoLegal(fin, prazo, comSeguro) {
    const fatorIof = IOF_BASE + IOF_DIARIO * Math.min(Math.max(0, prazo) * 30, IOF_TETO_DIAS);
    return (Math.max(0, fin) * (comSeguro ? 1 + BASE_BALAO.ADICIONAL : 1) + BASE_BALAO.CAD + BASE_BALAO.REG) / (1 - fatorIof);
  }
  var aa = (am) => am === null ? null : Math.pow(1 + am, 12) - 1;
  var ehErro = (x) => !!x && typeof x === "object" && "erro" in x;
  function cand(c, valor) {
    const pagamentos = [];
    for (let m = 1; m <= c.prazo; m++) pagamentos.push({
      mes: m,
      valor: c.parcela
    });
    for (const b of c.baloes) pagamentos.push({
      mes: b.mes,
      valor: b.valor
    });
    const total_pago = c.entrada + pagamentos.reduce((s, p) => s + p.valor, 0);
    return {
      ...c,
      pagamentos,
      total_pago,
      juros: total_pago - valor,
      cet_am: cetEstimado(c.financiado, pagamentos)
    };
  }
  function baloesSemSeguro(e, entrada, cfg) {
    const out = [];
    const fin = e.valor - entrada;
    for (const est of BALAO_PREFERIDAS) {
      const base = balaoTradicional(e.valor, entrada, est.prazo, [], e.tabelas);
      if (ehErro(base)) continue;
      const valorBalao = Math.min(Math.round(fin * cfg.balao_pct), Math.floor(base.limiteBaloes));
      if (!(valorBalao > 0)) continue;
      const bs = [
        {
          mes: est.meses[0],
          valor: valorBalao
        }
      ];
      const sim = balaoTradicional(e.valor, entrada, est.prazo, bs, e.tabelas);
      if (ehErro(sim)) continue;
      const i = taxaInterna(sim.taxa);
      const vpBaloes = bs.reduce((s, b) => s + b.valor / Math.pow(1 + i, b.mes), 0);
      const saldo = baseInternaSemSeguro(fin) - vpBaloes;
      if (saldo <= 0) continue;
      const parcela = saldo / fatorPrice(i, est.prazo);
      const seguro = {
        produto: "SEGURO_PRESTAMISTA",
        valor_financiado: baseInterna(fin) - baseInternaSemSeguro(fin),
        parcela_com_seguro: sim.parcela,
        acrescimo_parcela: sim.parcela - parcela,
        acrescimo_total: (sim.parcela - parcela) * est.prazo
      };
      out.push(cand({
        plano: "BALAO",
        plano_nome: `Plano Bal\xE3o \u2014 ${est.nome}`,
        prazo: est.prazo,
        entrada,
        financiado: fin,
        parcela,
        baloes: bs,
        taxa: sim.taxa,
        seguro,
        aviso: null
      }, e.valor));
    }
    return out;
  }
  function opcoesMensais(e, entrada, comBalao, cfg) {
    const out = [];
    const lin = linear(e.valor, entrada, e.tabelas);
    if (!ehErro(lin)) {
      for (const it of lin.itens) if (it.parcela && it.taxa !== null) {
        const coef = coefLinear(it.taxa, it.prazo);
        const parcela = baseLinearTetoLegal(lin.financiado, it.prazo, false) * coef;
        const comSeguro = baseLinearTetoLegal(lin.financiado, it.prazo, true) * coef;
        const seguro = {
          produto: "SEGURO_PRESTAMISTA",
          valor_financiado: baseLinearTetoLegal(lin.financiado, it.prazo, true) - baseLinearTetoLegal(lin.financiado, it.prazo, false),
          parcela_com_seguro: comSeguro,
          acrescimo_parcela: comSeguro - parcela,
          acrescimo_total: (comSeguro - parcela) * it.prazo
        };
        out.push(cand({
          plano: "LINEAR",
          plano_nome: "Financiamento Linear",
          prazo: it.prazo,
          entrada,
          financiado: lin.financiado,
          parcela,
          baloes: [],
          taxa: it.taxa,
          seguro,
          aviso: it.prazo * 30 > 365 ? AVISO_IOF_LINEAR : null
        }, e.valor));
      }
    }
    if (comBalao) out.push(...baloesSemSeguro(e, entrada, cfg));
    if (cfg.campanhas_liberadas) {
      const sub = taxasSubsidiadas(e.valor, entrada, 0, e.tabelas);
      if (!ehErro(sub)) for (const l of sub.linhas) {
        out.push(cand({
          plano: "TAXA_SUBSIDIADA",
          plano_nome: `Taxa Subsidiada ${(l.taxa * 100).toFixed(2).replace(".", ",")}%`,
          prazo: l.prazo,
          // Acima de 24x o Simulador soma R$ 2.500 de tarifa do banco (obrigatória): fica na conta e entra no CET.
          entrada,
          financiado: sub.financiado,
          parcela: l.parcela,
          baloes: [],
          taxa: l.taxa,
          seguro: null,
          aviso: null
        }, e.valor));
      }
      const nome = casaModelo(e.modelo, e.versao, e.tabelas.copartModels.map((m) => m.name));
      if (nome) {
        const cp = coparticipado(nome, e.valor, entrada, e.tabelas);
        if (!ehErro(cp)) {
          for (const x of cp.termos) if (x.parcela) {
            const acr = x.prazo <= 24 ? 0.0411 : 0.0622;
            const parcela = x.parcela / (1 + acr);
            const seguro = {
              produto: "SEGURO_PRESTAMISTA",
              valor_financiado: cp.financiado * acr,
              parcela_com_seguro: x.parcela,
              acrescimo_parcela: x.parcela - parcela,
              acrescimo_total: (x.parcela - parcela) * x.prazo
            };
            out.push(cand({
              plano: "COPARTICIPADO",
              plano_nome: "Plano Coparticipado",
              prazo: x.prazo,
              entrada,
              financiado: cp.financiado,
              parcela,
              baloes: [],
              taxa: x.taxa,
              seguro,
              aviso: null
            }, e.valor));
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
    if (!cfg.campanhas_liberadas || perfil === "LIQUIDEZ" || r.dinheiro !== "sim" || !(r.dinheiro_extra > 0)) return out;
    const minimos = [
      0.5
    ];
    const cp = casaModelo(e.modelo, e.versao, e.tabelas.copartModels.map((m) => m.name));
    if (cp) minimos.push(e.tabelas.copartModels.find((m) => m.name === cp).entry);
    for (const p of minimos) {
      const ent = Math.ceil(e.valor * p);
      if (ent > e.entrada && ent <= e.entrada + r.dinheiro_extra && ent < e.valor) out.push(ent);
    }
    return [
      ...new Set(out)
    ];
  }
  var chave = (c) => `${c.plano}|${c.plano_nome}|${c.prazo}|${c.entrada}|${c.baloes.map((b) => `${b.mes}:${b.valor}`).join(",")}`;
  var porTotal = (a, b) => a.total_pago - b.total_pago || a.parcela - b.parcela || a.prazo - b.prazo || (chave(a) < chave(b) ? -1 : 1);
  var porParcela = (a, b) => a.parcela - b.parcela || a.total_pago - b.total_pago || a.prazo - b.prazo || (chave(a) < chave(b) ? -1 : 1);
  function montarTresPropostas(e, r, config = {}) {
    const cfg = {
      ...CONFIG_PADRAO,
      ...config
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
    const perfil = perfilDasRespostas(r);
    const cabe = (c) => r.parcela_max === null || c.parcela <= r.parcela_max + 1e-9;
    const base = opcoesMensais(e, e.entrada, r.troca === "sim", cfg);
    if (!base.length) return {
      erro: "Nenhum plano do Simulador de Novos calcula para este valor e esta entrada."
    };
    const todas = entradasAvaliadas(e, r, perfil, cfg).flatMap((ent) => ent === e.entrada ? base : opcoesMensais(e, ent, false, cfg));
    const usadas = /* @__PURE__ */ new Set();
    const pega = (lista) => {
      const c = lista.find((x) => !usadas.has(chave(x))) ?? null;
      if (c) usadas.add(chave(c));
      return c;
    };
    const jPool = todas.filter(cabe);
    const menosJuros = pega([
      ...jPool.length ? jPool : todas
    ].sort(porTotal));
    const maisLeveBase = [
      ...base
    ].sort(porParcela)[0];
    if (menosJuros.entrada === e.entrada && menosJuros.parcela <= maisLeveBase.parcela + 1e-9) {
      return dominante(e, r, cfg, perfil, todas, base, menosJuros, cabe);
    }
    const leve = pega([
      ...base
    ].sort(porParcela));
    let meio = null, rotuloMeio = "Equil\xEDbrio";
    if (leve) {
      const naFaixa = base.filter((c) => cabe(c) && !usadas.has(chave(c)));
      const fronteira = naFaixa.filter((c) => !base.some((o) => o !== c && o.parcela <= c.parcela && o.total_pago <= c.total_pago && (o.parcela < c.parcela || o.total_pago < c.total_pago))).filter((c) => c.parcela > leve.parcela && c.parcela < menosJuros.parcela && c.total_pago < leve.total_pago && c.total_pago > menosJuros.total_pago).sort(porParcela);
      if (fronteira.length) meio = pega([
        fronteira[Math.floor((fronteira.length - 1) / 2)]
      ]);
      if (!meio && leve.plano === "BALAO" && menosJuros.plano === "BALAO") {
        meio = pega(naFaixa.filter((c) => c.plano !== "BALAO").sort(porTotal));
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
    const propostas = [];
    if (leve) propostas.push(montaProposta(e, r, cfg, cabe, leve, "leve", "Parcela mais leve", destaque[perfil] === "leve"));
    if (meio) propostas.push(montaProposta(e, r, cfg, cabe, meio, "meio", rotuloMeio, destaque[perfil] === "meio"));
    propostas.push(montaProposta(e, r, cfg, cabe, menosJuros, "menos_juros", "Menos juros", destaque[perfil] === "menos_juros"));
    return resultado(e, cfg, perfil, propostas, todas.length, !base.some(cabe), leve ?? menosJuros, menosJuros);
  }
  function dominante(e, r, cfg, perfil, todas, base, melhor, cabe) {
    const campanha = melhor.plano === "TAXA_SUBSIDIADA" || melhor.plano === "COPARTICIPADO";
    const outra = (c) => melhor.plano === "BALAO" ? c.plano !== "BALAO" : campanha ? c.plano === "LINEAR" || c.plano === "BALAO" : c.plano !== melhor.plano;
    const prefixo = melhor.plano === "BALAO" ? "Sem bal\xE3o" : campanha ? "Sem campanha" : "Outro plano";
    const altBase = base.filter(outra), altTodas = todas.filter(outra);
    const propostas = [
      montaProposta(e, r, cfg, cabe, melhor, "melhor", "Mais leve e menos juros", perfil !== "A_VISTA")
    ];
    const altLeve = [
      ...altBase
    ].sort(porParcela)[0];
    const jPool = altTodas.filter(cabe);
    const altJuros = [
      ...jPool.length ? jPool : altTodas
    ].sort(porTotal)[0];
    if (altLeve) propostas.push(montaProposta(e, r, cfg, cabe, altLeve, "leve", `${prefixo} \xB7 parcela mais leve`, false));
    if (altJuros && (!altLeve || chave(altJuros) !== chave(altLeve))) propostas.push(montaProposta(e, r, cfg, cabe, altJuros, "menos_juros", `${prefixo} \xB7 menos juros`, false));
    if (propostas.length === 1) {
      const resto = todas.filter((c) => chave(c) !== chave(melhor)).sort(porTotal)[0];
      if (resto) propostas.push(montaProposta(e, r, cfg, cabe, resto, "menos_juros", cabe(resto) ? "Outra op\xE7\xE3o \xB7 menos juros" : "Acima da parcela confort\xE1vel \xB7 menos juros", false));
    }
    return resultado(e, cfg, perfil, propostas, todas.length, !base.some(cabe), melhor, melhor);
  }
  function montaProposta(e, r, cfg, cabe, c, coluna, rotulo, destaque) {
    const rm = cfg.rendimento_aa === null ? null : Math.pow(1 + cfg.rendimento_aa, 1 / 12) - 1;
    const vp = rm === null ? null : c.entrada + c.pagamentos.reduce((s, p) => s + p.valor / Math.pow(1 + rm, p.mes), 0);
    const rendaPct = r.renda && r.renda > 0 ? c.parcela / r.renda : null;
    return {
      coluna,
      rotulo,
      plano: c.plano,
      plano_nome: c.plano_nome,
      prazo: c.prazo,
      entrada: c.entrada,
      financiado: c.financiado,
      parcela: c.parcela,
      baloes: c.baloes,
      taxa_am: c.taxa,
      taxa_aa: aa(c.taxa),
      cet_am: c.cet_am,
      cet_aa: aa(c.cet_am),
      total_pago: c.total_pago,
      juros: c.juros,
      a_vista: {
        valor: e.valor,
        diferenca_total: c.total_pago - e.valor,
        custo_valor_presente: vp,
        diferenca_valor_presente: vp === null ? null : vp - e.valor
      },
      alertas: {
        acima_da_parcela_max: !cabe(c),
        renda_pct: rendaPct,
        renda_alta: rendaPct !== null && rendaPct > cfg.limite_renda
      },
      seguro: c.seguro,
      aviso: c.aviso,
      usa_dinheiro_extra: Math.max(0, c.entrada - e.entrada),
      destaque
    };
  }
  function resultado(e, cfg, perfil, propostas, avaliadas, nenhumaCabe, ref, menosJuros) {
    return {
      perfil,
      propostas,
      opcoes_avaliadas: avaliadas,
      nenhuma_cabe: nenhumaCabe,
      a_vista_mais_barata: cfg.rendimento_aa === null ? null : propostas.every((p) => (p.a_vista.custo_valor_presente ?? 0) > e.valor),
      diferencas: {
        leve_para_menos_juros: {
          parcela: menosJuros.parcela - ref.parcela,
          total_pago: ref.total_pago - menosJuros.total_pago
        }
      },
      criterios: [
        "Parcela mais leve: menor parcela mensal com a entrada digitada.",
        "Menos juros: menor total pago entre as op\xE7\xF5es que cabem na parcela confort\xE1vel.",
        "Equil\xEDbrio: op\xE7\xE3o que nenhuma outra supera ao mesmo tempo em parcela e em total pago, entre as duas pontas.",
        "Se uma op\xE7\xE3o vence nas duas pontas, ela aparece sozinha em destaque, com alternativas de outra estrutura.",
        "Rebate, valor final de venda, retorno e comiss\xE3o n\xE3o entram na escolha. O Plano Bal\xE3o n\xE3o tem prioridade.",
        "Seguro prestamista fora das propostas; oferecido \xE0 parte, com aceite pr\xF3prio do cliente.",
        "Linear com IOF pelo teto legal de 365 dias (o Simulador n\xE3o limita).",
        "CET estimado; o oficial vem no contrato do banco."
      ]
    };
  }

  // ../../Users/luis9/AppData/Local/Temp/e609411428f4665e/entrada.ts
  globalThis.NX_ASSISTENTE_REGRA = assistente_exports;
})();
