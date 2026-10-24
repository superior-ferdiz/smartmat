import { expectNoAxeViolations, expectNoHorizontalScroll, useTallPhoneViewport } from './checks';
import { expect, test } from './fixtures';

/*
 * Phase 9 end-to-end test: plan the week → see what is missing → put it on the shopping list → it is there,
 * through the real UI, API and database, with the FICTIONAL test recipes (source=test). Next week is used,
 * so every day counts whatever day the test runs. IDs: FR-PLAN-001–004, NFR-UX-001/002, KURS-02.
 */

test.describe('meal plan → needs → shopping list', () => {
  test.use({ isolatedAccount: true });

  test('FR-PLAN-001–004: the whole flow', async ({ page }) => {
    await page.goto('/maltidsplan');
    await expect(page.getByRole('heading', { level: 1, name: 'Måltidsplan' })).toBeVisible();
    await expect(page.getByText(/Ingenting er planlagt denne uka/)).toBeVisible();
    await page.getByRole('link', { name: 'Neste uke' }).click();
    await expect(page).toHaveURL(/uke=\d{4}-W\d{2}/);

    // FR-PLAN-001: a recipe for 2 servings (the recipe is for 4) on Monday, and a note on Tuesday.
    await page.getByRole('button', { name: /^Legg til Middag, mandag/ }).click();
    const add = page.getByRole('dialog');
    await add.getByRole('radio', { name: /Testrett: pannekaker/ }).check();
    await add.getByRole('textbox', { name: 'Porsjoner' }).fill('2');
    await add.getByRole('button', { name: 'Legg til' }).click();
    await expect(add).toBeHidden();
    const monday = page.getByRole('listitem').filter({
      has: page.getByRole('heading', { level: 3, name: /^mandag/ }),
    });
    await expect(monday.getByRole('link', { name: 'Testrett: pannekaker' })).toBeVisible();
    await expect(monday.getByText('2 porsjoner')).toBeVisible();

    await page.getByRole('button', { name: /^Legg til Middag, tirsdag/ }).click();
    const note = page.getByRole('dialog');
    await note.getByRole('radio', { name: 'Fritekst' }).check();
    await note.getByRole('button', { name: 'Spise ute' }).click();
    await note.getByRole('button', { name: 'Legg til' }).click();
    await expect(page.getByText('Spise ute er lagt til i planen.')).toBeAttached();

    // FR-PLAN-003: the needs are scaled to 2 servings (half the recipe); only what is missing is ticked.
    const needs = page.getByRole('region', { name: 'Hva mangler for uka' });
    await expect(needs.getByRole('checkbox', { name: /^Melk/ })).toBeChecked();
    await expect(needs.getByRole('checkbox', { name: /^Salt/ })).not.toBeChecked();
    await expect(needs.getByText(/middag: Testrett: pannekaker, 250\sml/)).toBeVisible();

    await expectNoHorizontalScroll(page);
    await useTallPhoneViewport(page);
    await expectNoAxeViolations(page);

    // FR-PLAN-004: nothing is added before the button; then it is, and the second time there is nothing new.
    await needs.getByRole('button', { name: 'Legg på handlelisten' }).click();
    await expect(needs.getByText(/Lagt på handlelisten: 3 nye linjer/)).toBeVisible();
    await expect(needs.getByRole('checkbox', { name: /^Melk/ })).not.toBeChecked();
    await expect(needs.getByText('Lagt på handlelisten fra planen før').first()).toBeVisible();

    // … and it is on the list, with where it came from.
    await needs.getByRole('link', { name: 'Åpne handlelisten' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Handleliste' })).toBeVisible();
    const melk = page.getByRole('listitem').filter({ hasText: /^Melk/ });
    await expect(melk).toHaveCount(1);
    await expect(melk).toContainText('250 ml');
    await expect(melk).toContainText(/Måltidsplan man\. .*: Testrett: pannekaker/);
  });

  test('FR-PLAN-001: move and remove an entry with the keyboard', async ({ page }) => {
    await page.goto('/maltidsplan');
    await page.getByRole('link', { name: 'Neste uke' }).click();
    await page.getByRole('button', { name: /^Legg til Middag, onsdag/ }).click();
    const add = page.getByRole('dialog');
    await add.getByRole('radio', { name: 'Fritekst' }).check();
    await add.getByRole('textbox', { name: 'Tekst' }).fill('Rester');
    await add.getByRole('textbox', { name: 'Tekst' }).press('Enter');
    await expect(add).toBeHidden();

    await page.getByRole('button', { name: 'Endre eller flytt Rester' }).focus();
    await page.keyboard.press('Enter');
    const edit = page.getByRole('dialog', { name: 'Endre Rester' });
    await edit.getByRole('combobox', { name: 'Måltid' }).selectOption('lunch');
    await edit.getByRole('combobox', { name: 'Dag' }).selectOption({ index: 4 });
    await edit.getByRole('button', { name: 'Lagre' }).click();
    await expect(edit).toBeHidden();

    // Lunch is hidden by default: the page says so, and the switch shows it on Friday.
    await expect(page.getByText(/Uka har også frokost eller lunsj/)).toBeVisible();
    // URL-controlled: click and wait for the tick, not check() (CLAUDE.md, phase 5).
    const allMeals = page.getByRole('checkbox', { name: 'Vis frokost og lunsj' });
    await allMeals.click();
    await expect(allMeals).toBeChecked();
    const friday = page.getByRole('listitem').filter({
      has: page.getByRole('heading', { level: 3, name: /^fredag/ }),
    });
    await expect(friday.getByText('Rester')).toBeVisible();

    await friday.getByRole('button', { name: 'Fjern Rester' }).click();
    await expect(page.getByText('Rester er fjernet fra planen.')).toBeAttached();
    await expect(friday.getByText('Rester')).toHaveCount(0);
    // Focus goes to the meal's add button, not to the top of the page.
    await expect(page.getByRole('button', { name: /^Legg til Lunsj, fredag/ })).toBeFocused();
  });
});
