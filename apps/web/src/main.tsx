import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import '@fontsource-variable/figtree';
import './styles/reset.css';
import './styles/tokens.css';
import './styles/global.css';
import { startI18n } from './i18n';
import { Providers } from './app/Providers';
import { routes } from './app/routes';

const router = createBrowserRouter(routes);
const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element in index.html');

void startI18n().then(() =>
  createRoot(root).render(
    <StrictMode>
      <Providers>
        <RouterProvider router={router} />
      </Providers>
    </StrictMode>,
  ),
);
