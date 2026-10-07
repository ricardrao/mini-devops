import type { Credentials, SetupStatus } from '../api/contracts';
import type { request } from '../api/client';

declare global {
  interface Window {
    MiniDevOpsHttp: { request: typeof request };
    MiniDevOpsAuth: { show(setup: SetupStatus): void; hide(): void };
    MiniDevOpsRuntime: {
      start(): Promise<void>;
      signIn(credentials: Credentials, setup: boolean): Promise<void>;
    };
  }
}
export function loadRuntime(): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/legacy-runtime.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('页面资源加载失败，请刷新后重试。'));
    document.head.append(script);
  });
}
