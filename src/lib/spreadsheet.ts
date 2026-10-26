// Lecture de fichiers Excel (.xlsx) et CSV, sans aucune dépendance.
// Un .xlsx est une archive ZIP de fichiers XML : on lit l'archive (DecompressionStream),
// puis la première feuille et les chaînes partagées (DOMParser).

export type Cell = string | number | boolean | null;
export type Grid = Cell[][];

// ---------------- ZIP ----------------

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Ce navigateur ne sait pas lire les fichiers .xlsx. Enregistrez le fichier en CSV depuis Excel.');
  }
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readZip(buf: ArrayBuffer): Promise<Map<string, () => Promise<Uint8Array>>> {
  const bytes = new Uint8Array(buf);
  const view = new DataView(buf);
  // Fin du répertoire central (signature 0x06054b50), cherchée depuis la fin.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Fichier .xlsx illisible (archive invalide).');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const files = new Map<string, () => Promise<Uint8Array>>();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    files.set(name, async () => {
      const lNameLen = view.getUint16(localOffset + 26, true);
      const lExtraLen = view.getUint16(localOffset + 28, true);
      const start = localOffset + 30 + lNameLen + lExtraLen;
      const raw = bytes.subarray(start, start + compSize);
      if (method === 0) return raw;
      if (method === 8) return inflateRaw(raw);
      throw new Error(`Compression ZIP non supportée (${method}).`);
    });
  }
  return files;
}

// ---------------- XLSX ----------------

const xml = (s: string) => new DOMParser().parseFromString(s, 'application/xml');
const byTag = (root: Document | Element, tag: string) => Array.from(root.getElementsByTagNameNS('*', tag));

function colIndex(ref: string): number {
  const letters = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export async function readXlsx(buf: ArrayBuffer): Promise<Grid> {
  const files = await readZip(buf);
  const text = async (name: string) => {
    const f = files.get(name);
    return f ? new TextDecoder().decode(await f()) : null;
  };

  // Première feuille du classeur (via les relations), sinon sheet1.xml.
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const wb = await text('xl/workbook.xml');
  const rels = await text('xl/_rels/workbook.xml.rels');
  if (wb && rels) {
    const first = byTag(xml(wb), 'sheet')[0];
    const rid = first?.getAttribute('r:id') ?? first?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const rel = byTag(xml(rels), 'Relationship').find((r) => r.getAttribute('Id') === rid);
    const target = rel?.getAttribute('Target');
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  }

  const shared: string[] = [];
  const ss = await text('xl/sharedStrings.xml');
  if (ss) for (const si of byTag(xml(ss), 'si')) shared.push(byTag(si, 't').map((t) => t.textContent ?? '').join(''));

  const sheet = await text(sheetPath);
  if (!sheet) throw new Error('Aucune feuille trouvée dans le fichier Excel.');
  const grid: Grid = [];
  for (const row of byTag(xml(sheet), 'row')) {
    const r = Number(row.getAttribute('r')) - 1;
    const cells: Cell[] = [];
    let next = 0;
    for (const c of byTag(row, 'c')) {
      const ref = c.getAttribute('r');
      const ci = ref ? colIndex(ref) : next;
      next = ci + 1;
      const type = c.getAttribute('t');
      const v = byTag(c, 'v')[0]?.textContent ?? null;
      let value: Cell = null;
      if (type === 's') value = v !== null ? (shared[Number(v)] ?? '') : '';
      else if (type === 'inlineStr') value = byTag(c, 't').map((t) => t.textContent ?? '').join('');
      else if (type === 'str') value = v ?? '';
      else if (type === 'b') value = v === '1';
      else if (v !== null && v !== '') value = Number.isFinite(Number(v)) ? Number(v) : v;
      cells[ci] = value;
    }
    grid[Number.isFinite(r) && r >= 0 ? r : grid.length] = Array.from(cells, (x) => x ?? null);
  }
  return Array.from(grid, (r) => r ?? []);
}

// ---------------- CSV ----------------

function decodeText(buf: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, '');
  } catch {
    // Excel « CSV (séparateur : point-virgule) » est souvent en Windows-1252.
    return new TextDecoder('windows-1252').decode(buf);
  }
}

export function parseCsv(text: string): Grid {
  // Séparateur le plus fréquent sur les premières lignes (hors guillemets).
  const sample = text.split(/\r?\n/).slice(0, 20).join('\n').replace(/"[^"]*"/g, '');
  const delims = [';', ',', '\t'];
  const count = (d: string) => sample.split(d).length;
  const delim = delims.reduce((best, d) => (count(d) > count(best) ? d : best), ';');
  const rows: Grid = [];
  let row: Cell[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === delim) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export async function readSpreadsheet(file: File): Promise<Grid> {
  const buf = await file.arrayBuffer();
  const head = new Uint8Array(buf.slice(0, 4));
  const isZip = head[0] === 0x50 && head[1] === 0x4b;
  if (isZip) return readXlsx(buf);
  if (/\.xls$/i.test(file.name)) {
    throw new Error('Ancien format .xls non pris en charge : dans Excel, « Enregistrer sous » → Classeur Excel (.xlsx) ou CSV.');
  }
  return parseCsv(decodeText(buf));
}
