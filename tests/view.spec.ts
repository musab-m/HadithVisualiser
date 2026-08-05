import { expect, test } from '@playwright/test';
import {
  SMALL_BOOK,
  SMALL_BOOK_HADITHS,
  applyView,
  collectErrors,
  openNodeMenu,
  openSidebar,
  openWith,
  ready,
  settled,
  stats,
} from './helpers';

test.describe('narrowing to a narrator', () => {
  test('the menu opens on a right-click and isolates the chains', async ({ page }) => {
    // One hadith means one chain, stacked down the middle of the view, which is
    // what makes a node findable at all — they are spheres in a scene, not DOM.
    await openWith(page, { pinned: [`${SMALL_BOOK}:1`] });
    await settled(page);

    const found = await openNodeMenu(page);
    expect(found, 'never landed on a narrator').toBe(true);

    const menu = page.locator('.menu');
    await expect(menu.locator('.menu__ar')).not.toBeEmpty();
    await expect(menu.locator('.menu__n')).toContainText(/on [\d,]+ of the chains shown/);

    await menu.getByRole('menuitem', { name: 'only the chains through this narrator' }).click();
    await expect(page.locator('.isolation')).toBeVisible();
    await settled(page);

    const isolated = await stats(page);
    expect(isolated.hadiths).toBeGreaterThan(0);

    await page.getByRole('button', { name: /show (everything|all)/ }).click();
    await settled(page);
    expect((await stats(page)).hadiths).toBe(1);
    await expect(page.locator('.isolation')).toHaveCount(0);
  });

  test('the menu closes on Escape without changing anything', async ({ page }) => {
    await openWith(page, { pinned: [`${SMALL_BOOK}:1`] });
    await settled(page);
    const before = await stats(page);

    expect(await openNodeMenu(page)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('.menu')).toHaveCount(0);
    expect(await stats(page)).toEqual(before);
  });

  test('isolating narrows an existing selection rather than replacing it', async ({ page }) => {
    await openWith(page);
    const whole = await stats(page);

    // Seeded rather than clicked: which narrator is under the pointer depends
    // on the layout, and this test is about what isolation does to the numbers.
    const narrator = await page.evaluate(() => {
      const label = document.querySelector('.node-label__ar');
      return label?.textContent ?? '';
    });
    expect(narrator).not.toBe('');

    const id = await page.evaluate(async (ar) => {
      const res = await fetch('data/narrators/index.json');
      const file = await res.json();
      const all = Object.values(file.narrators ?? file) as { id: string; ar: string }[];
      return all.find((n) => n.ar === ar)?.id ?? '';
    }, narrator);
    expect(id).not.toBe('');

    await applyView(page, { isolated: [id] });
    await settled(page);

    const narrowed = await stats(page);
    expect(narrowed.hadiths).toBeGreaterThan(0);
    expect(narrowed.hadiths).toBeLessThanOrEqual(whole.hadiths);
    await expect(page.locator('.isolation__ar')).toHaveText(narrator);
  });

  test('two narrators together keep only the chains carrying both', async ({ page }) => {
    // The registry has to be read from the page, and a page has to have been
    // loaded first — `fetch` on about:blank has no origin to resolve against.
    await openWith(page);
    const ids = await page.evaluate(async () => {
      const res = await fetch('data/narrators/index.json');
      const file = await res.json();
      const all = Object.values(file.narrators ?? file) as { id: string; n: number }[];
      return all
        .filter((n) => n.id !== 'prophet' && !n.id.startsWith('collector:') && n.n > 200)
        .slice(0, 2)
        .map((n) => n.id);
    });
    test.skip(ids.length < 2, 'not enough busy narrators in this corpus');

    await applyView(page, { books: ['bukhari'], isolated: [ids[0]] });
    const one = (await stats(page)).hadiths;

    await applyView(page, { isolated: ids });
    const both = (await stats(page)).hadiths;

    expect(both).toBeLessThanOrEqual(one);
    await expect(page.locator('.isolation__who li')).toHaveCount(2);

    // Dropping one of them widens it again.
    await page.locator('.isolation__drop').last().click();
    await settled(page);
    expect((await stats(page)).hadiths).toBe(one);
  });
});

test.describe('the saved view', () => {
  test('a refresh keeps the question', async ({ page }) => {
    const errors = collectErrors(page);
    await openWith(page, { books: [] });
    await openSidebar(page);

    await page.getByLabel('Search the text of the hadiths').fill('إنما الأعمال بالنيات');
    await page.getByRole('button', { name: 'trace' }).click();
    await expect(page.locator('.found')).toBeVisible();
    await settled(page);
    const before = await stats(page);

    await page.reload();
    await ready(page);
    await openSidebar(page);

    // The query is what was stored; the hits are found again from the index.
    await expect(page.locator('.found__count')).toBeVisible({ timeout: 60_000 });
    expect(await stats(page)).toEqual(before);
    expect(errors).toEqual([]);
  });

  test('a saved collection that no longer exists is dropped, not selected', async ({ page }) => {
    await openWith(page, { books: [SMALL_BOOK, 'a_book_that_was_removed'] });
    await openSidebar(page);

    // The real collection survives; the stale slug selects nothing rather than
    // leaving the app pointing at a book it cannot load.
    expect((await stats(page)).hadiths).toBe(SMALL_BOOK_HADITHS);
    await expect(page.locator('.book--on')).toHaveCount(1);
  });

  test('a stored view from an older schema is ignored', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('isnad:view', JSON.stringify({ v: 0, books: ['qudsi40'] }));
    });
    await page.goto('/');
    await ready(page);

    // Falling back to everything is the first-visit behaviour, which is the
    // safe answer when the saved shape can no longer be trusted.
    expect((await stats(page)).hadiths).toBeGreaterThan(40_000);
  });
});
