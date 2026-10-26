// Proposer un fichier à l'utilisateur.
// Dans un artefact Claude, le téléchargement passe par la capacité « downloads » ;
// ailleurs (application installée), par un lien de téléchargement classique.

interface DownloadsNs {
  save(req: { filename: string; data: string | Blob }): Promise<unknown>;
}
type ClaudeGlobal = { use?: (name: string) => Promise<unknown> };

export async function offerFile(filename: string, data: string, mime = 'text/csv;charset=utf-8'): Promise<boolean> {
  const claude = (globalThis as { claude?: ClaudeGlobal }).claude;
  if (claude?.use) {
    try {
      const downloads = (await claude.use('downloads')) as DownloadsNs | null;
      if (downloads) {
        await downloads.save({ filename, data });
        return true;
      }
    } catch {
      return false; // refusé par l'utilisateur ou indisponible
    }
  }
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}

/** Export CSV (séparateur « ; », UTF-8 avec BOM : s'ouvre directement dans Excel). */
export function toCsv(rows: Array<Array<string | number>>): string {
  const cell = (v: string | number) => {
    const s = typeof v === 'number' ? String(v).replace('.', ',') : v;
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
}

/** Où sont enregistrées les données (indiqué par le backend au démarrage). */
export function storageLabel(): string {
  const b = (globalThis as { __cfBackend?: string }).__cfBackend;
  if (b === 'claude-db') return 'Enregistré dans Claude (artefact), partagé entre vos appareils';
  if (b === 'local') return 'Enregistré dans ce navigateur uniquement';
  const h = typeof location !== 'undefined' ? location.hostname : '';
  if (h && !/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)) return 'Enregistré en ligne, partagé entre les appareils de la famille';
  return 'Enregistré sur le serveur de la maison (data/store.json)';
}
