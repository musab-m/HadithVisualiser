import { test as fresh } from '@playwright/test';
import { expect } from '@playwright/test';
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

/**
 * One chain, drawn on a page of its own.
 *
 * These two are the exception to sharing a page. A narrator is a sphere in a
 * 3D scene with no DOM, so it has to be found by pointing at it — which needs
 * the camera framed on a known graph and nothing covering the canvas. Loading
 * straight into that state gives it; arriving by clicking does not, reliably,
 * on a phone-sized viewport where the sheet and the legend cover most of the
 * scene. Two boots is the price of a test that means something.
 */
fresh.describe('narrowing to a narrator', () => {
  fresh('the menu isolates the chains running through a narrator', async ({ page }) => {
    await openWith(page, { pinned: [`${SMALL_BOOK}:1`] });
    await settled(page);

    // Nodes are spheres in a 3D scene with no DOM of their own, so one has to
    // be hit rather than selected. A single chain stacks down the middle.
    expect(await openNodeMenu(page), 'never landed on a narrator').toBe(true);

    const menu = page.locator('.menu');
    await expect(menu.locator('.menu__ar')).not.toBeEmpty();
    await expect(menu.locator('.menu__n')).toContainText(/on [\d,]+ of the chains shown/);

    await menu.getByRole('menuitem', { name: 'only the chains through this narrator' }).click();
    await expect(page.locator('.isolation')).toBeVisible();
    await settled(page);
    expect((await stats(page)).hadiths).toBeGreaterThan(0);

    // The bar names who it narrowed to, and is the way back out.
    await expect(page.locator('.isolation__ar')).not.toBeEmpty();
    await page.getByRole('button', { name: /show (everything|all)/ }).click();
    await settled(page);
    expect((await stats(page)).hadiths).toBe(1);
    await expect(page.locator('.isolation')).toHaveCount(0);
  });

  fresh('the menu closes on Escape without changing anything', async ({ page }) => {
    await openWith(page, { pinned: [`${SMALL_BOOK}:1`] });
    await settled(page);
    const before = await stats(page);

    expect(await openNodeMenu(page)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('.menu')).toHaveCount(0);
    expect(await stats(page)).toEqual(before);
  });


  fresh('two narrators together keep only the chains carrying both', async ({ page }) => {
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
    fresh.skip(ids.length < 2, 'not enough busy narrators in this corpus');

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

  fresh('a refresh keeps the question', async ({ page }) => {
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

  fresh('a saved view survives a collection that no longer exists', async ({ page }) => {
    await openWith(page, { books: [SMALL_BOOK, 'a_book_that_was_removed'] });
    await openSidebar(page);

    // The real collection survives; the stale slug selects nothing rather than
    // leaving the app pointing at a book it cannot load.
    expect((await stats(page)).hadiths).toBe(SMALL_BOOK_HADITHS);
    await expect(page.locator('.book--on')).toHaveCount(1);
  });

  fresh('a stored view from an older schema is ignored', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('isnad:view', JSON.stringify({ v: 0, books: ['a_book_from_before'] }));
    });
    await page.goto('/');
    await ready(page);

    // Falling back to everything is the first-visit behaviour, which is the
    // safe answer when the saved shape can no longer be trusted.
    expect((await stats(page)).hadiths).toBeGreaterThan(40_000);
  });
});
