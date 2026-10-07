import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { App } from './app/App';
import { loadRuntime } from './app/runtime';
import { request } from './api/client';
import './styles/index.css';

const authRoot = createRoot(document.getElementById('auth-root')!);
window.MiniDevOpsHttp = { request };
window.MiniDevOpsAuth = {
  show(setup) {
    document.getElementById('app')!.replaceChildren();
    flushSync(() => authRoot.render(<App setup={setup} />));
  },
  hide() { flushSync(() => authRoot.render(null)); },
};
loadRuntime().then(() => window.MiniDevOpsRuntime.start()).catch(error => {
  document.getElementById('app')!.textContent = error.message;
});
