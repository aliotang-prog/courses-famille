import type { FamilyData } from '../types';
import { buildBackup, type Cell } from './sheetBackup';

/**
 * Sauvegarde vers Google Sheets via les connecteurs claude.ai de la personne qui utilise l'appli
 * (capacité `mcp` de l'artefact). Hors de Claude (npm run dev), cette fonction n'est pas disponible.
 */

const SHEETS = 'Google Sheets';
const DRIVE = 'Google Drive';
const TITLE = 'Courses Famille – Sauvegarde';

interface McpResult {
  payload?: unknown;
  content?: Array<{ type: string; text?: string }>;
}
interface McpApi {
  callTool(server: string, tool: string, input?: unknown, options?: { cache?: false }): Promise<McpResult>;
}
export interface BackupError {
  code: string;
  message: string;
  server?: string;
}

let mcpPromise: Promise<McpApi | null> | null = null;
function getMcp(): Promise<McpApi | null> {
  if (!mcpPromise) {
    const c = (globalThis as { claude?: { use?: (n: string) => Promise<unknown> } }).claude;
    mcpPromise = c?.use ? (c.use('mcp') as Promise<McpApi | null>).catch(() => null) : Promise.resolve(null);
  }
  return mcpPromise;
}

/** La sauvegarde Google Sheets est-elle possible dans cette vue ? */
export async function backupAvailable(): Promise<boolean> {
  return (await getMcp()) !== null;
}

const payloadOf = (r: McpResult): Record<string, unknown> => {
  let p = r.payload;
  if (typeof p === 'string') {
    try {
      p = JSON.parse(p);
    } catch {
      /* texte brut */
    }
  }
  return p && typeof p === 'object' ? (p as Record<string, unknown>) : {};
};

export function sheetUrl(id: string) {
  return `https://docs.google.com/spreadsheets/d/${id}/edit`;
}

/**
 * Écrit toutes les données dans la feuille (crée la feuille si besoin) et renvoie son identifiant.
 * Chaque onglet est vidé puis réécrit : la feuille reflète exactement l'appli au moment de la sauvegarde.
 */
export async function backupToSheets(data: FamilyData, onStep?: (label: string) => void): Promise<string> {
  const mcp = await getMcp();
  if (!mcp) throw { code: 'unavailable', message: 'Sauvegarde Google disponible uniquement dans Claude.' } satisfies BackupError;

  const getMeta = async (id: string) =>
    payloadOf(
      await mcp.callTool(SHEETS, 'get_spreadsheet', { spreadsheetId: id, fields: ['sheets.properties.sheetId', 'sheets.properties.title'] }, { cache: false }),
    );
  const sheetsOf = (meta: Record<string, unknown>) =>
    ((meta.sheets as Array<{ properties?: { sheetId?: number; title?: string } }>) ?? []).map((s) => ({ id: s.properties?.sheetId ?? 0, title: s.properties?.title ?? '' }));

  let id = data.settings.backupSheetId ?? null;
  let meta: Record<string, unknown> | null = null;
  if (id) {
    onStep?.('Ouverture de la feuille…');
    try {
      meta = await getMeta(id);
    } catch (e) {
      // Feuille supprimée ou inaccessible : on en crée une nouvelle.
      if ((e as BackupError)?.code !== 'tool_error') throw e;
      id = null;
    }
  }
  if (!id) {
    onStep?.('Création de la feuille Google…');
    const created = payloadOf(await mcp.callTool(DRIVE, 'create_file', { title: TITLE, contentMimeType: 'application/vnd.google-apps.spreadsheet' }));
    id = typeof created.id === 'string' ? created.id : null;
    if (!id) throw { code: 'tool_error', message: 'Google Drive n’a pas renvoyé de feuille.' } satisfies BackupError;
    meta = await getMeta(id);
  }

  const tabs = buildBackup(data);
  const existing = sheetsOf(meta ?? {});
  const wanted = new Set(tabs.map((t) => t.title));
  let nextId = Math.max(0, ...existing.map((s) => s.id)) + 1;
  const requests: unknown[] = [];
  const ids = new Map<string, number>();
  for (const t of tabs) {
    const found = existing.find((s) => s.title === t.title);
    if (found) ids.set(t.title, found.id);
    else {
      const sid = nextId++;
      ids.set(t.title, sid);
      requests.push({ addSheet: { properties: { sheetId: sid, title: t.title } } });
    }
  }
  // L'onglet vide créé avec la feuille (« Feuille 1 », « Sheet1 »…) est retiré s'il n'est pas à nous.
  for (const s of existing) if (!wanted.has(s.title) && /^(feuille|sheet)\s*\d+$/i.test(s.title)) requests.push({ deleteSheet: { sheetId: s.id } });
  const cellOf = (v: Cell) =>
    typeof v === 'number' ? { userEnteredValue: { numberValue: v } } : typeof v === 'boolean' ? { userEnteredValue: { boolValue: v } } : { userEnteredValue: { stringValue: v } };
  for (const t of tabs) {
    const sheetId = ids.get(t.title)!;
    // Vide l'onglet puis écrit toutes les lignes : la feuille reflète exactement l'appli.
    requests.push({ updateCells: { range: { sheetId }, fields: 'userEnteredValue' } });
    requests.push({ updateCells: { start: { sheetId, rowIndex: 0, columnIndex: 0 }, rows: t.rows.map((r) => ({ values: r.map(cellOf) })), fields: 'userEnteredValue' } });
    requests.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } });
    requests.push({ repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat.bold' } });
  }
  onStep?.('Écriture des données…');
  // Une seule écriture pour toute la sauvegarde (Google limite le nombre d'écritures par minute).
  await mcp.callTool(SHEETS, 'update_spreadsheet', { spreadsheetId: id, requests });
  return id;
}

/** Message clair pour chaque cas d'échec (connecteur absent, à reconnecter, refusé…). */
export function backupErrorMessage(e: unknown): string {
  const err = (e ?? {}) as BackupError;
  const who = err.server ?? 'Google';
  switch (err.code) {
    case 'unavailable':
    case 'not_granted':
    case 'capability_disabled':
    case 'capability_removed':
      return 'La sauvegarde Google n’est disponible que dans l’appli ouverte depuis Claude.';
    case 'server_not_connected':
      return `Ajoutez le connecteur ${who} dans claude.ai → Réglages → Connecteurs, puis réessayez.`;
    case 'needs_reauth':
      return `Reconnectez ${who} dans claude.ai → Réglages → Connecteurs, puis réessayez.`;
    case 'selection_required':
      return `Choisissez quel compte ${who} utiliser (claude.ai le demande), puis réessayez.`;
    case 'not_in_manifest':
    case 'approval_required':
    case 'consent_required':
      return `Autorisez ${who} pour cette appli (claude.ai le demande au premier essai), puis réessayez.`;
    case 'blocked_by_policy':
      return `${who} est bloqué par votre organisation.`;
    case 'server_unavailable':
    case 'upstream_error':
      return `${who} ne répond pas pour le moment. La sauvegarde a pu être partielle : réessayez dans un instant.`;
    case 'tool_error':
      if (/quota|rate/i.test(err.message ?? '')) return 'Google limite le nombre d’écritures par minute : réessayez dans une minute.';
      return `${who} a refusé l’écriture : ${err.message || 'erreur inconnue'}.`;
    default:
      return err.message || 'La sauvegarde a échoué.';
  }
}
