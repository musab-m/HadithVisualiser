import { expect, test } from './fixtures';
import { SMALL_BOOK_HADITHS, openSidebar, settled, stats, trace } from './helpers';

/**
 * The search is the part with the most moving pieces: a sharded index fetched
 * on demand, an Arabic-aware tokeniser shared with the build, and a selection
 * that has to end up drawn. A test that only checked "some results came back"
 * would pass while the tokeniser shattered every Arabic word into fragments,
 * which is a bug this project has actually had.
 *
 * A search overrides the collections, so these all start from the same small
 * selection as everything else and simply search over it.
 */
test.describe('tracing a wording', () => {
  const PHRASE = 'إنما الأعمال بالنيات';

  test('an Arabic phrase finds the reports that carry it', async ({ app: page }) => {
    await openSidebar(page);
    await trace(page, PHRASE);

    const count = page.locator('.found__count');
    await expect(count).toContainText(/hadiths? reports? this/);
    const total = Number((await count.innerText()).match(/([\d,]+)/)?.[1].replace(/,/g, ''));
    expect(total).toBeGreaterThan(1);

    // The hits are what gets drawn, so the graph must follow the search.
    const { hadiths, narrators } = await stats(page);
    expect(hadiths).toBeGreaterThan(0);
    expect(hadiths).toBeLessThanOrEqual(total);
    expect(narrators).toBeGreaterThan(0);

    // Several collections reporting the same wording is the point of the tool.
    expect(await page.locator('.found__spread li').count()).toBeGreaterThan(1);
  });

  test('English finds the same reports through the translation', async ({ app: page }) => {
    await openSidebar(page);
    await trace(page, 'actions are but by intention');

    await expect(page.locator('.found__count')).toBeVisible();
    expect((await stats(page)).hadiths).toBeGreaterThan(0);
  });

  test('the phrase-only scope narrows to the wording itself', async ({ app: page }) => {
    await openSidebar(page);
    await trace(page, PHRASE);

    const scopes = page.locator('.scopes');
    if (!(await scopes.count())) test.skip(true, 'every match carries the phrase; nothing to narrow');

    const loose = (await stats(page)).hadiths;
    await page.getByRole('button', { name: 'the phrase only' }).click();
    await settled(page);
    const tight = (await stats(page)).hadiths;

    expect(tight).toBeGreaterThan(0);
    expect(tight).toBeLessThan(loose);
    await expect(page.locator('.scope--on')).toHaveText('the phrase only');

    // And back.
    await page.getByRole('button', { name: /^all [\d,]+$/ }).click();
    await settled(page);
    expect((await stats(page)).hadiths).toBe(loose);
  });

  test('clearing a search puts the collections back', async ({ app: page }) => {
    await openSidebar(page);
    const before = await stats(page);
    expect(before.hadiths).toBe(SMALL_BOOK_HADITHS);

    await trace(page, PHRASE);
    expect((await stats(page)).hadiths).not.toBe(before.hadiths);

    await page
      .locator('.panel', { hasText: 'Trace a wording' })
      .getByRole('button', { name: 'clear' })
      .click();
    await settled(page);
    expect((await stats(page)).hadiths).toBe(before.hadiths);
  });

  test('a wording nothing carries says so instead of emptying the screen', async ({ app: page }) => {
    await openSidebar(page);
    await trace(page, 'zzzqqxwv');

    await expect(page.getByText(/Nothing matches/)).toBeVisible();
    await expect(page.locator('.boot--error')).toHaveCount(0);
  });

  test('a long result list can be opened up', async ({ app: page }) => {
    await openSidebar(page);
    // Deliberately a broad word: the list pages at forty, and the count used to
    // read as a button without being one.
    await trace(page, 'prayer');

    const before = await page.locator('.hadith-ref').count();
    expect(before).toBe(40);

    const reveal = page.locator('.reveal');
    await expect(reveal).toBeVisible();
    await reveal.first().click();
    expect(await page.locator('.hadith-ref').count()).toBeGreaterThan(before);
  });

  test('a single result can be isolated from the list', async ({ app: page }) => {
    await openSidebar(page);
    await trace(page, PHRASE);

    await page.locator('.found__only').first().click();
    await settled(page);

    expect((await stats(page)).hadiths).toBe(1);
  });

  test('a search and a collection filter compose', async ({ app: page }) => {
    await openSidebar(page);
    await trace(page, PHRASE);
    const everywhere = (await stats(page)).hadiths;

    // The name appears in the spread list too, so aim at the collection list.
    const spread = page.locator('.found__spread li').first();
    const collection = (await spread.innerText()).split('\n')[0].trim();
    await page.locator('.books').getByText(collection, { exact: true }).click();
    await settled(page);

    // Toggling a collection clears the search by design — the sidebar says so —
    // so what must hold is that the app is left in a coherent state, showing
    // that collection whole.
    const after = await stats(page);
    expect(after.hadiths).toBeGreaterThan(0);
    expect(after.hadiths).not.toBe(everywhere);
    await expect(page.locator('.found')).toHaveCount(0);
  });
});
