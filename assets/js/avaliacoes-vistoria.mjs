/* PORTAL-NEXT V2 — Avaliações de Seminovos: vistoria 3D (Fase 2, 28/10/2026).
   Carro desenhado por código (sem arquivo de modelo): silhueta lateral em curvas por carroceria,
   volume gerado a partir dela e peças recortadas da própria superfície (cada peça é uma malha
   separada que acende ao tocar e fica com a cor da pior gravidade marcada).
   GERADO por docs/avaliacoes/fase2/vistoria3d_v3/gera_modulo.py a partir do protótipo aprovado
   (prototipo3.html) — ajustes de desenho vão no protótipo e este arquivo é gerado de novo.
   three.js r160 fica em vendor/three-0.160.0 e só é baixado quando a vistoria abre. */

let THREE, mergeGeometries, LineSegments2, LineSegmentsGeometry, LineMaterial, carregando = null;
function carregar() {
  if (!carregando) {
    const v = new URL('./vendor/three-0.160.0/', import.meta.url);
    carregando = Promise.all(['three.module.min.js', 'BufferGeometryUtils.js', 'LineSegments2.js', 'LineSegmentsGeometry.js', 'LineMaterial.js']
      .map(f => import(new URL(f, v).href))).then(([t, u, l2, lg, lm]) => {
        THREE = t; mergeGeometries = u.mergeGeometries; LineSegments2 = l2.LineSegments2;
        LineSegmentsGeometry = lg.LineSegmentsGeometry; LineMaterial = lm.LineMaterial;
      }).catch(e => { carregando = null; throw e; });
  }
  return carregando;
}

const C = {
  HATCH: { nome: 'Hatch', L: 3.86, W: 1.74, R: .31, eixos: [-1.2, 1.24], tumble: .3, coroa: .045,
    baixo: [[-1.93,.42],[-1.76,.27],[-1.45,.22],[1.5,.22],[1.78,.28],[1.93,.40]],
    cinta: [[-1.93,.9],[-1.6,1.02],[-1.0,.99],[0.75,.95],[1.05,.92],[1.5,.85],[1.93,.75]],
    teto: [[-1.87,null],[-1.72,1.1],[-1.42,1.3],[-0.98,1.41],[-0.4,1.45],[0.05,1.45],[0.5,1.24],[0.98,null]],
    planta: { pF: 3.8, pR: 5, rakeF: .2, chinF: .06, rakeR: .16, chinR: .05, yRake: .55, yChin: .36 },
    pc: [.48, .52], far: [.6, .71], lan: [.66, .84], lanW: .3, grade: .42,
    cortes: [.95, -.12, -.98],
    janelas: [[-.08, .96, 'da porta dianteira', 1], [-.94, -.16, 'da porta traseira', 1], [-1.24, -1.02, 'lateral traseiro', 0]] },
  SEDAN: { nome: 'Sedan', L: 4.62, W: 1.8, R: .32, eixos: [-1.37, 1.36], tumble: .32, coroa: .045, sedan: true,
    baixo: [[-2.31,.44],[-2.1,.28],[-1.75,.23],[1.75,.23],[2.08,.29],[2.31,.42]],
    cinta: [[-2.31,.9],[-2.05,.97],[-1.4,1.0],[0.75,1.0],[1.15,.95],[1.75,.87],[2.31,.76]],
    teto: [[-1.6,null],[-1.3,1.15],[-1.0,1.33],[-0.6,1.43],[0.1,1.46],[0.45,1.42],[0.8,1.22],[1.18,null]],
    planta: { pF: 4.5, pR: 5, rakeF: .2, chinF: .07, rakeR: .12, chinR: .06, yRake: .55, yChin: .38 },
    pc: [.52, .54], far: [.62, .73], lan: [.76, .9], lanW: .36, grade: .44,
    cortes: [1.02, -.06, -1.06],
    janelas: [[-.02, 1.12, 'da porta dianteira', 1], [-1.0, -.1, 'da porta traseira', 1], [-1.4, -1.06, 'lateral traseiro', 0]] },
  // SUV moderno: mais alto do chão, cintura subindo para trás, teto caindo no fim (coluna traseira inclinada), molduras escuras nas rodas
  SUV: { nome: 'SUV', L: 4.5, W: 1.86, R: .38, eixos: [-1.35, 1.37], tumble: .31, coroa: .04, trilhos: true, molduras: true,
    baixo: [[-2.25,.6],[-2.02,.5],[-1.75,.46],[1.75,.46],[2.0,.52],[2.25,.6]],
    cinta: [[-2.25,1.16],[-2.0,1.27],[-1.5,1.26],[-0.4,1.18],[0.8,1.11],[1.2,1.07],[1.8,1.02],[2.25,.98]],
    teto: [[-2.2,null],[-2.06,1.5],[-1.8,1.62],[-1.3,1.69],[-0.2,1.75],[0.45,1.74],[0.95,1.44],[1.28,null]],
    planta: { pF: 3.8, pR: 6, rakeF: .26, chinF: .1, rakeR: .1, chinR: .08, yRake: .65, yChin: .55 },
    pc: [.72, .76], far: [.84, .94], lan: [.96, 1.08], lanW: .34, grade: .5,
    cortes: [1.0, -.1, -1.08], densas: [[-2.25, -1.95, .004]],
    janelas: [[-.06, 1.18, 'da porta dianteira', 1], [-1.02, -.14, 'da porta traseira', 1], [-1.62, -1.1, 'lateral traseiro', 0]] },
  PICKUP: { nome: 'Pickup', L: 5.32, W: 1.88, R: .39, eixos: [-1.66, 1.6], tumble: .3, coroa: .03, cacamba: [-.86, .76],
    baixo: [[-2.66,.62],[-2.42,.47],[-2.1,.44],[2.0,.44],[2.36,.5],[2.66,.6]],
    cinta: [[-2.66,1.1],[-0.9,1.12],[0.8,1.14],[1.3,1.12],[2.0,1.09],[2.66,1.06]],
    teto: [[-.86,null],[-.83,1.72],[-.76,1.86],[0.2,1.9],[0.6,1.85],[1.0,1.52],[1.42,null]],
    planta: { pF: 5, pR: 12, rakeF: .16, chinF: .1, rakeR: 0, chinR: .08, yRake: .7, yChin: .5 },
    pc: [.72, .72], far: [.84, .98], lan: [.76, 1.0], lanW: .18, grade: .6,
    cortes: [1.06, .06, -.86], densas: [[-.94, -.74, .004]],
    janelas: [[.1, 1.25, 'da porta dianteira', 1], [-.78, .02, 'da porta traseira', 1]] }
};

const COR_GRAV = { LEVE: 0xf5c518, MEDIA: 0xff8c1a, GRAVE: 0xe3262f };
// carro escuro em cor única (pintura lisa, reflexo suave), vidro azul-grafite, linhas das peças em cinza-claro
const PINTURA = 0x50535b;
const COR = { lataria: PINTURA, 'para-choque': PINTURA, retrovisor: PINTURA, estrutura: PINTURA, vidro: 0x263241, farol: 0xe3e8ef, lanterna: 0xb8242d,
  grade: 0x141518, roda: 0xc3c8cf, pneu: 0x1c1d20, baixo: 0x0c0d0f, trilho: 0x2a2c31, moldura: 0x18191c };
const MAT = { lataria: [.3, .36], 'para-choque': [.3, .36], retrovisor: [.3, .36], estrutura: [.3, .36], vidro: [.2, .62], farol: [.2, .3], lanterna: [.2, .32],
  grade: [.3, .55], roda: [.8, .3], pneu: [0, .92], baixo: [0, .9], trilho: [.5, .45], moldura: [0, .75] };
const COR_LINHA = 0xe4e7ec, TOQUE = 0x39b6ff;

for (const c of Object.values(C)) {
  c.W2 = c.W / 2; c.xf = c.L / 2; c.xr = -c.L / 2; c.Ra = c.R + .06;
  c.belt = curva(c.cinta); c.base = curva(c.baixo);
  const tp = c.teto.map(([x, y]) => [x, y ?? c.belt(x) - .005]);
  c.roof = curva(tp); c.roofX = [tp[0][0], tp[tp.length - 1][0]]; c.tetoMax = Math.max(...tp.map(p => p[1]));
  c.xBF = c.eixos[1] + c.Ra; c.xBR = c.eixos[0] - c.Ra;
}

// ---------------------------------------------------------------- curvas e seções
function curva(pts) {   // interpolação cúbica monótona (Fritsch–Carlson): curva suave que não "estoura" entre os pontos
  const n = pts.length, xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return x => {
    if (x <= xs[0]) return ys[0]; if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}
const clamp01 = v => Math.max(0, Math.min(1, v));
function alturaTeto(c, x) {   // linha de cima da cabine (na caçamba: o assoalho)
  if (c.cacamba && x < c.cacamba[0]) { const a = c.cacamba[0] - .04; return x <= a ? c.cacamba[1] : c.cacamba[1] + (c.belt(x) - c.cacamba[1]) * (x - a) / .04; }
  const b = c.belt(x); return x < c.roofX[0] || x > c.roofX[1] ? b : Math.max(b, c.roof(x));
}
function bordaBaixo(c, x) {   // borda inferior da lateral, com as caixas de roda recortadas
  let y = c.base(x);
  for (const e of c.eixos) { const d = x - e; if (Math.abs(d) < c.Ra) y = Math.max(y, c.R + Math.sqrt(c.Ra * c.Ra - d * d)); }
  return y;
}
function planta(c, x, y) {   // largura relativa nas pontas (arredonda a frente e a traseira; a parte de cima recua)
  const p = c.planta, cima = Math.pow(clamp01((y - p.yRake) / 1.1), 1.3), baixo = clamp01((p.yChin - y) / .25);
  const xe = x >= 0 ? c.xf - p.rakeF * cima - p.chinF * baixo : c.xr + p.rakeR * cima + p.chinR * baixo;
  const t = x / xe; if (t >= 1) return 0; if (t <= 0) return 1;
  const e = x >= 0 ? p.pF : p.pR; return Math.pow(1 - Math.pow(t, e), 1 / e);
}
// meia seção (z ≥ 0), 18 linhas de baixo para cima: 0–2 assoalho e caixa de roda; 3–9 lateral (soleira, linha do para-choque,
// faixa dos faróis/lanternas, ombro); 10–14 cabine (base do vidro → teto, afinando para cima); 15–17 arco do teto até o centro
function secao(c, x) {
  const W2 = c.W2, wb = W2, base = c.base(x), lo = bordaBaixo(c, x), yb = c.belt(x), yt = alturaTeto(c, x), g = yt - yb;
  // linha do para-choque e faixa das luzes passam suavemente da traseira para a frente (sem degrau nas portas)
  const t = clamp01((x + .9) / 1.8), f = t * t * (3 - 2 * t), mix = (a, b) => a + (b - a) * f;
  const v = [lo, lo + .06, mix(c.pc[1], c.pc[0]), mix(c.lan[0], c.far[0]), mix(c.lan[1], c.far[1]), yb - .025, yb];
  for (let i = 1; i < v.length; i++) v[i] = Math.max(v[i], v[i - 1] + .012);
  for (let i = v.length - 2; i >= 0; i--) v[i] = Math.min(v[i], v[i + 1] - .012);
  const cab = g >= 0, wg = cab ? W2 - .14 : W2 - .15, wr = cab ? W2 - c.tumble : W2 - .15;
  const s = [[0, base], [wb - .3, base], [wb - .3, v[0]], [wb - .07, v[0]], [wb - .005, v[1]], [wb + .012, v[2]], [wb + .015, v[3]],
             [wb + .01, v[4]], [wb - .03, v[5]], [wb - .11, v[6]]];
  for (const t of [0, .12, .5, .86, 1]) s.push([wg + (wr - wg) * t, yb + t * g]);
  s.push([wr - .07, yt + (cab ? .022 : 0)], [wr * .5, yt], [0, yt]);
  for (let i = 9; i < s.length; i++) s[i][1] += (cab ? c.coroa : 0) * (1 - (s[i][0] / W2) ** 2);
  return s;
}
function estacoes(c) {   // cortes ao longo do carro: mais densos nas pontas, nas caixas de roda e nas divisões das peças
  const set = new Set(), add = x => { if (x >= c.xr - 1e-9 && x <= c.xf + 1e-9) set.add(Math.round(x * 4000) / 4000); };
  for (let x = c.xr; x < c.xf; ) { add(x); x += Math.min(x - c.xr, c.xf - x) < .34 ? .008 : .035; }
  add(c.xf);
  for (const e of c.eixos) for (let x = e - c.Ra; x <= e + c.Ra; x += .015) add(x);
  for (const [a, b, p] of c.densas || []) for (let x = a; x <= b; x += p) add(x);
  [...c.cortes, c.xBF, c.xBR, c.xf - .28, c.xr + .26, ...c.janelas.flatMap(j => [j[0], j[1]]), ...c.teto.map(p => p[0]), ...(c.cacamba ? [c.cacamba[0] - .04] : [])].forEach(add);
  for (const e of c.eixos) { add(e - c.Ra); add(e + c.Ra); }
  const xs = [...set].sort((a, b) => a - b), out = [];
  for (const x of xs) if (!out.length || x - out[out.length - 1] > .0015) out.push(x);
  return out;
}

// ---------------------------------------------------------------- a que peça pertence cada pedaço da superfície
const nomeL = (base, lado, fem) => base + ' ' + (lado === 'd' ? (fem ? 'direita' : 'direito') : (fem ? 'esquerda' : 'esquerdo'));
function classe(c, x, y, z, n, m, lado, g) {
  const W2 = c.W2, yb = c.belt(x), az = Math.abs(z), P = (nome, grupo) => ({ nome, grupo });
  const caçamba = c.cacamba && x < c.cacamba[0];
  const zona = () => x >= c.cortes[0] ? P(nomeL('Para-lama dianteiro', lado, 0), 'lataria') : x >= c.cortes[1] ? P(nomeL('Porta dianteira', lado, 1), 'lataria')
    : x >= c.cortes[2] ? P(nomeL('Porta traseira', lado, 1), 'lataria') : P(nomeL(c.cacamba ? 'Caçamba (lateral)' : 'Lateral traseira', lado, 1), 'lataria');
  const tampa = P(c.cacamba ? 'Tampa da caçamba' : c.sedan ? 'Tampa do porta-malas' : 'Tampa traseira', 'lataria');
  const pcd = P('Para-choque dianteiro', 'para-choque'), pct = P('Para-choque traseiro', 'para-choque');
  const farol = P(nomeL('Farol', lado, 0), 'farol'), lanterna = P(nomeL('Lanterna traseira', lado, 1), 'lanterna');
  // colunas A (frente das janelas), B (entre as portas) e C (atrás) — peças de estrutura
  const jd = c.janelas[0], jt = c.janelas[1];
  const coluna = letra => P(nomeL('Coluna ' + (letra || (x > jd[1] - .01 ? 'A' : x > jt[1] - .01 ? 'B' : 'C')), lado, 1), 'estrutura');
  if (m <= 2) return { corpo: 'baixo' };
  if (caçamba && m >= 10) return P('Caçamba (assoalho)', 'lataria');
  const gh = g >= .03 && !caçamba, deck = m >= 9 && !gh;
  if (m <= 9 || deck) {
    // frente e traseira só por posição (cortes limpos, sem pedaços soltos): para-choque, faróis/grade, lanternas
    if (x > c.xf - .28 && !deck && m <= 8) {
      const naGrade = az < c.grade;
      if (m === 4 && az < c.grade * .8) return P('Grade', 'grade');   // entrada de ar de baixo
      if (m <= 5) return pcd;
      if (m === 6) return naGrade ? P('Grade', 'grade') : farol;
      if (m === 7 && naGrade) return P('Grade', 'grade');
      return az < W2 - .16 ? P('Capô', 'lataria') : zona();
    }
    if (x < c.xr + .26 && !deck && m <= 8) {
      if (m <= 4) return pct;
      if (m === 6 && az > W2 - c.lanW) return lanterna;
      return az < W2 - .14 ? tampa : zona();
    }
    if (deck) return caçamba ? (x < c.xr + .05 ? tampa : zona()) : x > 0 ? P('Capô', 'lataria') : tampa;
    if (m <= 4 && x > c.xBF) return pcd;
    if (m <= 4 && x < c.xBR) return pct;
    return zona();
  }
  if (m <= 13) {   // lateral da cabine: vidros entre as colunas; moldura de baixo e de cima da janela é da porta
    const j = c.janelas.find(([a, b]) => x >= a && x <= b);
    if (j && (m === 11 || m === 12)) return P(nomeL('Vidro ' + j[2], lado, j[3]), 'vidro');
    if (m === 10 || (j && m === 13)) return zona();
    return coluna();
  }
  // para-brisa / vidro traseiro pela inclinação do teto naquele ponto do comprimento (divisa reta de lado a lado, sem dentes)
  const incl = (alturaTeto(c, x + .004) - alturaTeto(c, x - .004)) / .008;
  if (x > 0 && incl < -.32) return m === 14 ? coluna('A') : P('Para-brisa', 'vidro');
  const yc = y - c.coroa * (1 - (z / W2) ** 2);   // altura sem o arco do teto (borda de baixo do vidro reta)
  if (x < 0 && incl > .32) {
    if (m >= 15 && yc > yb + .03 && yc < c.tetoMax - .05) return P('Vidro traseiro', 'vidro');
    return c.sedan || c.cacamba ? coluna('C') : tampa;   // no hatch e no SUV a moldura do vidro é da tampa
  }
  return P('Teto', 'lataria');
}

function material(grupo) {
  const [metal, rug] = MAT[grupo];
  return new THREE.MeshStandardMaterial({ color: COR[grupo], metalness: metal, roughness: rug, envMapIntensity: grupo === 'vidro' ? .12 : .9,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
}
function parte(geo, nome, grupo, chave) {
  const m = new THREE.Mesh(geo, material(grupo));
  m.userData = { nome, grupo: grupo === 'lanterna' ? 'farol' : grupo, chave: chave || nome, corBase: COR[grupo] };
  carro.add(m); partes.push(m); return m;
}
function bloqueio(geo, grupo) { const m = new THREE.Mesh(geo, material(grupo)); carro.add(m); bloqueios.push(m); return m; }

function carroceria(c) {
  const xs = estacoes(c), NR = 34, S = xs.length;
  const linha = r => r <= 17 ? r : 34 - r;
  const pos = new Float32Array(S * NR * 3);
  xs.forEach((x, i) => {
    const s = secao(c, x);
    for (let r = 0; r < NR; r++) { const [z0, y] = s[linha(r)]; const z = (r <= 17 ? 1 : -1) * z0 * planta(c, x, y); pos.set([x, y, z], (i * NR + r) * 3); }
  });
  const P = (i, r) => new THREE.Vector3(pos[(i * NR + r) * 3], pos[(i * NR + r) * 3 + 1], pos[(i * NR + r) * 3 + 2]);
  const gs = xs.map(x => alturaTeto(c, x) - c.belt(x));
  // células (entre duas seções e duas linhas): classifica cada uma
  const chave = [], idx = [], porChave = new Map();
  for (let i = 0; i < S - 1; i++) {
    chave.push([]);
    for (let r = 0; r < NR; r++) {
      const r1 = (r + 1) % NR, a = P(i, r), b = P(i + 1, r), cc = P(i + 1, r1), d = P(i, r1);
      const nrm = new THREE.Vector3().subVectors(cc, a).cross(new THREE.Vector3().subVectors(d, b));
      if (nrm.length() < 1e-7) { chave[i].push(null); continue; }
      nrm.normalize();
      const cen = a.clone().add(b).add(cc).add(d).multiplyScalar(.25);
      const cl = classe(c, (xs[i] + xs[i + 1]) / 2, cen.y, cen.z, nrm, Math.min(linha(r), linha(r1)), r <= 16 ? 'd' : 'e', (gs[i] + gs[i + 1]) / 2);
      const k = cl.corpo || cl.nome;
      chave[i].push(k);
      if (!porChave.has(k)) porChave.set(k, { cl, tri: [] });
      // diagonal espelhada entre os lados (o lado direito é o reflexo do esquerdo; sem sombra diferente onde a superfície fecha)
      const ia = i * NR + r, ib = (i + 1) * NR + r, ic = (i + 1) * NR + r1, id = i * NR + r1;
      const t = r <= 16 ? [ia, ib, id, ib, ic, id] : [ia, ib, ic, ia, ic, id];
      porChave.get(k).tri.push(...t); idx.push(...t);
    }
  }
  // normais suaves na superfície inteira (a luz corre pelas curvas), depois cada peça vira uma malha separada
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  const nor = geo.attributes.normal.array;
  // nas pontas a superfície fecha e a sombra dobrava em vincos; suaviza as normais só ali (lataria lisa)
  const ponta = xs.map(x => x > c.xf - .4 || x < c.xr + .4);
  // pontos que fecharam no meio do carro (z = 0) existem duas vezes (lado esquerdo e direito): mesma normal, sem emenda no centro
  const centro = () => {
    for (let i = 0; i < S; i++) for (let r = 1; r < 17; r++) {
      const a = i * NR + r, b = i * NR + (NR - r);
      if (Math.abs(pos[a * 3 + 2]) > 1e-5) continue;
      const nx = (nor[a * 3] + nor[b * 3]) / 2, ny = (nor[a * 3 + 1] + nor[b * 3 + 1]) / 2, l = Math.hypot(nx, ny) || 1;
      nor[a * 3] = nor[b * 3] = nx / l; nor[a * 3 + 1] = nor[b * 3 + 1] = ny / l; nor[a * 3 + 2] = nor[b * 3 + 2] = 0;
    }
  };
  centro();
  for (let it = 0; it < 6; it++) {
    const novo = Float32Array.from(nor);
    for (let i = 1; i < S - 1; i++) {
      if (!ponta[i]) continue;
      for (let r = 0; r < NR; r++) {
        const v = i * NR + r, viz = [v, v, (i - 1) * NR + r, (i + 1) * NR + r, i * NR + (r + 1) % NR, i * NR + (r + NR - 1) % NR];
        let sx = 0, sy = 0, sz = 0;
        for (const q of viz) { sx += nor[q * 3]; sy += nor[q * 3 + 1]; sz += nor[q * 3 + 2]; }
        const l = Math.hypot(sx, sy, sz); if (l < 1e-6) continue;
        novo[v * 3] = sx / l; novo[v * 3 + 1] = sy / l; novo[v * 3 + 2] = sz / l;
      }
    }
    nor.set(novo); centro();
  }
  for (const [k, { cl, tri }] of porChave) {
    const p = new Float32Array(tri.length * 3), n = new Float32Array(tri.length * 3);
    tri.forEach((v, j) => { for (let e = 0; e < 3; e++) { p[j * 3 + e] = pos[v * 3 + e]; n[j * 3 + e] = nor[v * 3 + e]; } });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
    if (cl.corpo) bloqueio(g, cl.corpo); else parte(g, cl.nome, cl.grupo);
  }
  // linhas das peças: onde duas células vizinhas são de peças diferentes
  const seg = [], ponto = v => [pos[v * 3] + nor[v * 3] * .004, pos[v * 3 + 1] + nor[v * 3 + 1] * .004, pos[v * 3 + 2] + nor[v * 3 + 2] * .004];
  const traça = (v1, v2) => { const a = ponto(v1), b = ponto(v2); if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > 1e-4) seg.push(...a, ...b); };
  for (let i = 0; i < S - 1; i++) for (let r = 0; r < NR; r++) {
    const k = chave[i][r], r1 = (r + 1) % NR; if (!k) continue;
    const k1 = chave[i][r1]; if (k1 && k1 !== k && !(k === 'baixo' && k1 === 'baixo')) traça(i * NR + r1, (i + 1) * NR + r1);
    if (i + 1 < S - 1) { const k2 = chave[i + 1][r]; if (k2 && k2 !== k) traça((i + 1) * NR + r, (i + 1) * NR + r1); }
  }
  // tira pedaços soltos: trechos de linha ligados entre si que somam menos de 25 cm não são divisa de peça
  const pai = [], chaveP = (k) => seg.slice(k, k + 3).map(v => Math.round(v * 2000)).join(','), id = new Map();
  const no = k => { const s = chaveP(k); if (!id.has(s)) { id.set(s, pai.length); pai.push(pai.length); } return id.get(s); };
  const raiz = a => { while (pai[a] !== a) a = pai[a] = pai[pai[a]]; return a; };
  const ext = [];
  for (let k = 0; k < seg.length; k += 6) { const a = no(k), b = no(k + 3); pai[raiz(a)] = raiz(b); ext.push(a); }
  const comp = new Map();
  for (let k = 0, s = 0; k < seg.length; k += 6, s++) { const r = raiz(ext[s]); comp.set(r, (comp.get(r) || 0) + Math.hypot(seg[k] - seg[k + 3], seg[k + 1] - seg[k + 4], seg[k + 2] - seg[k + 5])); }
  const limpo = [];
  for (let k = 0, s = 0; k < seg.length; k += 6, s++) if (comp.get(raiz(ext[s])) >= .25) limpo.push(...seg.slice(k, k + 6));
  const lg = new LineSegmentsGeometry(); lg.setPositions(limpo); carro.add(new LineSegments2(lg, linhaMat));
}

function rodas(c) {
  const R = c.R, hw = .11, ri = R * .66;
  const perfil = [[ri, -hw], [R - .05, -hw], [R - .015, -hw + .02], [R, -hw + .055], [R, hw - .055], [R - .015, hw - .02], [R - .05, hw], [ri, hw]].map(([a, b]) => new THREE.Vector2(a, b));
  // aro: disco com 5 raios
  const aro = new THREE.Shape(); aro.absarc(0, 0, ri, 0, Math.PI * 2, false);
  for (let k = 0; k < 5; k++) {
    const a0 = Math.PI / 2 + k * 2 * Math.PI / 5 + .2, a1 = a0 + 2 * Math.PI / 5 - .4, h = new THREE.Path();
    h.absarc(0, 0, ri * .84, a0, a1, false); h.absarc(0, 0, ri * .34, a1, a0, true); aro.holes.push(h);
  }
  c.eixos.forEach((x, i) => {
    for (const s of [1, -1]) {
      const pos = i ? 'dianteir' : 'traseir', lado = s > 0 ? 'direit' : 'esquerd', zc = s * (c.W2 - .135);
      const gp = new THREE.LatheGeometry(perfil, 48); gp.rotateX(Math.PI / 2); gp.translate(x, R, zc);
      parte(gp, 'Pneu ' + pos + 'o ' + lado + 'o', 'pneu');
      const face = new THREE.ExtrudeGeometry(aro, { depth: .03, bevelEnabled: true, bevelThickness: .008, bevelSize: .008, bevelSegments: 2, curveSegments: 40 });
      face.translate(0, 0, hw - .05);
      const tambor = new THREE.CylinderGeometry(ri, ri, .2, 40, 1, true); tambor.rotateX(Math.PI / 2); tambor.translate(0, 0, -.01);
      const cubo = new THREE.CylinderGeometry(.06, .06, .05, 20); cubo.rotateX(Math.PI / 2); cubo.translate(0, 0, hw - .03);
      const gr = mergeGeometries([face.toNonIndexed(), tambor.toNonIndexed(), cubo.toNonIndexed()].map(g => { g.deleteAttribute('uv'); return g; }));
      if (s < 0) gr.rotateY(Math.PI);
      gr.translate(x, R, zc);
      const m = parte(gr, 'Roda ' + pos + 'a ' + lado + 'a', 'roda'); m.material.side = THREE.DoubleSide;
    }
  });
}

function extras(c) {
  const xCapo = c.roofX[1];
  for (const s of [1, -1]) {   // retrovisores
    const casca = new THREE.SphereGeometry(1, 24, 16); casca.scale(.1, .075, .12);
    const haste = new THREE.BoxGeometry(.06, .03, .1); haste.translate(0, -.02, -s * .1);
    const g = mergeGeometries([casca.toNonIndexed(), haste.toNonIndexed()].map(q => { q.deleteAttribute('uv'); return q; }));
    g.translate(xCapo - .14, c.belt(xCapo) + .1, s * (c.W2 - .14 + .17));
    parte(g, 'Retrovisor ' + (s > 0 ? 'direito' : 'esquerdo'), 'retrovisor');
  }
  if (c.trilhos) for (const s of [1, -1]) {   // barras de teto do SUV
    const z = s * (c.W2 - c.tumble - .03), pts = [];
    for (let x = -1.7; x <= .4; x += .15) pts.push(new THREE.Vector3(x, c.roof(x) + c.coroa * (1 - (z / c.W2) ** 2) + .05, z));
    bloqueio(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, .018, 8), 'trilho');
  }
  if (c.molduras) for (const s of [1, -1]) {   // molduras escuras das caixas de roda e da soleira (plástico, não clicável)
    const prof = .025, z0 = s > 0 ? c.W2 + .004 : -(c.W2 + .004) - prof;
    for (const e of c.eixos) {
      const ri = c.Ra, re = c.Ra + .075, a0 = Math.asin(Math.min(1, (c.base(e) - .05 - c.R) / re)), f = new THREE.Shape();
      f.absarc(0, 0, re, Math.max(0, a0), Math.PI - Math.max(0, a0), false); f.absarc(0, 0, ri, Math.PI - Math.max(0, a0), Math.max(0, a0), true);
      const g = new THREE.ExtrudeGeometry(f, { depth: prof, bevelEnabled: true, bevelThickness: .006, bevelSize: .006, bevelSegments: 2, curveSegments: 48 });
      g.translate(e, c.R, z0); bloqueio(g, 'moldura');
    }
    const xa = c.eixos[0] + c.Ra + .04, xb = c.eixos[1] - c.Ra - .04, yb0 = c.base(0), sol = new THREE.Shape();
    sol.moveTo(xa, yb0 - .01); sol.lineTo(xb, yb0 - .01); sol.lineTo(xb, yb0 + .08); sol.lineTo(xa, yb0 + .08); sol.closePath();
    const g = new THREE.ExtrudeGeometry(sol, { depth: prof, bevelEnabled: true, bevelThickness: .006, bevelSize: .006, bevelSegments: 2 });
    g.translate(0, 0, z0); bloqueio(g, 'moldura');
  }
}

// ---------------------------------------------------------------- cena e API da tela
let carro, partes = [], bloqueios = [], linhaMat, renderer;
const VISTAS = { '3D': [-0.75, 1.15], 'Frente': [0, 1.38], 'Traseira': [Math.PI, 1.38], 'Lat. esq.': [-Math.PI / 2, 1.47], 'Lat. dir.': [Math.PI / 2, 1.47], 'Teto': [-Math.PI / 2, .06] };

function estudio() {   // panorama gerado (só depende da altura), sem emendas nem objetos que virem listras
  const W = 256, H = 128, d = new Float32Array(W * H * 4), ss = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  for (let j = 0; j < H; j++) {
    const h = Math.sin(Math.PI * ((j + .5) / H - .5));
    let c = .04 + (.2 - .04) * ss(-.35, .05, h); c += .45 * Math.exp(-(((h - .18) / .1) ** 2)); c = c + (.42 - c) * ss(.35, .95, h);
    for (let i = 0; i < W; i++) d.set([c, c, c, 1], (j * W + i) * 4);
  }
  const t = new THREE.DataTexture(d, W, H, THREE.RGBAFormat, THREE.FloatType);
  t.mapping = THREE.EquirectangularReflectionMapping; t.needsUpdate = true;
  const pm = new THREE.PMREMGenerator(renderer), env = pm.fromEquirectangular(t).texture;
  pm.dispose(); t.dispose();
  return env;
}

/* criar(palco, { carroceria, aoTocar(nome, grupo) }) -> Promise<controle>
   controle: marcar({ chave: 'LEVE'|'MEDIA'|'GRAVE' }), destacar(nome|null), vista(nome), partes(), onde(nome), destruir() */
export async function criar(palco, opcoes) {
  await carregar();
  destruirAtualGlobal();
  const c = C[opcoes.carroceria] || C.SUV;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
  renderer.domElement.className = 'avVisCanvas';
  const rnd = renderer;
  palco.prepend(renderer.domElement);
  const cena = new THREE.Scene();
  cena.environment = estudio();
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  cena.add(new THREE.HemisphereLight(0xffffff, 0x5a5d66, .55));
  const sol = new THREE.DirectionalLight(0xffffff, .9); sol.position.set(5, 5, 7); cena.add(sol);
  const contra = new THREE.DirectionalLight(0xc9d3ff, .7); contra.position.set(-6, 3, -6); cena.add(contra);
  carro = new THREE.Group(); cena.add(carro);
  linhaMat = new LineMaterial({ color: COR_LINHA, linewidth: .9 });
  partes = []; bloqueios = [];
  carroceria(c); rodas(c); extras(c);
  const ALVO = new THREE.Vector3(0, c.tetoMax * .52, 0);
  let [teta, fi] = VISTAS['3D'], alvoTeta = teta, alvoFi = fi, raio = 10, sujo = true, vivo = true;
  let marcas = {}, destaque = null;

  function pintar() {
    for (const m of partes) {
      const toque = destaque === m.userData.chave, g = marcas[m.userData.chave];
      m.material.color.setHex(toque ? TOQUE : g ? COR_GRAV[g] : m.userData.corBase);
      m.material.emissive.setHex(toque ? 0x0b3b55 : g ? 0x1a0d00 : 0x000000);
    }
    sujo = true;
  }
  function tamanho() {
    const w = palco.clientWidth, h = palco.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
    linhaMat.resolution.set(w, h); raio = c.L * 2.25 / Math.min(1, cam.aspect); sujo = true;
  }
  const obs = new ResizeObserver(tamanho); obs.observe(palco); tamanho();
  let raf = 0;
  (function loop() {   // desenha só quando algo muda (economiza bateria no celular)
    if (!vivo) return;
    // a tela saiu (outro módulo, outra avaliação): para de desenhar e libera a memória
    if (!rnd.domElement.isConnected) { if (ctrlAtual === destruirAtual) ctrlAtual = null; destruirAtual(); return; }
    let d = alvoTeta - teta; d = Math.atan2(Math.sin(d), Math.cos(d));
    if (Math.abs(d) > 1e-4 || Math.abs(alvoFi - fi) > 1e-4 || sujo) {
      teta += d * .15; fi += (alvoFi - fi) * .15; sujo = false;
      cam.position.set(ALVO.x + raio * Math.sin(fi) * Math.cos(teta), ALVO.y + raio * Math.cos(fi), ALVO.z + raio * Math.sin(fi) * Math.sin(teta));
      if (fi < .2) cam.up.set(-Math.cos(teta), 0, -Math.sin(teta)); else cam.up.set(0, 1, 0);
      cam.lookAt(ALVO); rnd.render(cena, cam);
    }
    raf = requestAnimationFrame(loop);
  })();

  // arrastar gira; toque curto marca a peça
  const el = rnd.domElement, ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  let arrastando = false, moveu = 0, ux = 0, uy = 0;
  el.addEventListener('pointerdown', e => { arrastando = true; moveu = 0; ux = e.clientX; uy = e.clientY; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', e => {
    if (!arrastando) return;
    const dx = e.clientX - ux, dy = e.clientY - uy; moveu += Math.abs(dx) + Math.abs(dy); ux = e.clientX; uy = e.clientY;
    alvoTeta -= dx * .01; alvoFi = Math.max(.06, Math.min(1.5, alvoFi - dy * .006));
  });
  el.addEventListener('pointerup', e => {
    arrastando = false; if (moveu >= 8) return;
    const r = el.getBoundingClientRect();
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, cam);
    const hit = ray.intersectObjects([...partes, ...bloqueios], false)[0];
    if (hit && hit.object.userData.chave && opcoes.aoTocar) opcoes.aoTocar(hit.object.userData.nome, hit.object.userData.grupo);
  });

  function destruirAtual() {
    vivo = false; cancelAnimationFrame(raf); obs.disconnect();
    carro.traverse(o => { o.geometry && o.geometry.dispose(); o.material && o.material.dispose && o.material.dispose(); });
    cena.environment && cena.environment.dispose(); linhaMat.dispose();
    rnd.dispose(); rnd.forceContextLoss(); rnd.domElement.remove(); if (renderer === rnd) renderer = null;
  }
  ctrlAtual = destruirAtual;
  pintar();
  return {
    marcar(m) { marcas = m || {}; pintar(); },
    destacar(nome) { destaque = nome || null; pintar(); },
    vista(nome) { const v = VISTAS[nome]; if (v) { alvoTeta = v[0]; alvoFi = v[1]; } },
    partes: () => partes.map(p => ({ nome: p.userData.nome, grupo: p.userData.grupo })),
    // para os testes: ponto da tela sobre a peça, num pedaço virado para a câmera
    onde(nome) {
      const m = partes.find(p => p.userData.nome === nome); if (!m) return null;
      const pa = m.geometry.attributes.position, na = m.geometry.attributes.normal, cs = [], soma = new THREE.Vector3();
      for (let i = 0; i < pa.count; i += 3) {
        const q = new THREE.Vector3(), n = new THREE.Vector3();
        for (let j = 0; j < 3; j++) { q.add(new THREE.Vector3().fromBufferAttribute(pa, i + j)); n.add(new THREE.Vector3().fromBufferAttribute(na, i + j)); }
        q.divideScalar(3);
        if (n.normalize().dot(cam.position.clone().sub(q).normalize()) > .4) { cs.push(q); soma.add(q); }
      }
      if (!cs.length) return null; soma.divideScalar(cs.length);
      const alvo = cs.reduce((a, b) => a.distanceTo(soma) < b.distanceTo(soma) ? a : b).clone().project(cam);
      const r = el.getBoundingClientRect(); return { x: r.left + (alvo.x + 1) / 2 * r.width, y: r.top + (1 - alvo.y) / 2 * r.height };
    },
    destruir() { if (ctrlAtual === destruirAtual) { destruirAtual(); ctrlAtual = null; } }
  };
}
let ctrlAtual = null;
function destruirAtualGlobal() { if (ctrlAtual) { ctrlAtual(); ctrlAtual = null; } }

window.NX_AVALIACOES_VISTORIA = { criar, destruir: destruirAtualGlobal, carregar };
