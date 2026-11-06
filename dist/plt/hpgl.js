// Analyseur HP-GL / HP-GL/2 (fichiers .plt, .hpgl, .hpg, .hgl, .plo, .spl)
// Produit une liste d'opérations de dessin en unités traceur (1 plu = 0,025 mm).
// Aucune dépendance : utilisable dans le navigateur (PC, Android) ou Node.

export const PLU_PER_MM = 40;

/** Convertit des octets en chaîne « binaire » (1 octet = 1 caractère, 0–255). */
export function bytesToString(u8) {
  let out = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < u8.length; i += CHUNK) {
    out += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK));
  }
  return out;
}

const DEG = Math.PI / 180;

// Commandes reconnues mais sans effet sur le rendu (ignorées silencieusement).
const IGNORED = new Set([
  'BP', 'PS', 'NR', 'MC', 'PP', 'QL', 'RF', 'FT', 'UL', 'TR', 'MG', 'ST', 'PG', 'AC', 'CT', 'ES', 'LA',
  'SA', 'SS', 'CS', 'CA', 'TD', 'DV', 'PB', 'OI', 'OP', 'OS', 'OA', 'OC', 'OD', 'OE', 'OF', 'OG', 'OH',
  'OO', 'OW', 'OL', 'VS', 'FS', 'AS', 'IW', 'KY', 'EC', 'FR', 'MT', 'PT', 'RP', 'NP', 'IR', 'SL',
  'SB', 'SD', 'SV', 'TL', 'XT', 'YT', 'AD', 'GC', 'GM', 'IM', 'IV', 'BF', 'BR', 'DL', 'CV',
  'PL', 'TB', 'TE', 'MS', 'CF', 'LM', 'SG', 'HD', 'HT', 'QP', 'SN',
]);

/**
 * Analyse un fichier HP-GL.
 * @param {string|Uint8Array} src
 * @returns {{ops:Array, bounds:object|null, stats:object, unknown:Object<string,number>, rotation:number}}
 */
export function parseHPGL(src) {
  const s = typeof src === 'string' ? src : bytesToString(src);
  const n = s.length;
  let i = 0;

  const ops = [];
  const unknown = {};
  const penColors = {};
  let known = 0;
  let rotation = 0;

  const st = {};
  function defaults(full) {
    st.abs = true;
    st.lt = 0; // 0 = trait plein
    st.ltLen = 4; // % de la diagonale P1-P2
    st.ltMode = 0;
    st.chord = 5;
    st.sc = null;
    st.labelTerm = '\x03';
    st.charW = 0.19 * 400; // cm -> plu
    st.charH = 0.27 * 400;
    st.charRel = null;
    st.dir = 0; // radians
    st.lo = 1; // origine des étiquettes (1 à 9, 11 à 19)
    st.wu = 0;
    st.pm = null;
    st.polygon = null;
    st.cr = [0, 255, 0, 255, 0, 255];
    if (full) {
      st.x = 0; st.y = 0; st.down = false; st.pen = 1;
      st.p1 = [0, 0]; st.p2 = [10160, 7840];
      st.widths = {}; st.defWidth = 0.35;
    }
  }
  defaults(true);

  // ---- Transformation unités utilisateur -> plu ----------------------------
  function scale() {
    const sc = st.sc;
    if (!sc) return null;
    const [p1x, p1y] = st.p1, [p2x, p2y] = st.p2;
    if (sc.type === 2) {
      return { fx: sc.a2, fy: sc.a4, ox: p1x - sc.a1 * sc.a2, oy: p1y - sc.a3 * sc.a4 };
    }
    const dx = sc.a2 - sc.a1 || 1, dy = sc.a4 - sc.a3 || 1;
    let fx = (p2x - p1x) / dx, fy = (p2y - p1y) / dy;
    let offx = 0, offy = 0;
    if (sc.type === 1) { // isotrope, centré par défaut (50 %)
      const f = Math.sign(fx) * Math.min(Math.abs(fx), Math.abs(fy));
      const g = Math.sign(fy) * Math.abs(f);
      const lx = sc.left ?? 50, by = sc.bottom ?? 50;
      offx = ((p2x - p1x) - f * dx) * lx / 100;
      offy = ((p2y - p1y) - g * dy) * by / 100;
      fx = f; fy = g;
    }
    return { fx, fy, ox: p1x + offx - sc.a1 * fx, oy: p1y + offy - sc.a3 * fy };
  }
  let T = null; // facteurs courants (recalculés quand SC/IP changent)
  const absX = (x) => (T ? T.ox + x * T.fx : x);
  const absY = (y) => (T ? T.oy + y * T.fy : y);
  const relX = (x) => (T ? x * T.fx : x);
  const relY = (y) => (T ? y * T.fy : y);

  // ---- Construction des opérations ----------------------------------------
  let cur = null; // polyligne en cours
  const widthOf = (pen) => st.widths[pen] ?? st.defWidth;
  const dashLen = () => {
    if (st.ltMode === 1) return st.ltLen * PLU_PER_MM;
    const dx = st.p2[0] - st.p1[0], dy = st.p2[1] - st.p1[1];
    return Math.hypot(dx, dy) * st.ltLen / 100 || 400;
  };
  function style() {
    return { pen: st.pen, width: widthOf(st.pen), lt: st.lt, dash: st.lt ? dashLen() : 0 };
  }
  function endLine() { cur = null; }
  function lineTo(x, y) {
    if (st.pm) { st.pm.cur.push(x, y); st.x = x; st.y = y; return; }
    if (!cur) {
      cur = { kind: 'line', ...style(), pts: [st.x, st.y] };
      ops.push(cur);
    }
    cur.pts.push(x, y);
    st.x = x; st.y = y;
  }
  function moveTo(x, y) {
    if (st.pm) {
      if (st.pm.cur.length > 2) st.pm.subs.push(st.pm.cur);
      st.pm.cur = [x, y];
      st.x = x; st.y = y; return;
    }
    cur = null;
    if (x !== st.x || y !== st.y) {
      const last = ops[ops.length - 1];
      if (last && last.kind === 'move') last.pts.push(x, y);
      else ops.push({ kind: 'move', pen: st.pen, pts: [st.x, st.y, x, y] });
    }
    st.x = x; st.y = y;
  }
  function plotTo(x, y) { if (st.down) lineTo(x, y); else moveTo(x, y); }

  /** Forme fermée indépendante (cercle, rectangle…) : ne déplace pas la plume. */
  function shape(pts, fill) {
    if (st.pm) { st.pm.subs.push(pts); return; }
    cur = null;
    if (fill) ops.push({ kind: 'fill', ...style(), polys: [pts] });
    else ops.push({ kind: 'line', ...style(), pts });
  }

  function arcSteps(r, sweepRad) {
    const chord = Math.max(0.5, Math.min(st.chord || 5, 45)) * DEG;
    let a = r > 2 ? 2 * Math.acos(Math.max(-1, 1 - 2 / r)) : chord;
    a = Math.max(0.5 * DEG, Math.min(a, chord));
    return Math.max(2, Math.ceil(Math.abs(sweepRad) / a));
  }
  /** Points d'un arc (le point de départ est exclu). */
  function arcPts(cx, cy, r, a0, sweep) {
    const k = arcSteps(r, sweep), out = [];
    for (let j = 1; j <= k; j++) {
      const a = a0 + sweep * j / k;
      out.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
    return out;
  }
  function arcFrom(cx, cy, sweepDeg) {
    const r = Math.hypot(st.x - cx, st.y - cy);
    const a0 = Math.atan2(st.y - cy, st.x - cx);
    const pts = arcPts(cx, cy, r, a0, sweepDeg * DEG);
    for (let j = 0; j < pts.length; j += 2) plotTo(pts[j], pts[j + 1]);
  }
  function arc3(xi, yi, xe, ye) {
    const x0 = st.x, y0 = st.y;
    const d = 2 * (x0 * (yi - ye) + xi * (ye - y0) + xe * (y0 - yi));
    if (Math.abs(d) < 1e-9) { plotTo(xe, ye); return; }
    const q0 = x0 * x0 + y0 * y0, qi = xi * xi + yi * yi, qe = xe * xe + ye * ye;
    const cx = (q0 * (yi - ye) + qi * (ye - y0) + qe * (y0 - yi)) / d;
    const cy = (q0 * (xe - xi) + qi * (x0 - xe) + qe * (xi - x0)) / d;
    const norm = (a) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const a0 = Math.atan2(y0 - cy, x0 - cx);
    const ai = norm(Math.atan2(yi - cy, xi - cx) - a0);
    const ae = norm(Math.atan2(ye - cy, xe - cx) - a0) || 2 * Math.PI;
    const sweep = ai < ae ? ae : ae - 2 * Math.PI;
    const pts = arcPts(cx, cy, Math.hypot(x0 - cx, y0 - cy), a0, sweep);
    pts[pts.length - 2] = xe; pts[pts.length - 1] = ye;
    for (let j = 0; j < pts.length; j += 2) plotTo(pts[j], pts[j + 1]);
  }
  function circle(cx, cy, r) {
    const pts = [cx + r, cy, ...arcPts(cx, cy, r, 0, 2 * Math.PI)];
    return pts;
  }
  function rect(x0, y0, x1, y1) { return [x0, y0, x1, y0, x1, y1, x0, y1, x0, y0]; }
  function wedge(r, startDeg, sweepDeg) {
    const cx = st.x, cy = st.y, a0 = startDeg * DEG;
    return [cx, cy, cx + r * Math.cos(a0), cy + r * Math.sin(a0), ...arcPts(cx, cy, r, a0, sweepDeg * DEG), cx, cy];
  }

  // ---- Texte (LB) ----------------------------------------------------------
  function charSize() {
    if (st.charRel) {
      return [Math.abs(st.p2[0] - st.p1[0]) * st.charRel[0] / 100, Math.abs(st.p2[1] - st.p1[1]) * st.charRel[1] / 100];
    }
    return [st.charW, st.charH];
  }
  function label(text) {
    if (!text) return;
    endLine();
    const [w, h] = charSize();
    const c = Math.cos(st.dir), sn = Math.sin(st.dir);
    let ox = st.x, oy = st.y, x = st.x, y = st.y, line = '';
    const lo = st.lo > 10 ? st.lo - 10 : st.lo;
    const hx = lo <= 3 ? 0 : lo <= 6 ? 0.5 : 1; // 0 gauche, ½ centre, 1 droite
    const vy = [0, 0.5, 1][(lo - 1) % 3] || 0; // 0 bas, ½ milieu, 1 haut
    const flush = () => {
      if (line) {
        ops.push({ kind: 'text', ...style(), x, y, w, h, angle: st.dir, text: line, ax: hx, ay: vy });
        x += c * line.length * w * 1.5; y += sn * line.length * w * 1.5;
        line = '';
      }
    };
    for (const ch of text) {
      if (ch === '\r') { flush(); x = ox; y = oy; }
      else if (ch === '\n') { flush(); ox += sn * 2 * h; oy -= c * 2 * h; x += sn * 2 * h; y -= c * 2 * h; }
      else if (ch === '\b') { flush(); x -= c * w * 1.5; y -= sn * w * 1.5; }
      else if (ch >= ' ') line += ch;
    }
    flush();
    if (lo === 1) { st.x = x; st.y = y; }
  }

  // ---- Lecture des paramètres ---------------------------------------------
  function readParams() {
    const start = i;
    while (i < n) {
      const c = s.charCodeAt(i);
      if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 59 || c === 27) break;
      i++;
    }
    const raw = s.slice(start, i);
    if (i < n && s.charCodeAt(i) === 59) i++;
    const nums = raw.match(/[-+]?(?:\d+\.?\d*|\.\d+)/g);
    return nums ? nums.map(Number) : [];
  }
  function skipToTerminator() {
    while (i < n && s[i] !== ';' && s.charCodeAt(i) !== 27) {
      const c = s.charCodeAt(i);
      if ((c >= 65 && c <= 90) && i + 1 < n && /[A-Za-z]/.test(s[i + 1])) break;
      i++;
    }
    if (s[i] === ';') i++;
  }

  // ---- PE : polyligne encodée (HP-GL/2) -----------------------------------
  function parsePE() {
    let bits7 = false, frac = 0, upNext = false, absNext = false;
    const readNum = () => {
      let val = 0, mult = 1;
      while (i < n) {
        const c = s.charCodeAt(i++);
        if (bits7) {
          if (c >= 63 && c <= 94) { val += (c - 63) * mult; mult *= 32; }
          else if (c >= 95 && c <= 126) { val += (c - 95) * mult; break; }
        } else {
          if (c >= 63 && c <= 126) { val += (c - 63) * mult; mult *= 64; }
          else if (c >= 191 && c <= 254) { val += (c - 191) * mult; break; }
        }
      }
      const v = val % 2 ? -(val - 1) / 2 : val / 2;
      return frac ? v / Math.pow(2, frac) : v;
    };
    while (i < n) {
      const c = s.charCodeAt(i);
      if (c === 59) { i++; break; }
      if (c === 27) break;
      if (c === 58) { i++; const p = Math.round(readNum()); endLine(); st.pen = p; continue; } // ':'
      if (c === 60) { i++; upNext = true; continue; } // '<'
      if (c === 62) { i++; frac = readNum(); continue; } // '>'
      if (c === 61) { i++; absNext = true; continue; } // '='
      if (c === 55) { i++; bits7 = true; continue; } // '7'
      if (c < 63 || (c > 126 && c < 191) || c > 254) { i++; continue; }
      const x = readNum(), y = readNum();
      const nx = absNext ? absX(x) : st.x + relX(x);
      const ny = absNext ? absY(y) : st.y + relY(y);
      if (upNext) { moveTo(nx, ny); st.down = false; }
      else { lineTo(nx, ny); st.down = true; }
      upNext = false; absNext = false;
    }
  }

  // ---- Séquences d'échappement PCL / RS-232 -------------------------------
  function skipEscape() {
    i++; // ESC
    if (i >= n) return;
    const c0 = s[i];
    if (c0 === '.') { // ESC . X [params] [:]
      i += 2;
      while (i < n && /[0-9;]/.test(s[i])) i++;
      if (s[i] === ':') i++;
      return;
    }
    if (c0 === 'E') { i++; return; }
    let num = '', last = 0;
    while (i < n) {
      const ch = s[i++];
      const code = ch.charCodeAt(0);
      if (/[0-9.+-]/.test(ch)) { num += ch; continue; }
      if (code >= 97 && code <= 122) { last = Number(num) || 0; num = ''; continue; } // regroupement
      if (code >= 64 && code <= 90) { // fin de séquence
        last = Number(num) || 0;
        if (ch === 'W' && last > 0) i += last; // données binaires (raster, etc.)
        if (ch === 'A' && s.slice(i - 3, i - 1).match(/%[0-9]/)) pclMode = true; // ESC%#A : retour PCL
        if (ch === 'B' && s.slice(i - 3, i - 1).match(/%-?[0-9]/)) pclMode = false; // ESC%#B : HP-GL/2
        if (ch === 'X') pclMode = false; // UEL
        return;
      }
    }
  }
  let pclMode = false;

  // ---- Boucle principale --------------------------------------------------
  let commands = 0;
  while (i < n) {
    const c = s.charCodeAt(i);
    if (c === 27) { skipEscape(); continue; }
    if (pclMode) { i++; continue; }
    if (c === 64 && s.startsWith('@PJL', i)) { // en-tête PJL
      while (i < n && s[i] !== '\n') i++;
      continue;
    }
    const isLetter = (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
    if (!isLetter || i + 1 >= n) { i++; continue; }
    const c2 = s.charCodeAt(i + 1);
    if (!((c2 >= 65 && c2 <= 90) || (c2 >= 97 && c2 <= 122))) { i++; continue; }
    const cmd = s.substr(i, 2).toUpperCase();
    i += 2;
    commands++;

    switch (cmd) {
      case 'IN': endLine(); defaults(true); T = null; known++; readParams(); break;
      case 'DF': endLine(); defaults(false); T = null; known++; readParams(); break;
      case 'PU': case 'PD': {
        known++;
        const p = readParams();
        st.down = cmd === 'PD';
        if (!st.down) endLine();
        for (let j = 0; j + 1 < p.length; j += 2) {
          if (st.abs) plotTo(absX(p[j]), absY(p[j + 1]));
          else plotTo(st.x + relX(p[j]), st.y + relY(p[j + 1]));
        }
        break;
      }
      case 'PA': case 'PR': {
        known++;
        st.abs = cmd === 'PA';
        const p = readParams();
        for (let j = 0; j + 1 < p.length; j += 2) {
          if (st.abs) plotTo(absX(p[j]), absY(p[j + 1]));
          else plotTo(st.x + relX(p[j]), st.y + relY(p[j + 1]));
        }
        break;
      }
      case 'SP': {
        known++;
        const p = readParams();
        endLine();
        st.pen = p.length ? Math.round(p[0]) : 0;
        break;
      }
      case 'LT': {
        known++;
        const p = readParams();
        endLine();
        st.lt = p.length ? Math.round(p[0]) : 0;
        if (p.length > 1) st.ltLen = p[1];
        if (p.length > 2) st.ltMode = p[2];
        break;
      }
      case 'PW': {
        known++;
        const p = readParams();
        endLine();
        let w = p.length ? p[0] : 0.35;
        if (st.wu === 1) w = Math.hypot(st.p2[0] - st.p1[0], st.p2[1] - st.p1[1]) * w / 100 / PLU_PER_MM;
        if (p.length > 1) st.widths[Math.round(p[1])] = w;
        else { st.widths = {}; st.defWidth = w; }
        break;
      }
      case 'WU': { known++; const p = readParams(); st.wu = p[0] || 0; break; }
      case 'PC': {
        known++;
        const p = readParams();
        if (p.length >= 4) {
          const cr = st.cr;
          const norm = (v, a, b) => Math.max(0, Math.min(255, Math.round((v - a) / ((b - a) || 1) * 255)));
          penColors[Math.round(p[0])] = [norm(p[1], cr[0], cr[1]), norm(p[2], cr[2], cr[3]), norm(p[3], cr[4], cr[5])];
        }
        break;
      }
      case 'CR': { known++; const p = readParams(); st.cr = p.length >= 6 ? p.slice(0, 6) : [0, 255, 0, 255, 0, 255]; break; }
      case 'IP': {
        known++;
        const p = readParams();
        if (p.length >= 4) { st.p1 = [p[0], p[1]]; st.p2 = [p[2], p[3]]; }
        else if (p.length >= 2) {
          const dx = st.p2[0] - st.p1[0], dy = st.p2[1] - st.p1[1];
          st.p1 = [p[0], p[1]]; st.p2 = [p[0] + dx, p[1] + dy];
        } else { st.p1 = [0, 0]; st.p2 = [10160, 7840]; }
        T = scale();
        break;
      }
      case 'SC': {
        known++;
        const p = readParams();
        if (p.length >= 4) {
          st.sc = { a1: p[0], a2: p[1], a3: p[2], a4: p[3], type: p[4] || 0, left: p[5], bottom: p[6] };
        } else st.sc = null;
        T = scale();
        break;
      }
      case 'RO': { known++; const p = readParams(); rotation = p[0] || 0; break; }
      default:
        break;
    }
    if (cmd === 'IN' || cmd === 'DF' || cmd === 'PU' || cmd === 'PD' || cmd === 'PA' || cmd === 'PR' ||
        cmd === 'SP' || cmd === 'LT' || cmd === 'PW' || cmd === 'WU' || cmd === 'PC' || cmd === 'CR' ||
        cmd === 'IP' || cmd === 'SC' || cmd === 'RO') continue;

    switch (cmd) {
      case 'CI': {
        known++;
        const p = readParams();
        if (p.length) {
          if (p[1]) st.chord = Math.abs(p[1]);
          shape(circle(st.x, st.y, Math.abs(relX(p[0]))), false);
        }
        break;
      }
      case 'AA': case 'AR': {
        known++;
        const p = readParams();
        if (p.length >= 3) {
          if (p[3]) st.chord = Math.abs(p[3]);
          const cx = cmd === 'AA' ? absX(p[0]) : st.x + relX(p[0]);
          const cy = cmd === 'AA' ? absY(p[1]) : st.y + relY(p[1]);
          arcFrom(cx, cy, p[2]);
        }
        break;
      }
      case 'AT': case 'RT': {
        known++;
        const p = readParams();
        if (p.length >= 4) {
          if (p[4]) st.chord = Math.abs(p[4]);
          if (cmd === 'AT') arc3(absX(p[0]), absY(p[1]), absX(p[2]), absY(p[3]));
          else arc3(st.x + relX(p[0]), st.y + relY(p[1]), st.x + relX(p[2]), st.y + relY(p[3]));
        }
        break;
      }
      case 'EA': case 'ER': case 'RA': case 'RR': {
        known++;
        const p = readParams();
        if (p.length >= 2) {
          const abs = cmd === 'EA' || cmd === 'RA';
          const x1 = abs ? absX(p[0]) : st.x + relX(p[0]);
          const y1 = abs ? absY(p[1]) : st.y + relY(p[1]);
          shape(rect(st.x, st.y, x1, y1), cmd[0] === 'R');
        }
        break;
      }
      case 'EW': case 'WG': {
        known++;
        const p = readParams();
        if (p.length >= 3) {
          if (p[3]) st.chord = Math.abs(p[3]);
          shape(wedge(Math.abs(relX(p[0])), p[1], p[2]), cmd === 'WG');
        }
        break;
      }
      case 'PM': {
        known++;
        const p = readParams();
        const m = p.length ? p[0] : 0;
        if (m === 0) { endLine(); st.pm = { subs: [], cur: [st.x, st.y] }; }
        else if (st.pm) {
          if (st.pm.cur.length > 2) st.pm.subs.push(st.pm.cur);
          st.pm.cur = [st.x, st.y];
          if (m === 2) { st.polygon = st.pm.subs; st.pm = null; }
        }
        break;
      }
      case 'EP': {
        known++; readParams();
        if (st.polygon) for (const poly of st.polygon) {
          const pts = poly.slice();
          if (pts[0] !== pts[pts.length - 2] || pts[1] !== pts[pts.length - 1]) pts.push(pts[0], pts[1]);
          ops.push({ kind: 'line', ...style(), pts });
        }
        cur = null;
        break;
      }
      case 'FP': {
        known++; readParams();
        if (st.polygon && st.polygon.length) ops.push({ kind: 'fill', ...style(), polys: st.polygon.map((q) => q.slice()) });
        cur = null;
        break;
      }
      case 'LB': {
        known++;
        const end = s.indexOf(st.labelTerm, i);
        const stop = end < 0 ? n : end;
        label(s.slice(i, stop));
        i = end < 0 ? n : end + 1;
        break;
      }
      case 'WD': { // texte affiché sur la console : ignoré
        known++;
        const end = s.indexOf(st.labelTerm, i);
        i = end < 0 ? n : end + 1;
        break;
      }
      case 'BL': {
        known++;
        const end = s.indexOf(st.labelTerm, i);
        i = end < 0 ? n : end + 1;
        break;
      }
      case 'DT': {
        known++;
        if (i < n && s[i] !== ';') {
          st.labelTerm = s[i]; i++;
          readParams();
        } else { st.labelTerm = '\x03'; if (s[i] === ';') i++; }
        break;
      }
      case 'SI': {
        known++;
        const p = readParams();
        st.charRel = null;
        if (p.length >= 2) { st.charW = p[0] * 400; st.charH = p[1] * 400; }
        else { st.charW = 0.19 * 400; st.charH = 0.27 * 400; }
        break;
      }
      case 'SR': {
        known++;
        const p = readParams();
        st.charRel = p.length >= 2 ? [p[0], p[1]] : [0.75, 1.5];
        break;
      }
      case 'DI': case 'DR': {
        known++;
        const p = readParams();
        st.dir = p.length >= 2 && (p[0] || p[1]) ? Math.atan2(p[1], p[0]) : 0;
        break;
      }
      case 'LO': {
        known++;
        const p = readParams();
        const v = p.length ? Math.round(p[0]) : 1;
        st.lo = (v >= 1 && v <= 9) || (v >= 11 && v <= 19) ? v : 1;
        break;
      }
      case 'CP': {
        known++;
        const p = readParams();
        const [w, h] = charSize();
        const sp = p[0] || 0, ln = p.length > 1 ? p[1] : (p.length ? 0 : -1);
        const c0 = Math.cos(st.dir), s0 = Math.sin(st.dir);
        const dx = c0 * sp * w * 1.5 + s0 * -ln * -2 * h;
        const dy = s0 * sp * w * 1.5 + c0 * ln * 2 * h;
        endLine();
        st.x += dx; st.y += dy;
        break;
      }
      case 'PE': { known++; parsePE(); break; }
      case 'SM': { known++; if (s[i] !== ';') i++; if (s[i] === ';') i++; break; }
      case 'CO': { // commentaire "..."
        known++;
        const q = s.indexOf('"', i);
        if (q >= 0 && q - i < 4) { const q2 = s.indexOf('"', q + 1); i = q2 < 0 ? n : q2 + 1; }
        if (s[i] === ';') i++;
        break;
      }
      default:
        if (IGNORED.has(cmd)) { known++; skipToTerminator(); }
        else { unknown[cmd] = (unknown[cmd] || 0) + 1; skipToTerminator(); }
    }
  }

  // ---- Statistiques et limites --------------------------------------------
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const grow = (x, y) => {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  };
  const pens = {};
  let drawLen = 0, travelLen = 0, segs = 0;
  const polyLen = (p) => {
    let L = 0;
    for (let j = 2; j < p.length; j += 2) L += Math.hypot(p[j] - p[j - 2], p[j + 1] - p[j - 1]);
    return L;
  };
  for (const op of ops) {
    if (op.kind === 'move') { travelLen += polyLen(op.pts); continue; }
    const pen = (pens[op.pen] ||= { pen: op.pen, length: 0, count: 0, width: op.width });
    pen.count++;
    if (op.kind === 'line') {
      for (let j = 0; j < op.pts.length; j += 2) grow(op.pts[j], op.pts[j + 1]);
      const L = polyLen(op.pts);
      pen.length += L; drawLen += L; segs += op.pts.length / 2 - 1;
    } else if (op.kind === 'fill') {
      for (const poly of op.polys) for (let j = 0; j < poly.length; j += 2) grow(poly[j], poly[j + 1]);
    } else if (op.kind === 'text') {
      const L = op.text.length * op.w * 1.5;
      const c = Math.cos(op.angle), sn = Math.sin(op.angle);
      const u0 = -(op.ax || 0) * L, v0 = -(op.ay || 0) * op.h;
      for (const [u, v] of [[u0, v0], [u0 + L, v0], [u0, v0 + op.h], [u0 + L, v0 + op.h]]) {
        grow(op.x + c * u - sn * v, op.y + sn * u + c * v);
      }
    }
  }
  if (minX === Infinity) { // aucun tracé : on prend les déplacements
    for (const op of ops) for (let j = 0; j < op.pts.length; j += 2) grow(op.pts[j], op.pts[j + 1]);
  }
  const bounds = minX === Infinity ? null : { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };

  return {
    ops,
    bounds,
    penColors,
    rotation,
    unknown,
    recognized: known > 0,
    stats: {
      commands,
      known,
      drawLen,
      travelLen,
      segments: segs,
      paths: ops.filter((o) => o.kind !== 'move').length,
      pens: Object.values(pens).sort((a, b) => a.pen - b.pen),
    },
  };
}
