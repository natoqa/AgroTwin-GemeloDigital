import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ContainerProvider } from './composition/ContainerContext';
import { createContainer } from './composition/container';
import './index.css';

const root = document.getElementById('root');
if (!root) {
  throw new Error('index.html is missing #root');
}

const reactRoot = createRoot(root);

/**
 * The container is built before the first render.
 *
 * OPFS hands out its directory handle asynchronously, so there is a moment
 * where the twin's storage does not exist yet. Rendering the screens against a
 * half-built container would mean every screen learning to cope with it; one
 * message here is cheaper and more honest.
 */
createContainer()
  .then((container) => {
    // Retention runs once per start, in the background. A policy nothing ever
    // applies is not a policy, and start-up is the only moment where dropping
    // old photographs cannot interrupt something the farmer is doing.
    void container.applyImageRetention().catch(() => undefined);

    reactRoot.render(
      <StrictMode>
        <ContainerProvider container={container}>
          {/* A single `main` landmark, so a screen reader can skip straight to the content. */}
          <main>
            <App />
          </main>
        </ContainerProvider>
      </StrictMode>,
    );
  })
  .catch(() => {
    reactRoot.render(
      <main>
        <p role="alert" data-testid="startup-error">
          No se pudo abrir el almacenamiento de este teléfono. Cierra la aplicación y vuelve a
          abrirla.
        </p>
      </main>,
    );
  });
