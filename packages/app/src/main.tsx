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

createRoot(root).render(
  <StrictMode>
    <ContainerProvider container={createContainer()}>
      <App />
    </ContainerProvider>
  </StrictMode>,
);
