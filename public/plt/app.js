// PLT Viewer — visionneuse HPGL pour PC et Android (application web installable, hors ligne).
import { parseHPGL, PLU_PER_MM } from './hpgl.js';

// ---------------------------------------------------------------------------
// Icônes (traits SVG 24×24)
// ---------------------------------------------------------------------------
const ICONS = {
  open: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  fit: '<path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/>',
  plus: '<circle cx="11" cy="11" r="7"/><path d="M11 8v6M8 11h6M21 21l-5-5"/>',
  minus: '<circle cx="11" cy="11" r="7"/><path d="M8 11h6M21 21l-5-5"/>',
  ruler: '<path d="M3 15 15 3l6 6L9 21z"/><path d="m7 11 2 2M10 8l2 2M13 5l2 2"/>',
  rotate: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  measure: '<path d="M4 20 20 4"/><circle cx="4" cy="20" r="2"/><circle cx="20" cy="4" r="2"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  pause: '<path d="M7 4h4v16H7zM14 4h4v16h-4z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  more: '<circle cx="12" cy="5" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="12" cy="19" r="1.3"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  print: '<path d="M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><path d="M7 14h10v7H7z"/>',
  install: '<path d="M12 3v12M7 10l5 5 5-5"/><rect x="3" y="17" width="18" height="4" rx="1"/>',
  speed: '<path d="M12 14l4-5"/><path d="M3.5 17a9 9 0 1 1 17 0"/>',
  paste: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
};
function paintIcons(root = document) {
  root.querySelectorAll('i[data-i]').forEach((el) => {
    el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[el.dataset.i] || ''}</svg>`;
  });
}
paintIcons();

// ---------------------------------------------------------------------------
// Éléments et état
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const stage = $('stage'), canvas = $('canvas'), overlay = $('overlay');
const ctx = canvas.getContext('2d'), octx = overlay.getContext('2d');

const PX_PER_MM = 96 / 25.4; // échelle CSS « taille réelle »
const PALETTE = ['#9ca3af', '#111111', '#e11d48', '#16a34a', '#ca8a04', '#2563eb', '#c026d3', '#0891b2',
  '#ea580c', '#7c3aed', '#65a30d', '#db2777', '#0d9488', '#b45309', '#4f46e5', '#dc2626'];
const DASHES = {
  1: [0.02, 0.98], 2: [0.5, 0.5], 3: [0.7, 0.3], 4: [0.8, 0.1, 0.02, 0.08],
  5: [0.7, 0.1, 0.1, 0.1], 6: [0.5, 0.1, 0.1, 0.1, 0.1, 0.1], 7: [0.6, 0.1, 0.1, 0.1, 0.0, 0.1], 8: [0.4, 0.2, 0.2, 0.2],
};

const prefs = loadPrefs();
const docs = [];
let doc = null; // document actif
const view = { s: 1, tx: 0, ty: 0, rot: 0 };
let W = 0, H = 0, DPR = 1;
const anim = { active: false, playing: false, pos: 0, drawn: 0, last: 0, raf: 0 };
const measure = { on: false, a: null, b: null, hover: null };

function loadPrefs() {
  const def = { travel: false, width: false, dark: false, grid: true, mono: false, speed: 45 };
  try { return { ...def, ...JSON.parse(localStorage.getItem('plt-prefs') || '{}') }; } catch { return def; }
}
function savePrefs() { try { localStorage.setItem('plt-prefs', JSON.stringify(prefs)); } catch { /* ignoré */ } }

// ---------------------------------------------------------------------------
// Ouverture des fichiers
// ---------------------------------------------------------------------------
const fmt = (v, d = 1) => v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const mm = (plu, d = 1) => fmt(plu / PLU_PER_MM, d);
const fileSize = (b) => b < 1024 ? `${b} o` : b < 1048576 ? `${fmt(b / 1024)} Ko` : `${fmt(b / 1048576)} Mo`;

async function openFiles(files) {
  let last = null;
  for (const f of files) {
    try {
      const buf = new Uint8Array(await f.arrayBuffer());
      last = openData(f.name || 'sans-nom.plt', buf, true) || last;
    } catch (e) {
      toast(`Impossible de lire ${f.name} : ${e.message}`);
    }
  }
  if (last) activate(last);
}

function openData(name, bytes, remember) {
  if (!bytes.length) {
    toast(`« ${name} » est vide (0 octet). Copiez d'abord le fichier dans « Téléchargements » sur l'appareil, puis rouvrez-le.`);
    return null;
  }
  let result;
  try { result = parseHPGL(bytes); } catch (e) { toast(`Erreur d'analyse : ${e.message}`); return null; }
  if (!result.recognized || !result.ops.length) {
    toast(`« ${name} » ne semble pas être un fichier HPGL valide.`);
    return null;
  }
  const d = { id: Math.random().toString(36).slice(2), name, size: bytes.length, r: result, hidden: new Set(), colors: {} };
  prepare(d);
  docs.push(d);
  if (remember) saveRecent(name, bytes);
  return d;
}

/** Pré-calcule les Path2D par style (rendu rapide) et les index de simulation. */
function prepare(d) {
  const groups = new Map(), fills = new Map(), texts = [], moves = new Path2D();
  const starts = new Float64Array(d.r.ops.length + 1);
  let u = 0;
  d.r.ops.forEach((op, k) => {
    starts[k] = u;
    if (op.kind === 'line' || op.kind === 'move') {
      u += Math.max(1, op.pts.length / 2 - 1);
      const path = op.kind === 'move' ? moves : groupPath(groups, op);
      const p = op.pts;
      path.moveTo(p[0], p[1]);
      for (let j = 2; j < p.length; j += 2) path.lineTo(p[j], p[j + 1]);
    } else if (op.kind === 'fill') {
      u += 1;
      let f = fills.get(op.pen);
      if (!f) fills.set(op.pen, (f = new Path2D()));
      for (const poly of op.polys) {
        f.moveTo(poly[0], poly[1]);
        for (let j = 2; j < poly.length; j += 2) f.lineTo(poly[j], poly[j + 1]);
        f.closePath();
      }
    } else if (op.kind === 'text') { u += 1; texts.push(op); }
  });
  starts[d.r.ops.length] = u;
  d.cache = { groups: [...groups.values()], fills, texts, moves };
  d.starts = starts;
  d.total = u;
}
function groupPath(groups, op) {
  const key = `${op.pen}|${op.width}|${op.lt}|${op.dash}`;
  let g = groups.get(key);
  if (!g) groups.set(key, (g = { pen: op.pen, width: op.width, lt: op.lt, dash: op.dash, path: new Path2D() }));
  return g.path;
}

function activate(d) {
  stopAnim();
  doc = d;
  measure.a = measure.b = null;
  view.rot = 0;
  $('welcome').hidden = !!doc;
  updateDocSelect();
  updatePanel();
  resize();
  fit();
}

function closeDoc() {
  if (!doc) return;
  const k = docs.indexOf(doc);
  docs.splice(k, 1);
  doc = null;
  if (docs.length) activate(docs[Math.min(k, docs.length - 1)]);
  else { stopAnim(); $('welcome').hidden = false; updateDocSelect(); updatePanel(); renderRecent(); render(); }
}

function updateDocSelect() {
  const sel = $('docSelect');
  sel.hidden = !docs.length;
  sel.innerHTML = docs.map((d) => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');
  if (doc) sel.value = doc.id;
  document.title = doc ? `${doc.name} — PLT Viewer` : 'PLT Viewer';
  for (const id of ['btnFit', 'btnZoomIn', 'btnZoomOut', 'btn1to1', 'btnRotate', 'btnMeasure', 'btnPlay', 'btnPanel']) $(id).disabled = !doc;
}
const escapeHtml = (t) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------------------------------------------------------------------------
// Couleurs
// ---------------------------------------------------------------------------
function penColor(d, pen, darkPaper = prefs.dark) {
  if (prefs.mono) return darkPaper ? '#f5f5f5' : '#111111';
  if (d.colors[pen]) return d.colors[pen];
  const pc = d.r.penColors[pen];
  let c = pc ? `#${pc.map((v) => v.toString(16).padStart(2, '0')).join('')}` : PALETTE[((pen % PALETTE.length) + PALETTE.length) % PALETTE.length];
  if (darkPaper && (c === '#111111' || c === '#000000')) c = '#f5f5f5';
  if (!darkPaper && c.toLowerCase() === '#ffffff') c = '#111111';
  return c;
}

// ---------------------------------------------------------------------------
// Vue : transformations
// ---------------------------------------------------------------------------
const rotRad = () => view.rot * Math.PI / 180;
function worldToScreen(x, y, v = view) {
  const a = v.rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const xr = x * c - y * s, yr = x * s + y * c;
  return [v.tx + v.s * xr, v.ty - v.s * yr];
}
function screenToWorld(sx, sy) {
  const xr = (sx - view.tx) / view.s, yr = (view.ty - sy) / view.s;
  const a = -rotRad(), c = Math.cos(a), s = Math.sin(a);
  return [xr * c - yr * s, xr * s + yr * c];
}
function rotatedBounds(b, rot) {
  const a = rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of [[b.minX, b.minY], [b.maxX, b.minY], [b.minX, b.maxY], [b.maxX, b.maxY]]) {
    const xr = x * c - y * s, yr = x * s + y * c;
    x0 = Math.min(x0, xr); x1 = Math.max(x1, xr); y0 = Math.min(y0, yr); y1 = Math.max(y1, yr);
  }
  return { minX: x0, minY: y0, maxX: x1, maxY: y1, width: x1 - x0, height: y1 - y0 };
}
function fit() {
  if (!doc || !doc.r.bounds || !W) return render();
  const b = rotatedBounds(doc.r.bounds, view.rot);
  const m = Math.min(40, Math.min(W, H) * 0.06);
  view.s = Math.min((W - 2 * m) / (b.width || 1), (H - 2 * m) / (b.height || 1));
  if (!isFinite(view.s) || view.s <= 0) view.s = 0.1;
  view.tx = W / 2 - view.s * (b.minX + b.maxX) / 2;
  view.ty = H / 2 + view.s * (b.minY + b.maxY) / 2;
  render();
}
function zoomAt(sx, sy, k) {
  const s2 = Math.min(500, Math.max(1e-5, view.s * k));
  k = s2 / view.s;
  view.s = s2;
  view.tx = sx - (sx - view.tx) * k;
  view.ty = sy - (sy - view.ty) * k;
  render();
}
function realSize() {
  const target = PX_PER_MM / PLU_PER_MM;
  zoomAt(W / 2, H / 2, target / view.s);
}

function resize() {
  DPR = window.devicePixelRatio || 1;
  const r = stage.getBoundingClientRect();
  const oldW = W, oldH = H;
  W = r.width; H = r.height;
  for (const c of [canvas, overlay]) {
    c.width = Math.max(1, Math.round(W * DPR));
    c.height = Math.max(1, Math.round(H * DPR));
  }
  if (oldW && doc) { view.tx += (W - oldW) / 2; view.ty += (H - oldH) / 2; }
  render();
}
new ResizeObserver(() => resize()).observe(stage);

// ---------------------------------------------------------------------------
// Rendu
// ---------------------------------------------------------------------------
/**
 * Dessine la scène complète.
 * @param {CanvasRenderingContext2D} c
 * @param {object} v  transformation {s, tx, ty, rot}
 * @param {object} o  options {w, h, dpr, dark, grid, travel, realWidth, hairPx, upTo}
 */
function drawScene(c, d, v, o) {
  c.setTransform(o.dpr, 0, 0, o.dpr, 0, 0);
  c.fillStyle = o.dark ? '#16181d' : '#ffffff';
  c.fillRect(0, 0, o.w, o.h);
  if (!d) return;
  c.save();
  c.translate(v.tx, v.ty);
  c.scale(v.s, -v.s);
  c.rotate(v.rot * Math.PI / 180);
  const px = 1 / v.s; // 1 pixel CSS en unités traceur
  if (o.grid) drawGrid(c, v, o, px);
  c.lineCap = 'round';
  c.lineJoin = 'round';
  if (o.upTo == null) {
    for (const [pen, f] of d.cache.fills) {
      if (d.hidden.has(pen)) continue;
      c.fillStyle = penColor(d, pen, o.dark);
      c.globalAlpha = 0.85;
      c.fill(f, 'evenodd');
      c.globalAlpha = 1;
    }
    for (const g of d.cache.groups) {
      if (d.hidden.has(g.pen)) continue;
      applyStroke(c, d, g, px, o);
      c.stroke(g.path);
    }
    c.setLineDash([]);
    for (const t of d.cache.texts) if (!d.hidden.has(t.pen)) drawText(c, d, t, o);
    if (o.travel) {
      c.strokeStyle = 'rgba(239,68,68,.55)';
      c.lineWidth = px;
      c.setLineDash([4 * px, 4 * px]);
      c.stroke(d.cache.moves);
      c.setLineDash([]);
    }
  } else {
    drawRange(c, d, 0, o.upTo, px, o);
  }
  c.restore();
}

function applyStroke(c, d, g, px, o) {
  c.strokeStyle = penColor(d, g.pen, o.dark);
  c.lineWidth = o.realWidth ? Math.max(g.width * PLU_PER_MM, px * o.hairPx) : px * o.hairPx;
  const pat = g.lt ? DASHES[Math.abs(g.lt)] || DASHES[2] : null;
  c.setLineDash(pat ? pat.map((f) => Math.max(f * g.dash, f ? px : 0)) : []);
}

function drawText(c, d, t, o) {
  c.save();
  c.translate(t.x, t.y);
  c.rotate(t.angle);
  c.scale(1, -1);
  c.fillStyle = penColor(d, t.pen, o.dark);
  c.font = `${t.h * 1.35}px "Segoe UI", Roboto, Arial, sans-serif`;
  c.textBaseline = 'alphabetic';
  c.fillText(t.text, 0, 0);
  c.restore();
}

/** Dessine les unités [a, b) de la simulation (incrémental possible). */
function drawRange(c, d, a, b, px, o) {
  const ops = d.r.ops, st = d.starts;
  let lo = 0, hi = ops.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (st[mid] <= a) lo = mid; else hi = mid - 1; }
  for (let k = lo; k < ops.length && st[k] < b; k++) {
    const op = ops[k];
    if (op.kind !== 'move' && d.hidden.has(op.pen)) continue;
    const la = Math.max(a, st[k]) - st[k], lb = Math.min(b, st[k + 1]) - st[k];
    if (lb <= la) continue;
    if (op.kind === 'line' || op.kind === 'move') {
      if (op.kind === 'move') {
        if (!o.travel) continue;
        c.strokeStyle = 'rgba(239,68,68,.55)'; c.lineWidth = px; c.setLineDash([4 * px, 4 * px]);
      } else applyStroke(c, d, op, px, o);
      const p = op.pts, j0 = Math.floor(la), j1 = Math.min(Math.ceil(lb), p.length / 2 - 1);
      c.beginPath();
      c.moveTo(p[2 * j0], p[2 * j0 + 1]);
      for (let j = j0 + 1; j <= j1; j++) c.lineTo(p[2 * j], p[2 * j + 1]);
      c.stroke();
    } else if (op.kind === 'fill') {
      c.setLineDash([]);
      c.fillStyle = penColor(d, op.pen, o.dark);
      c.globalAlpha = 0.85;
      c.beginPath();
      for (const poly of op.polys) {
        c.moveTo(poly[0], poly[1]);
        for (let j = 2; j < poly.length; j += 2) c.lineTo(poly[j], poly[j + 1]);
        c.closePath();
      }
      c.fill('evenodd');
      c.globalAlpha = 1;
    } else if (op.kind === 'text') drawText(c, d, op, o);
  }
  c.setLineDash([]);
}

function drawGrid(c, v, o, px) {
  const step = 10 * PLU_PER_MM; // 10 mm
  if (step * v.s < 6) return;
  // zone visible en coordonnées monde
  const pts = [[0, 0], [o.w, 0], [0, o.h], [o.w, o.h]].map(([sx, sy]) => {
    const xr = (sx - v.tx) / v.s, yr = (v.ty - sy) / v.s;
    const a = -v.rot * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
    return [xr * cs - yr * sn, xr * sn + yr * cs];
  });
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.floor(Math.min(...xs) / step) * step, x1 = Math.max(...xs);
  const y0 = Math.floor(Math.min(...ys) / step) * step, y1 = Math.max(...ys);
  if ((x1 - x0) / step > 2000 || (y1 - y0) / step > 2000) return;
  const minor = new Path2D(), major = new Path2D();
  for (let x = x0; x <= x1; x += step) {
    const p = Math.round(x / step) % 10 === 0 ? major : minor;
    p.moveTo(x, y0); p.lineTo(x, y1);
  }
  for (let y = y0; y <= y1; y += step) {
    const p = Math.round(y / step) % 10 === 0 ? major : minor;
    p.moveTo(x0, y); p.lineTo(x1, y);
  }
  c.lineWidth = px;
  c.strokeStyle = o.dark ? 'rgba(255,255,255,.06)' : 'rgba(15,23,42,.06)';
  c.stroke(minor);
  c.strokeStyle = o.dark ? 'rgba(255,255,255,.14)' : 'rgba(15,23,42,.14)';
  c.stroke(major);
}

let renderQueued = false;
function render() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    drawScene(ctx, doc, view, sceneOpts(anim.active ? anim.drawn : null));
    drawOverlay();
    updateStatus();
  });
}
function sceneOpts(upTo) {
  return { w: W, h: H, dpr: DPR, dark: prefs.dark, grid: prefs.grid, travel: prefs.travel, realWidth: prefs.width, hairPx: 1.2, upTo };
}

function drawOverlay() {
  octx.setTransform(DPR, 0, 0, DPR, 0, 0);
  octx.clearRect(0, 0, W, H);
  if (!doc) return;
  if (anim.active && doc.total) {
    const p = penHead(Math.min(anim.drawn, doc.total));
    if (p) {
      const [x, y] = worldToScreen(p[0], p[1]);
      octx.fillStyle = '#ef4444';
      octx.strokeStyle = '#fff';
      octx.lineWidth = 2;
      octx.beginPath(); octx.arc(x, y, 6, 0, Math.PI * 2); octx.fill(); octx.stroke();
    }
  }
  if (measure.on || measure.a) {
    const a = measure.a, b = measure.b || (measure.on ? measure.hover : null);
    const dot = (p) => {
      const [x, y] = worldToScreen(p[0], p[1]);
      octx.beginPath(); octx.arc(x, y, 5, 0, Math.PI * 2); octx.fill(); octx.stroke();
    };
    octx.fillStyle = '#2563eb'; octx.strokeStyle = '#fff'; octx.lineWidth = 2;
    if (a && b) {
      const [x0, y0] = worldToScreen(a[0], a[1]), [x1, y1] = worldToScreen(b[0], b[1]);
      octx.strokeStyle = '#2563eb'; octx.lineWidth = 2; octx.setLineDash([6, 4]);
      octx.beginPath(); octx.moveTo(x0, y0); octx.lineTo(x1, y1); octx.stroke(); octx.setLineDash([]);
      octx.strokeStyle = '#fff';
      const txt = `${mm(Math.hypot(b[0] - a[0], b[1] - a[1]), 2)} mm`;
      octx.font = '600 13px system-ui, sans-serif';
      const tw = octx.measureText(txt).width;
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 - 14;
      octx.fillStyle = 'rgba(37,99,235,.95)';
      roundRect(octx, mx - tw / 2 - 8, my - 12, tw + 16, 24, 6); octx.fill();
      octx.fillStyle = '#fff'; octx.textAlign = 'center'; octx.textBaseline = 'middle';
      octx.fillText(txt, mx, my);
      octx.fillStyle = '#2563eb';
      dot(b);
    }
    if (a) dot(a);
    else if (measure.hover) dot(measure.hover);
  }
}
function roundRect(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

function penHead(u) {
  const ops = doc.r.ops, st = doc.starts;
  let lo = 0, hi = ops.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (st[mid] <= u) lo = mid; else hi = mid - 1; }
  const op = ops[Math.min(lo, ops.length - 1)];
  if (op.pts) {
    const j = Math.min(Math.round(u - st[lo]), op.pts.length / 2 - 1);
    return [op.pts[2 * j], op.pts[2 * j + 1]];
  }
  return op.kind === 'text' ? [op.x, op.y] : [op.polys[0][0], op.polys[0][1]];
}

// ---------------------------------------------------------------------------
// Barre d'état et panneau
// ---------------------------------------------------------------------------
let lastCursor = null;
function updateStatus() {
  if (!doc) { $('sCoord').textContent = ''; $('sSize').textContent = ''; $('sZoom').textContent = ''; return; }
  $('sCoord').textContent = lastCursor ? `X ${mm(lastCursor[0])} · Y ${mm(lastCursor[1])} mm` : 'X — · Y —';
  const b = doc.r.bounds;
  $('sSize').textContent = b ? `${mm(b.width)} × ${mm(b.height)} mm` : '';
  $('sZoom').textContent = `${fmt(view.s / (PX_PER_MM / PLU_PER_MM) * 100, 0)} %`;
  const a = measure.a, m = measure.b || (measure.on && a ? measure.hover : null);
  $('sMeasure').textContent = a && m
    ? `↔ ${mm(Math.hypot(m[0] - a[0], m[1] - a[1]), 2)} mm (Δx ${mm(Math.abs(m[0] - a[0]), 2)} · Δy ${mm(Math.abs(m[1] - a[1]), 2)})`
    : measure.on ? 'Touchez le point de départ' : '';
}

function updatePanel() {
  if (!doc) { $('panel').hidden = true; return; }
  const r = doc.r, b = r.bounds, s = r.stats;
  $('pName').textContent = doc.name;
  const rows = [
    ['Fichier', fileSize(doc.size)],
    ['Largeur', b ? `${mm(b.width)} mm` : '—'],
    ['Hauteur', b ? `${mm(b.height)} mm` : '—'],
    ['Origine', b ? `${mm(b.minX)} ; ${mm(b.minY)} mm` : '—'],
    ['Longueur tracée', `${fmt(s.drawLen / PLU_PER_MM / 1000, 2)} m`],
    ['Déplacements', `${fmt(s.travelLen / PLU_PER_MM / 1000, 2)} m`],
    ['Tracés', s.paths.toLocaleString('fr-FR')],
    ['Segments', s.segments.toLocaleString('fr-FR')],
    ['Commandes', s.commands.toLocaleString('fr-FR')],
  ];
  if (r.rotation) rows.push(['Rotation (RO)', `${r.rotation}°`]);
  $('pInfo').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  $('pPens').innerHTML = s.pens.map((p) => `
    <li>
      <input type="checkbox" data-pen="${p.pen}" ${doc.hidden.has(p.pen) ? '' : 'checked'} title="Afficher / masquer">
      <input type="color" data-pen="${p.pen}" value="${toHex(penColor(doc, p.pen, false))}" title="Couleur">
      <span class="lbl">Stylo ${p.pen}<br><small class="len">${fmt(p.width, 2)} mm</small></span>
      <span class="len">${fmt(p.length / PLU_PER_MM / 1000, 2)} m</span>
    </li>`).join('') || '<li>Aucun tracé</li>';
  const unk = Object.entries(r.unknown);
  $('pUnknown').hidden = !unk.length;
  $('pUnknown').textContent = unk.length ? `Commandes non prises en charge : ${unk.map(([k, v]) => `${k} (${v})`).join(', ')}` : '';
}
const toHex = (c) => (/^#[0-9a-f]{6}$/i.test(c) ? c : '#111111');

$('pPens').addEventListener('change', (e) => {
  const t = e.target, pen = Number(t.dataset.pen);
  if (!doc || Number.isNaN(pen)) return;
  if (t.type === 'checkbox') { if (t.checked) doc.hidden.delete(pen); else doc.hidden.add(pen); }
  render();
});
$('pPens').addEventListener('input', (e) => {
  const t = e.target;
  if (t.type === 'color' && doc) { doc.colors[Number(t.dataset.pen)] = t.value; render(); }
});

// ---------------------------------------------------------------------------
// Interactions : souris, tactile, clavier
// ---------------------------------------------------------------------------
const pointers = new Map();
let gesture = null, lastTap = 0;
const local = (e) => { const r = stage.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

stage.addEventListener('pointerdown', (e) => {
  if (!doc || e.button > 1) return;
  stage.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, local(e));
  startGesture();
});
stage.addEventListener('pointermove', (e) => {
  const p = local(e);
  if (doc) {
    lastCursor = screenToWorld(p[0], p[1]);
    if (measure.on) measure.hover = snap(p);
  }
  if (!pointers.has(e.pointerId)) { if (doc) { drawOverlay(); updateStatus(); } return; }
  pointers.set(e.pointerId, p);
  if (!gesture) return;
  const pts = [...pointers.values()];
  if (pts.length === 1 && gesture.n === 1) {
    const dx = p[0] - gesture.x, dy = p[1] - gesture.y;
    if (Math.hypot(dx, dy) > 4) gesture.moved = true;
    if (gesture.moved) {
      stage.classList.add('grab');
      view.tx = gesture.tx + dx; view.ty = gesture.ty + dy;
      render();
    }
  } else if (pts.length >= 2 && gesture.n >= 2) {
    const [a, b] = pts;
    const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2;
    const dist = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
    const k = dist / gesture.dist;
    gesture.moved = true;
    view.s = Math.min(500, Math.max(1e-5, gesture.s * k));
    const kk = view.s / gesture.s;
    view.tx = cx - (gesture.cx - gesture.tx) * kk;
    view.ty = cy - (gesture.cy - gesture.ty) * kk;
    render();
  } else render();
});
function startGesture() {
  const pts = [...pointers.values()];
  if (pts.length === 1) gesture = { n: 1, x: pts[0][0], y: pts[0][1], tx: view.tx, ty: view.ty, moved: false };
  else {
    const [a, b] = pts;
    gesture = {
      n: 2, moved: true, s: view.s, tx: view.tx, ty: view.ty,
      cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2, dist: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1,
    };
  }
}
function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  const p = pointers.get(e.pointerId);
  pointers.delete(e.pointerId);
  stage.classList.remove('grab');
  if (gesture && gesture.n === 1 && !gesture.moved && e.type === 'pointerup') tap(p);
  if (pointers.size) startGesture(); else gesture = null;
}
stage.addEventListener('pointerup', endPointer);
stage.addEventListener('pointercancel', endPointer);
stage.addEventListener('pointerleave', () => { if (!pointers.size) { lastCursor = null; measure.hover = null; drawOverlay(); updateStatus(); } });

function tap(p) {
  if (measure.on) {
    const w = snap(p);
    if (!measure.a || measure.b) { measure.a = w; measure.b = null; }
    else measure.b = w;
    drawOverlay(); updateStatus();
    return;
  }
  const now = performance.now();
  if (now - lastTap < 320) { zoomAt(p[0], p[1], 2); lastTap = 0; } else lastTap = now;
}

/** Aimantation sur le sommet le plus proche (12 px). */
function snap(p) {
  const w = screenToWorld(p[0], p[1]);
  if (!doc || doc.r.stats.segments > 400000) return w;
  const lim = 12 / view.s;
  let best = null, bd = lim * lim;
  for (const op of doc.r.ops) {
    if (op.kind !== 'line') continue;
    const q = op.pts;
    for (let j = 0; j < q.length; j += 2) {
      const dx = q[j] - w[0], dy = q[j + 1] - w[1];
      if (Math.abs(dx) > lim || Math.abs(dy) > lim) continue;
      const d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; best = [q[j], q[j + 1]]; }
    }
  }
  return best || w;
}

stage.addEventListener('wheel', (e) => {
  if (!doc) return;
  e.preventDefault();
  const [x, y] = local(e);
  const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
  zoomAt(x, y, Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015)));
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input, select, textarea')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') { e.preventDefault(); $('fileInput').click(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Escape') {
    $('menu').hidden = true;
    if (measure.on) toggleMeasure(false);
    return;
  }
  if (!doc) return;
  const step = 60;
  const act = {
    f: fit, F: fit, '+': () => zoomAt(W / 2, H / 2, 1.25), '=': () => zoomAt(W / 2, H / 2, 1.25),
    '-': () => zoomAt(W / 2, H / 2, 0.8), 1: realSize, r: rotate, R: rotate, m: () => toggleMeasure(), M: () => toggleMeasure(),
    i: togglePanel, I: togglePanel, ' ': toggleAnim,
    ArrowLeft: () => { view.tx += step; render(); }, ArrowRight: () => { view.tx -= step; render(); },
    ArrowUp: () => { view.ty += step; render(); }, ArrowDown: () => { view.ty -= step; render(); },
  }[e.key];
  if (act) { e.preventDefault(); act(); }
});

function rotate() { view.rot = (view.rot + 90) % 360; fit(); }
function togglePanel() { $('panel').hidden = !$('panel').hidden; $('btnPanel').classList.toggle('active', !$('panel').hidden); }
function toggleMeasure(on = !measure.on) {
  measure.on = on;
  if (!on) { measure.a = measure.b = measure.hover = null; }
  stage.classList.toggle('measure', on);
  $('btnMeasure').classList.toggle('active', on);
  drawOverlay(); updateStatus();
}

// ---------------------------------------------------------------------------
// Simulation du tracé
// ---------------------------------------------------------------------------
const speedValue = () => Math.pow(10, 1 + prefs.speed * 0.045); // 10 à ~1 000 000 unités/s
function toggleAnim() {
  if (!doc) return;
  if (!anim.active) { anim.active = true; anim.pos = 0; anim.drawn = 0; $('animBar').hidden = false; $('btnPlay').classList.add('active'); resize(); }
  else if (!anim.playing && anim.pos >= doc.total) { anim.pos = 0; anim.drawn = 0; render(); }
  anim.playing = !anim.playing;
  setPlayIcon();
  if (anim.playing) { anim.last = performance.now(); anim.raf = requestAnimationFrame(step); }
}
function setPlayIcon() {
  const i = $('animToggle').querySelector('i');
  i.dataset.i = anim.playing ? 'pause' : 'play';
  paintIcons($('animToggle'));
}
function step(t) {
  if (!anim.playing || !doc) return;
  const dt = Math.min(0.1, (t - anim.last) / 1000);
  anim.last = t;
  anim.pos = Math.min(doc.total, anim.pos + speedValue() * dt);
  const target = Math.floor(anim.pos);
  if (target > anim.drawn && !renderQueued) {
    ctx.save();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.translate(view.tx, view.ty); ctx.scale(view.s, -view.s); ctx.rotate(rotRad());
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    drawRange(ctx, doc, anim.drawn, target, 1 / view.s, sceneOpts(null));
    ctx.restore();
    anim.drawn = target;
    drawOverlay();
  } else anim.drawn = target;
  $('animPos').value = String(Math.round(anim.drawn / doc.total * 1000));
  if (anim.pos >= doc.total) { anim.playing = false; setPlayIcon(); return; }
  anim.raf = requestAnimationFrame(step);
}
function stopAnim() {
  cancelAnimationFrame(anim.raf);
  const was = anim.active;
  anim.active = anim.playing = false;
  $('animBar').hidden = true;
  $('btnPlay').classList.remove('active');
  if (was) resize();
}
$('animToggle').onclick = toggleAnim;
$('animStop').onclick = () => { stopAnim(); render(); };
$('animPos').addEventListener('input', (e) => {
  if (!doc) return;
  anim.pos = anim.drawn = Math.floor(Number(e.target.value) / 1000 * doc.total);
  render();
});
$('animSpeed').value = String(prefs.speed);
$('animSpeed').addEventListener('input', (e) => { prefs.speed = Number(e.target.value); savePrefs(); });

// ---------------------------------------------------------------------------
// Export SVG / PNG et impression
// ---------------------------------------------------------------------------
const r2 = (v) => Math.round(v * 100) / 100;
function svgContent(d) {
  const groups = new Map(), parts = [];
  for (const op of d.r.ops) {
    if (op.kind === 'move' || d.hidden.has(op.pen)) continue;
    if (op.kind === 'line') {
      const key = `${op.pen}|${op.width}|${op.lt}|${op.dash}`;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { op, d: [] }));
      const p = op.pts;
      let s = `M${r2(p[0])} ${r2(p[1])}`;
      for (let j = 2; j < p.length; j += 2) s += `L${r2(p[j])} ${r2(p[j + 1])}`;
      g.d.push(s);
    } else if (op.kind === 'fill') {
      const dd = op.polys.map((q) => {
        let s = `M${r2(q[0])} ${r2(q[1])}`;
        for (let j = 2; j < q.length; j += 2) s += `L${r2(q[j])} ${r2(q[j + 1])}`;
        return `${s}Z`;
      }).join('');
      parts.push(`<path d="${dd}" fill="${penColor(d, op.pen, false)}" fill-rule="evenodd" fill-opacity=".85" stroke="none"/>`);
    }
  }
  for (const { op, d: segs } of groups.values()) {
    const pat = op.lt ? DASHES[Math.abs(op.lt)] || DASHES[2] : null;
    const dash = pat ? ` stroke-dasharray="${pat.map((f) => r2(Math.max(f * op.dash, f ? 4 : 0))).join(' ')}"` : '';
    parts.push(`<path d="${segs.join('')}" stroke="${penColor(d, op.pen, false)}" stroke-width="${r2(Math.max(op.width, 0.1) * PLU_PER_MM)}"${dash}/>`);
  }
  const texts = d.cache.texts.filter((t) => !d.hidden.has(t.pen)).map((t) =>
    `<text transform="translate(${r2(t.x)} ${r2(-t.y)}) rotate(${r2(-t.angle * 180 / Math.PI)})" font-size="${r2(t.h * 1.35)}" fill="${penColor(d, t.pen, false)}">${escapeHtml(t.text)}</text>`).join('');
  return `<g transform="rotate(${-view.rot})"><g transform="scale(1,-1)" fill="none" stroke-linecap="round" stroke-linejoin="round">${parts.join('')}</g>`
    + `<g font-family="Segoe UI, Roboto, Arial, sans-serif">${texts}</g></g>`;
}
/** Limites (en coordonnées SVG, y vers le bas) du dessin tel qu'affiché. */
function svgBox(d, margin = 0) {
  const b = rotatedBounds(d.r.bounds, view.rot);
  return { x: b.minX - margin, y: -b.maxY - margin, w: b.width + 2 * margin, h: b.height + 2 * margin };
}
function exportSvg() {
  if (!doc) return;
  const box = svgBox(doc, 2 * PLU_PER_MM);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${r2(box.w / PLU_PER_MM)}mm" height="${r2(box.h / PLU_PER_MM)}mm" viewBox="${r2(box.x)} ${r2(box.y)} ${r2(box.w)} ${r2(box.h)}">\n<rect x="${r2(box.x)}" y="${r2(box.y)}" width="${r2(box.w)}" height="${r2(box.h)}" fill="#fff"/>\n${svgContent(doc)}\n</svg>\n`;
  download(new Blob([svg], { type: 'image/svg+xml' }), baseName(doc.name) + '.svg');
}
function exportPng() {
  if (!doc) return;
  const b = rotatedBounds(doc.r.bounds, view.rot);
  const maxSide = 4096, margin = 24;
  const k = Math.min((maxSide - 2 * margin) / (b.width || 1), (maxSide - 2 * margin) / (b.height || 1));
  const w = Math.max(16, Math.round(b.width * k + 2 * margin)), h = Math.max(16, Math.round(b.height * k + 2 * margin));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const v = { s: k, rot: view.rot, tx: margin - k * b.minX, ty: margin + k * b.maxY };
  drawScene(c.getContext('2d'), doc, v, { w, h, dpr: 1, dark: false, grid: false, travel: false, realWidth: prefs.width, hairPx: 2, upTo: null });
  c.toBlob((blob) => blob ? download(blob, baseName(doc.name) + '.png') : toast('Image trop grande pour être exportée.'), 'image/png');
}
const baseName = (n) => n.replace(/\.[^.]+$/, '') || 'dessin';
async function download(blob, name) {
  // Dans un artefact claude.ai, les téléchargements passent par la capacité « downloads ».
  if (window.claude && typeof window.claude.use === 'function') {
    const dl = await window.claude.use('downloads').catch(() => null);
    if (dl) {
      try { await dl.save({ filename: name, data: blob }); toast(`Exporté : ${name}`); }
      catch (e) { if (e && e.code !== 'declined') toast(`Export impossible ici (${e.code || 'erreur'}).`); }
      return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  toast(`Exporté : ${name}`);
}

function setPageStyle(css) {
  let el = $('pageStyle');
  if (!el) { el = document.createElement('style'); el.id = 'pageStyle'; document.head.appendChild(el); }
  el.textContent = css;
}
function printFit() {
  if (!doc) return;
  const box = svgBox(doc, PLU_PER_MM);
  const land = box.w > box.h;
  const pw = land ? 277 : 190, ph = land ? 190 : 277;
  setPageStyle(`@page { size: A4 ${land ? 'landscape' : 'portrait'}; margin: 10mm; }`);
  $('printArea').innerHTML = `<div class="page"><svg xmlns="http://www.w3.org/2000/svg" width="${pw}mm" height="${ph - 1}mm" viewBox="${box.x} ${box.y} ${box.w} ${box.h}">${svgContent(doc)}</svg></div>`;
  doPrint();
}
function printTiled() {
  if (!doc) return;
  const box = svgBox(doc, 0);
  const wMM = box.w / PLU_PER_MM, hMM = box.h / PLU_PER_MM;
  const count = (pw, ph) => Math.ceil(wMM / pw) * Math.ceil(hMM / ph);
  const land = count(277, 190) < count(190, 277);
  const pw = land ? 277 : 190, ph = (land ? 190 : 277) - 8; // 8 mm pour l'étiquette
  const cols = Math.max(1, Math.ceil(wMM / pw)), rows = Math.max(1, Math.ceil(hMM / ph));
  const total = cols * rows;
  if (total > 60 && !confirm(`L'impression en taille réelle nécessite ${total} pages A4. Continuer ?`)) return;
  setPageStyle(`@page { size: A4 ${land ? 'landscape' : 'portrait'}; margin: 10mm; }`);
  const tw = pw * PLU_PER_MM, th = ph * PLU_PER_MM;
  let html = `<svg width="0" height="0" style="position:absolute"><defs><g id="pltContent">${svgContent(doc)}</g></defs></svg>`;
  let n = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      n++;
      const vx = box.x + c * tw, vy = box.y + r * th;
      const cal = n === 1 ? ' — vérifiez l\'échelle : <span style="display:inline-block;width:50mm;border-top:2px solid #000;vertical-align:middle"></span> = 50 mm' : '';
      html += `<div class="page"><div style="height:8mm;font:9pt sans-serif;color:#444">${escapeHtml(doc.name)} — page ${n}/${total} (ligne ${r + 1}, colonne ${c + 1})${cal}</div>`
        + `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${pw}mm" height="${ph}mm" viewBox="${vx} ${vy} ${tw} ${th}">`
        + `<use href="#pltContent" xlink:href="#pltContent"/>`
        + `<rect x="${vx}" y="${vy}" width="${tw}" height="${th}" fill="none" stroke="#999" stroke-width="${0.2 * PLU_PER_MM}" stroke-dasharray="${2 * PLU_PER_MM} ${2 * PLU_PER_MM}"/></svg></div>`;
    }
  }
  $('printArea').innerHTML = html;
  doPrint();
}
function doPrint() {
  $('menu').hidden = true;
  setTimeout(() => {
    window.print();
    setTimeout(() => { $('printArea').innerHTML = ''; }, 1000);
  }, 50);
}

// ---------------------------------------------------------------------------
// Fichiers récents (IndexedDB, sur l'appareil uniquement)
// ---------------------------------------------------------------------------
function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('plt-viewer', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('recent', { keyPath: 'name' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbDo(mode, fn) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('recent', mode);
    const out = fn(tx.objectStore('recent'));
    tx.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
    tx.onerror = () => reject(tx.error);
  });
}
async function saveRecent(name, bytes) {
  if (bytes.length > 30 * 1048576) return;
  try {
    await idbDo('readwrite', (s) => s.put({ name, date: Date.now(), size: bytes.length, data: bytes.slice().buffer }));
    const all = (await idbDo('readonly', (s) => s.getAll())) || [];
    all.sort((a, b) => b.date - a.date);
    if (all.length > 12) await idbDo('readwrite', (s) => all.slice(12).forEach((x) => s.delete(x.name)));
  } catch { /* stockage indisponible */ }
}
async function renderRecent() {
  let all = [];
  try { all = (await idbDo('readonly', (s) => s.getAll())) || []; } catch { /* ignoré */ }
  all.sort((a, b) => b.date - a.date);
  $('recent').hidden = !all.length;
  $('recentList').innerHTML = all.map((x) => `
    <li>
      <button class="open" data-name="${escapeHtml(x.name)}"><span class="name">${escapeHtml(x.name)}</span>
        <span class="date">${new Date(x.date).toLocaleDateString('fr-FR')} · ${fileSize(x.size)}</span></button>
      <button class="btn icon small" data-del="${escapeHtml(x.name)}" title="Retirer"><i data-i="trash"></i></button>
    </li>`).join('');
  paintIcons($('recentList'));
}
$('recentList').addEventListener('click', async (e) => {
  const open = e.target.closest('[data-name]'), del = e.target.closest('[data-del]');
  try {
    if (open) {
      const x = await idbDo('readonly', (s) => s.get(open.dataset.name));
      if (x) { const d = openData(x.name, new Uint8Array(x.data), true); if (d) activate(d); }
    } else if (del) {
      await idbDo('readwrite', (s) => s.delete(del.dataset.del));
      renderRecent();
    }
  } catch (err) { toast(`Erreur : ${err.message}`); }
});

// ---------------------------------------------------------------------------
// Boutons, menu, glisser-déposer
// ---------------------------------------------------------------------------
let toastTimer = 0;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
}

const fileInput = $('fileInput');
for (const id of ['btnOpen', 'btnOpen2']) {
  $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
}
const pasteDlg = $('pasteDlg');
const openPaste = () => {
  $('menu').hidden = true;
  if (typeof pasteDlg.showModal === 'function') pasteDlg.showModal(); else pasteDlg.setAttribute('open', '');
  $('pasteText').focus();
};
$('btnPaste').onclick = openPaste;
$('btnPaste2').onclick = openPaste;
pasteDlg.addEventListener('close', () => {
  const txt = $('pasteText').value;
  if (pasteDlg.returnValue !== 'ok' || !txt.trim()) return;
  const bytes = new Uint8Array(txt.length);
  for (let k = 0; k < txt.length; k++) bytes[k] = txt.charCodeAt(k) & 0xff;
  const d = openData('colle.plt', bytes, true);
  if (d) { $('pasteText').value = ''; activate(d); }
});
fileInput.onchange = () => { if (fileInput.files.length) openFiles([...fileInput.files]); fileInput.value = ''; };
$('btnSample').onclick = async () => {
  try {
    const bytes = window.PLT_SAMPLE
      ? Uint8Array.from(window.PLT_SAMPLE, (ch) => ch.charCodeAt(0))
      : new Uint8Array(await (await fetch('exemple.plt')).arrayBuffer());
    const d = openData('exemple.plt', bytes, false);
    if (d) activate(d);
  } catch { toast("Impossible de charger l'exemple."); }
};
$('docSelect').onchange = (e) => { const d = docs.find((x) => x.id === e.target.value); if (d) activate(d); };
$('btnFit').onclick = fit;
$('btnZoomIn').onclick = () => zoomAt(W / 2, H / 2, 1.4);
$('btnZoomOut').onclick = () => zoomAt(W / 2, H / 2, 1 / 1.4);
$('btn1to1').onclick = realSize;
$('btnRotate').onclick = rotate;
$('btnMeasure').onclick = () => toggleMeasure();
$('btnPlay').onclick = () => { if (anim.active) { stopAnim(); render(); } else toggleAnim(); };
$('btnPanel').onclick = togglePanel;
$('btnPanelClose').onclick = togglePanel;
$('btnMenu').onclick = (e) => { e.stopPropagation(); $('menu').hidden = !$('menu').hidden; };
document.addEventListener('pointerdown', (e) => {
  if (!$('menu').hidden && !e.target.closest('#menu, #btnMenu')) $('menu').hidden = true;
});
$('btnSvg').onclick = () => { $('menu').hidden = true; exportSvg(); };
$('btnPng').onclick = () => { $('menu').hidden = true; exportPng(); };
$('btnPrintFit').onclick = printFit;
$('btnPrintTile').onclick = printTiled;
$('btnClose').onclick = () => { $('menu').hidden = true; closeDoc(); };

for (const [id, key] of [['optTravel', 'travel'], ['optWidth', 'width'], ['optDark', 'dark'], ['optGrid', 'grid'], ['optMono', 'mono']]) {
  const el = $(id);
  el.checked = !!prefs[key];
  el.onchange = () => { prefs[key] = el.checked; savePrefs(); if (doc) updatePanel(); render(); };
}

let dragDepth = 0;
window.addEventListener('dragenter', (e) => { if (e.dataTransfer?.types?.includes('Files')) { dragDepth++; $('dropHint').hidden = false; } });
window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('dropHint').hidden = true; } });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0; $('dropHint').hidden = true;
  if (e.dataTransfer?.files?.length) openFiles([...e.dataTransfer.files]);
});

// ---------------------------------------------------------------------------
// Application installable : service worker, installation, ouverture par le système
// ---------------------------------------------------------------------------
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
let installEvt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; $('btnInstall').hidden = false; });
$('btnInstall').onclick = async () => {
  $('menu').hidden = true;
  if (!installEvt) return;
  installEvt.prompt();
  await installEvt.userChoice;
  installEvt = null; $('btnInstall').hidden = true;
};
// « Ouvrir avec » sur PC (Chrome / Edge, application installée)
if ('launchQueue' in window) {
  window.launchQueue.setConsumer(async (params) => {
    if (!params.files?.length) return;
    const files = await Promise.all(params.files.map((h) => h.getFile()));
    openFiles(files);
  });
}
// « Partager » vers l'application sur Android
(async () => {
  const url = new URL(location.href);
  if (!url.searchParams.has('share')) return;
  history.replaceState(null, '', url.pathname);
  try {
    const cache = await caches.open('plt-share');
    const keys = await cache.keys();
    const files = [];
    for (const k of keys) {
      const res = await cache.match(k);
      const name = decodeURIComponent(res.headers.get('x-name') || 'partage.plt');
      files.push(new File([await res.blob()], name));
      await cache.delete(k);
    }
    if (files.length) openFiles(files);
  } catch { toast('Impossible de récupérer le fichier partagé.'); }
})();

updateDocSelect();
renderRecent();
resize();
