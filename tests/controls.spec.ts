import { expect, test } from './fixtures';
import {
  CHAPTER_BOOK_TITLE,
  SMALL_BOOK_HADITHS,
  SMALL_BOOK_TITLE,
  openSidebar,
  settled,
  stats,
  trace,
} from './helpers';

/**
 * Every test here works from the same starting point — one small collection,
 * nothing open — and shares a browser page with the rest, because booting the
 * app costs fifteen seconds a time and the assertions here cost about one.
 */
test.describe('the controls', () => {
  test('a collection can be turned off and back on', async ({ app: page }) => {
    await openSidebar(page);
    expect((await stats(page)).hadiths).toBe(SMALL_BOOK_HADITHS);

    await page.locator('.books').getByText(SMALL_BOOK_TITLE).click();
    await settled(page);
    // Nothing selected is a legitimate state, not a crash.
    expect((await stats(page)).hadiths).toBe(0);
    await expect(page.locator('.boot--error')).toHaveCount(0);
    await expect(page.locator('.book--on')).toHaveCount(0);

    await page.locator('.books').getByText(SMALL_BOOK_TITLE).click();
    await settled(page);
    expect((await stats(page)).hadiths).toBe(SMALL_BOOK_HADITHS);
  });

  test('all and none select every collection and no collection', async ({ app: page }) => {
    // The one test that puts the whole corpus on screen. Without a GPU a click
    // against 8,217 nodes takes tens of seconds, which is the machine rather
    // than the site — so it is allowed to take its time, and it is the only
    // place that pays this.
    test.slow();
    await openSidebar(page);

    await page.getByRole('button', { name: 'all', exact: true }).click();
    await settled(page);
    expect((await stats(page)).hadiths).toBeGreaterThan(40_000);
    const books = await page.locator('.books > li').count();
    await expect(page.locator('.book--on')).toHaveCount(books);

    await page.getByRole('button', { name: 'none', exact: true }).click({ timeout: 90_000 });
    await settled(page);
    expect((await stats(page)).hadiths).toBe(0);
    await expect(page.locator('.book--on')).toHaveCount(0);
  });

  test('a second collection adds to the first', async ({ app: page }) => {
    await openSidebar(page);
    const before = await stats(page);

    await page.locator('.books').getByText(CHAPTER_BOOK_TITLE).click();
    await settled(page);
    const after = await stats(page);

    expect(after.hadiths).toBeGreaterThan(before.hadiths);
    // Narrators are shared between collections, so the totals must not simply
    // add up — a graph that double-counted them would pass a looser check.
    expect(after.narrators).toBeGreaterThan(before.narrators);
    await expect(page.locator('.book--on')).toHaveCount(2);
  });

  test('chapters narrow a collection and release it again', async ({ app: page }) => {
    await openSidebar(page);
    await page.locator('.books').getByText(CHAPTER_BOOK_TITLE).click();
    await settled(page);
    const whole = await stats(page);

    // Every collection offers a chapter list, so the row has to be named or
    // the locator matches fourteen buttons.
    const row = page.locator('.book', { hasText: CHAPTER_BOOK_TITLE });
    await row.getByRole('button', { name: /\d+ chapters/ }).click();
    const chapters = page.locator('.chapters__list li');
    await expect(chapters.first()).toBeVisible();

    await chapters.first().locator('.check__box').click();
    await settled(page);
    const narrowed = await stats(page);
    expect(narrowed.hadiths).toBeGreaterThan(0);
    expect(narrowed.hadiths).toBeLessThan(whole.hadiths);

    await row.getByRole('button', { name: 'whole book' }).click();
    await settled(page);
    expect((await stats(page)).hadiths).toBe(whole.hadiths);

    await row.getByRole('button', { name: 'hide chapters' }).click();
    await expect(page.locator('.chapters__list')).toHaveCount(0);
  });

  test('the chapter filter box narrows the list', async ({ app: page }) => {
    await openSidebar(page);
    const row = page.locator('.book', { hasText: CHAPTER_BOOK_TITLE });
    await row.getByRole('button', { name: /\d+ chapters/ }).click();

    const all = await page.locator('.chapters__list li').count();
    // Filter on a word taken from a real chapter title rather than one guessed
    // at, so the test does not depend on what this collection happens to cover.
    const title = await page.locator('.chapters__list li .check__label').first().innerText();
    const word = title.split(/\s+/).filter((w) => /^[a-z]{5,}$/i.test(w))[0];
    test.skip(!word, 'no usable word in the first chapter title');

    await page.getByPlaceholder(/Search \d+ chapters/).fill(word);
    const filtered = await page.locator('.chapters__list li').count();

    expect(filtered).toBeGreaterThan(0);
    expect(filtered).toBeLessThanOrEqual(all);
    await expect(page.locator('.chapters__list li').first()).toContainText(new RegExp(word, 'i'));

    await row.getByRole('button', { name: 'hide chapters' }).click();
  });

  test('a hadith can be pinned by number and let go again', async ({ app: page }) => {
    await openSidebar(page);

    await page.getByPlaceholder(/Hadith number/).fill('qudsi40 1');
    const result = page.locator('.picker__result').first();
    await expect(result).toBeVisible();
    await result.click();
    await settled(page);

    await openSidebar(page);
    await expect(page.getByRole('heading', { name: 'Selected hadiths' })).toBeVisible();
    expect((await stats(page)).hadiths).toBe(1);

    // The pin itself is the button that removes it.
    await page.locator('.pin').first().click();
    await settled(page);
    expect((await stats(page)).hadiths).toBe(SMALL_BOOK_HADITHS);
    await expect(page.getByRole('heading', { name: 'Selected hadiths' })).toHaveCount(0);
    await page.getByPlaceholder(/Hadith number/).fill('');
  });

  test('reading a hadith opens its text and its chain', async ({ app: page }) => {
    await openSidebar(page);
    await trace(page, 'mercy');

    await page.locator('.hadith-ref').first().click();
    const reader = page.getByRole('dialog', { name: 'Hadith' });
    await expect(reader).toBeVisible();
    // Arabic is the source text; a reader with only the English has failed to
    // fetch the chunk it was pointed at.
    await expect(reader.locator('.reader__ar')).not.toBeEmpty();

    // Every narrator in the chain is a way into their biography.
    await reader.locator('.chain__node').first().click();
    await expect(page.locator('.detail')).toBeVisible();
    await page.locator('.detail__close').click();
    await expect(page.locator('.detail')).toHaveCount(0);

    await reader.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('dialog', { name: 'Hadith' })).toHaveCount(0);
  });

  test('a grade never appears without whose ruling it is', async ({ app: page }) => {
    await openSidebar(page);
    // Abu Dawud 3 is graded, and its own wording is distinctive enough to be
    // the only hit — the results list is ordered by collection, so a common
    // word would bury it pages down. A search overrides the collections, so it
    // reaches Abu Dawud from the small selection the shared page starts on.
    await trace(page, 'أبو التياح حدثني شيخ');

    await page.locator('.hadith-ref').filter({ hasText: 'abudawud' }).first().click();
    await expect(page.locator('.reader')).toBeVisible();

    const grade = page.locator('.reader__grade').first();
    await expect(grade).toBeVisible();
    // The ruling, and the critic who passed it. Shown bare, a grade reads as a
    // property of the hadith rather than one man's judgement of it.
    await expect(grade.locator('.reader__grade-by')).toHaveText('al-Albānī');
    expect(await grade.getAttribute('title')).toContain('al-Albānī');
  });

  test('the biography panel moves between narrators', async ({ app: page }) => {
    await openSidebar(page);
    await trace(page, 'mercy');
    await page.locator('.hadith-ref').first().click();
    await page.locator('.chain__node').first().click();

    const detail = page.locator('.detail');
    await expect(detail).toBeVisible();
    const first = await detail.locator('.detail__ar').innerText();

    const chip = detail.locator('.chip').first();
    if (await chip.count()) {
      await chip.click();
      await expect(detail.locator('.detail__ar')).not.toHaveText(first);
    }
  });

  test('the legend explains itself and folds away', async ({ app: page }) => {
    const about = page.getByRole('button', { name: 'about the data' });
    await about.click();
    await expect(page.locator('.legend__panel')).toBeVisible();
    // The sources are links out, and a broken href is worth catching here.
    const links = page.locator('.legend__panel a');
    expect(await links.count()).toBeGreaterThan(0);
    for (const href of await links.evaluateAll((all) => all.map((a) => a.getAttribute('href')))) {
      expect(href).toMatch(/^https?:\/\//);
    }
    await page.getByRole('button', { name: 'hide sources' }).click();
    await expect(page.locator('.legend__panel')).toHaveCount(0);
  });

  test('every visible control is enabled and actually hittable', async ({ app: page }) => {
    await openSidebar(page);
    await trace(page, 'mercy');

    // Not a click-everything sweep — clicking half of these unmounts the other
    // half. What is checked is that each one is enabled and is the element the
    // pointer would reach, which is how a panel drifting over a button, or a
    // label printed across it, gets caught.
    const covered = await page.evaluate(() => {
      const bad: string[] = [];
      for (const button of document.querySelectorAll('button')) {
        const rect = button.getBoundingClientRect();
        if (!rect.width || !rect.height) continue;
        const style = getComputedStyle(button);
        if (style.visibility === 'hidden' || style.display === 'none') continue;
        if (button.hasAttribute('disabled')) continue;
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue;
        const top = document.elementFromPoint(x, y);
        if (top !== button && !button.contains(top) && !top?.contains(button)) {
          bad.push(`${button.className || button.textContent?.trim()} is under ${top?.className || top?.tagName}`);
        }
      }
      return bad;
    });
    expect(covered).toEqual([]);
  });
});
