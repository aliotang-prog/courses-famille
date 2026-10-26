import type { ActionEnvelope, ActionsResponse, FamilyData } from '../types';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new HttpError(res.status, body.error || `Erreur ${res.status}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export function fetchFamily(code: string): Promise<FamilyData> {
  return request<FamilyData>(`/api/family/${encodeURIComponent(code)}`);
}

export function postActions(code: string, actions: ActionEnvelope[]): Promise<ActionsResponse> {
  return request<ActionsResponse>(`/api/family/${encodeURIComponent(code)}/actions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actions }),
  });
}

export function eventsUrl(code: string): string {
  return `/api/sync/events?code=${encodeURIComponent(code)}`;
}
