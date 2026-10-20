import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { ReactElement } from 'react';
import { Providers } from '../app/Providers';
import { routes } from '../app/routes';

/** Renders the whole app (shell + routes) at the given path, like the browser would. */
export function renderApp(path = '/') {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const result = render(
    <Providers>
      <RouterProvider router={router} />
    </Providers>,
  );
  return { ...result, router };
}

/** Renders a single component with the app providers (toasts, query client). */
export function renderWithProviders(ui: ReactElement) {
  return render(<Providers>{ui}</Providers>);
}
