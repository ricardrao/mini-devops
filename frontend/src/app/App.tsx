import { FluentProvider, RendererProvider, createDOMRenderer, webLightTheme } from '@fluentui/react-components';
import { SignInPage } from '../features/auth/SignInPage';
import type { SetupStatus } from '../api/contracts';

const nonce = document.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]')?.content;
const renderer = createDOMRenderer(document, { styleElementAttributes: nonce && nonce !== '__CSP_NONCE__' ? { nonce } : {} });
export function App({ setup }: { setup: SetupStatus }) {
  return <RendererProvider renderer={renderer}>
    <FluentProvider theme={webLightTheme} applyStylesToPortals>
      <SignInPage key={String(setup.required)} setup={setup} />
    </FluentProvider>
  </RendererProvider>;
}
