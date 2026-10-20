import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import '@fontsource-variable/figtree';
import './styles/reset.css';
import './styles/tokens.css';
import './styles/global.css';
import { initI18n } from './i18n';
import { Providers } from './app/Providers';
import { routes } from './app/routes';

initI18n();

const router = createBrowserRouter(routes);
const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element in index.html');

createRoot(root).render(
  <StrictMode>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>,
);
