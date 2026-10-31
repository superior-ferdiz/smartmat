import { useEffect, useRef, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router';
import { useFocusHeadingOnNavigate } from './useFocusHeadingOnNavigate';

/* Spec 13: after navigation focus goes to the new <h1>, also when the page shows it only later (a lazy page). */

function Shell() {
  const ref = useRef<HTMLElement>(null);
  useFocusHeadingOnNavigate(ref);
  return (
    <main ref={ref}>
      <Outlet />
    </main>
  );
}

/** Shows its heading a moment after it mounts, like a page whose file or data is still on the way. */
function LatePage() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShown(true), 50);
    return () => clearTimeout(timer);
  }, []);
  return shown ? <h1 tabIndex={-1}>Sen side</h1> : <p>Laster …</p>;
}

function setup() {
  const router = createMemoryRouter(
    [
      {
        element: <Shell />,
        children: [
          { path: '/', element: <h1 tabIndex={-1}>Start</h1> },
          { path: '/klar', element: <h1 tabIndex={-1}>Klar side</h1> },
          { path: '/sen', element: <LatePage /> },
        ],
      },
    ],
    { initialEntries: ['/'] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe('useFocusHeadingOnNavigate', () => {
  it('not on the first render; on navigation to a page that is ready', async () => {
    const router = setup();
    expect(screen.getByRole('heading', { name: 'Start' })).not.toHaveFocus();
    await act(() => router.navigate('/klar'));
    expect(screen.getByRole('heading', { name: 'Klar side' })).toHaveFocus();
  });

  it('waits for a heading that comes later (lazy page, or data still loading)', async () => {
    const router = setup();
    await act(() => router.navigate('/sen'));
    expect(screen.getByText('Laster …')).toBeInTheDocument();
    await screen.findByRole('heading', { name: 'Sen side' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByRole('heading', { name: 'Sen side' })).toHaveFocus();
  });
});
