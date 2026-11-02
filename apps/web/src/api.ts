import type { ColorScheme, ComposeRequest, ComposeResult, Library, LayoutRequest, LayoutVariant } from '@ic/core';

/** HTTP-клиент API сервера. Ошибки превращаются в понятные сообщения для интерфейса. */

export class ApiError extends Error {}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  } catch {
    throw new ApiError('Сервер недоступен. Запустите его командой npm run dev.');
  }
  if (!res.ok) {
    let message = `Ошибка ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string; details?: string[] };
      message = [body.error, ...(body.details ?? [])].filter(Boolean).join(': ') || message;
    } catch {
      /* не JSON */
    }
    throw new ApiError(message);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const api = {
  health: () => request<{ ok: boolean; llm: { enabled: boolean; model?: string } }>('/api/health'),
  library: () => request<Library>('/api/library'),
  compose: (body: ComposeRequest) => request<ComposeResult>('/api/compose', { method: 'POST', body: JSON.stringify(body) }),
  layout: (body: LayoutRequest) => request<{ variants: LayoutVariant[] }>('/api/layout', { method: 'POST', body: JSON.stringify(body) }),
  palettes: () => request<{ palettes: ColorScheme[] }>('/api/palettes'),
  savePalette: (scheme: ColorScheme) =>
    request<{ scheme: ColorScheme; warnings: string[] }>('/api/palettes', { method: 'POST', body: JSON.stringify({ scheme }) }),
  deletePalette: (id: string) => request<void>(`/api/palettes/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
