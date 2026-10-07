export class ApiError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}
export async function request<T>(path: string, options: RequestOptions = {}, csrf = ''): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (options.method && options.method !== 'GET') headers.set('X-CSRF-Token', csrf);
  const response = await fetch(`/api${path}`, {
    ...options, headers, credentials: 'same-origin',
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const data = await response.json();
  if (!response.ok) throw new ApiError(response.status, data.error || '请求失败');
  return data as T;
}
