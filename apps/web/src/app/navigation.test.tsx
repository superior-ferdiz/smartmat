import { describe, expect, it } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../test/renderApp';
import { EMPTY_SUMMARY, mockApi } from '../test/mockApi';
import { SECTIONS } from './navigation';
import { expectNoAxeViolations } from '../test/axe';

describe('FR-UI-001 navigation', () => {
  it('has nine sections with unique paths', () => {
    expect(SECTIONS).toHaveLength(9);
    expect(new Set(SECTIONS.map((s) => s.path)).size).toBe(9);
  });

  it('side menu lists all nine sections', () => {
    renderApp('/');
    const nav = screen.getByRole('navigation', { name: 'Hovedmeny' });
    expect(within(nav).getAllByRole('link')).toHaveLength(9);
  });

  it('bottom menu has Oversikt, Matlager, Skann, Oppskrifter and Mer, in that order', () => {
    renderApp('/');
    const nav = screen.getByRole('navigation', { name: 'Snarveier' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Oversikt', 'Matlager', 'Skann', 'Oppskrifter', 'Mer']);
  });

  it('marks the current page with aria-current in both menus', () => {
    renderApp('/matlager');
    for (const name of ['Hovedmeny', 'Snarveier']) {
      const nav = screen.getByRole('navigation', { name });
      expect(within(nav).getByRole('link', { name: 'Matlager' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      expect(within(nav).getByRole('link', { name: 'Oversikt' })).not.toHaveAttribute(
        'aria-current',
      );
    }
  });

  it('the first Tab reaches the skip link, which points at the main content', async () => {
    const user = userEvent.setup();
    renderApp('/');
    await user.tab();
    const skip = screen.getByRole('link', { name: 'Hopp til hovedinnhold' });
    expect(skip).toHaveFocus();
    expect(skip).toHaveAttribute('href', '#hovedinnhold');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'hovedinnhold');
  });

  it('moves focus to the new page heading after navigating', async () => {
    const user = userEvent.setup();
    renderApp('/');
    const nav = screen.getByRole('navigation', { name: 'Hovedmeny' });
    await user.click(within(nav).getByRole('link', { name: 'Handleliste' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Handleliste' })).toHaveFocus();
    expect(document.title).toBe('Handleliste – SmartMat');
  });

  it('highlights "Mer" in the bottom menu on a section listed under it', () => {
    renderApp('/budsjett');
    const nav = screen.getByRole('navigation', { name: 'Snarveier' });
    expect(within(nav).getByRole('link', { name: 'Mer' })).toHaveAttribute('data-active', 'true');
  });
});

describe('FR-UI-002 placeholder pages', () => {
  it.each(SECTIONS.map((s) => [s.path, s.id] as const))(
    '%s renders a page with one h1',
    async (path) => {
      renderApp(path);
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    },
  );

  it('marks later sections as "Kommer senere"', () => {
    renderApp('/husholdning');
    const main = screen.getByRole('main');
    expect(within(main).getByText('Kommer senere')).toBeInTheDocument();
  });

  it('"Mer" lists the five sections that are not in the bottom menu', () => {
    renderApp('/mer');
    const nav = screen.getByRole('navigation', { name: 'Flere seksjoner' });
    expect(within(nav).getAllByRole('link')).toHaveLength(5);
  });

  it('unknown URLs show a 404 page with a way back', () => {
    renderApp('/finnes-ikke');
    expect(screen.getByRole('heading', { level: 1, name: 'Fant ikke siden' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Gå til oversikten' })).toHaveAttribute('href', '/');
  });

  it.each(['/', '/matlager', '/mer', '/innstillinger', '/designsystem', '/finnes-ikke'])(
    '%s has no axe violations (structure, names, ARIA)',
    async (path) => {
      const { container } = renderApp(path);
      await act(async () => {});
      await expectNoAxeViolations(container);
    },
  );
});

describe('FR-UI-003 overview', () => {
  it('has no sample data any more: the dinner card shows real recipes (phase 5)', async () => {
    renderApp('/');
    expect(await screen.findByText('Ingen oppskrifter ennå.')).toBeInTheDocument();
    expect(screen.queryByText('Noe er fortsatt eksempeldata')).not.toBeInTheDocument();
    expect(screen.queryAllByText('Eksempeldata')).toHaveLength(0);
  });

  it('formats money from øre in Norwegian format', async () => {
    mockApi((r) =>
      r.path.endsWith('/budget/summary')
        ? {
            status: 200,
            body: {
              ...EMPTY_SUMMARY,
              budgetOre: 500_000,
              spentOre: 324_550,
              remainingOre: 175_450,
              usedPercent: 64,
            },
          }
        : undefined,
    );
    renderApp('/');
    const budget = screen.getByRole('region', { name: 'Matbudsjett denne måneden' });
    // Testing Library collapses whitespace in the DOM text (formatOre uses no-break spaces) but not in the
    // string we pass, so the query uses ordinary spaces.
    expect(await within(budget).findByText('3 245,50 kr')).toBeInTheDocument();
    expect(within(budget).getByText('1 754,50 kr')).toBeInTheDocument();
  });
});
