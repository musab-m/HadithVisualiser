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
    // against 8,124 nodes takes tens of seconds, which is the machine rather
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
    // A report named by number rather than by position in the results: the
    // hadith at the head of Sahih al-Bukhari runs all the way to the Prophet,
    // and the panel opened from the top of its chain has to be his. Taking
    // whatever the search listed first meant taking a Muwaṭṭaʾ āthar as often
    // as not, whose chain rightly begins at a Companion.
    await trace(page, 'إنما الأعمال بالنيات');

    await page.getByRole('button', { name: 'bukhari:1', exact: true }).click();
    const reader = page.getByRole('dialog', { name: 'Hadith' });
    await expect(reader).toBeVisible();
    // Arabic is the source text; a reader with only the English has failed to
    // fetch the chunk it was pointed at.
    await expect(reader.locator('.reader__ar')).not.toBeEmpty();

    // Every narrator in the chain is a way into their biography. This chain
    // reaches the Prophet ﷺ, so the first of them is him — and his panel
    // carries the sīra instead: the rows the others get would all read the same
    // for him, and the hadiths passing through him are the corpus.
    await reader.locator('.chain__node').first().click();
    const detail = page.locator('.detail');
    await expect(detail).toBeVisible();
    await expect(detail).toContainText('Name and lineage');
    await expect(detail).toContainText('The hijra');
    await expect(detail.locator('.row')).toHaveCount(0);
    await expect(detail.locator('.hadith-ref')).toHaveCount(0);

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

  test('a chain draws only the steps the isnad attests', async ({ app: page }) => {
    await openSidebar(page);
    // Abu Dawud 4272 is Khālid ibn Dihqān asking a Follower what a word in the
    // previous hadith meant. It never names the Prophet, so it stops where it
    // stops; 4271 — the hadith it is asking about, found by the same wording —
    // runs all the way to him. One search reaches both.
    await trace(page, 'اعتبط بقتله');

    await page.getByRole('button', { name: 'abudawud:4272', exact: true }).click();
    await expect(page.locator('.reader')).toBeVisible();
    await expect(page.locator('.reader__grade--warn')).toBeVisible();

    // Nothing is drawn up to the Prophet ﷺ: a line to him is a claim that the
    // report is his, and this report does not make it. The chain begins at the
    // last narrator the isnad names.
    const chain = page.locator('.chain');
    await expect(chain).not.toContainText('النبي');
    await expect(chain.locator('.chain__node').first()).toContainText('صدقة بن خالد');
    await expect(page.locator('.chain__arrow--broken')).toHaveCount(0);

    // The reader is a sheet over the list on a phone, so it has to be put away
    // before the next reference can be reached.
    await page.locator('.reader').getByRole('button', { name: 'Close' }).click();
    await page.getByRole('button', { name: 'abudawud:4271', exact: true }).click();
    await expect(page.locator('.reader')).toBeVisible();
    await expect(page.locator('.reader__grade--warn')).toHaveCount(0);
    await expect(page.locator('.chain').locator('.chain__node').first()).toContainText('النبي');
    await expect(page.locator('.chain__arrow--broken')).toHaveCount(0);
    await page.locator('.reader').getByRole('button', { name: 'Close' }).click();
  });

  test('a narrator nobody could name is drawn as the jump it is', async ({ app: page }) => {
    await openSidebar(page);
    // Bukhari 19 runs `… عن عبد الرحمن بن … بن أبي صعصعة، عن أبيه، عن أبي سعيد`.
    // The father is named only as a father, and no table turns that into a man,
    // so the step from Abū Saʿīd is one narrator longer than it looks.
    await trace(page, 'يوشك أن يكون خير مال المسلم غنم');

    await page.getByRole('button', { name: 'bukhari:19', exact: true }).click();
    await expect(page.locator('.reader')).toBeVisible();

    // The chain still reaches the Prophet, so the mark is inside it rather than
    // at its head — and it is the one step nobody reported as a hearing.
    await expect(page.locator('.reader__grade--warn')).toHaveCount(0);
    const broken = page.locator('.chain__arrow--broken');
    await expect(broken).toHaveCount(1);
    expect(await broken.getAttribute('title')).toContain('relation');
    await expect(page.locator('.chain li').nth(1).locator('.chain__arrow--broken')).toHaveCount(1);

    await page.locator('.reader').getByRole('button', { name: 'Close' }).click();
  });

  test('the biography panel moves between narrators', async ({ app: page }) => {
    await openSidebar(page);
    await trace(page, 'mercy');
    await page.locator('.hadith-ref').first().click();
    // Not the first node — that one is the Prophet ﷺ, and his panel is the
    // sīra, which has no one to move on to.
    await page.locator('.chain__node').nth(1).click();

    const detail = page.locator('.detail');
    await expect(detail).toBeVisible();
    const first = await detail.locator('.detail__ar').innerText();

    const chip = detail.locator('.chip').first();
    if (await chip.count()) {
      await chip.click();
      await expect(detail.locator('.detail__ar')).not.toHaveText(first);
    }
  });

  test('kinds of report widen within a heading and narrow between them', async ({ app: page }) => {
    await openSidebar(page);
    const kinds = page.locator('.panel', { hasText: 'Kinds of report' });
    const pick = (text: string) =>
      page.locator('.kinds__list li', { hasText: text }).first().locator('.check__box').click();

    // The panel arrives folded — ten options with their terms and counts is
    // most of a phone screen — and says so rather than hiding that it is there.
    await expect(page.locator('.kinds__list')).toHaveCount(0);
    await expect(kinds.locator('.fold__summary')).toBeVisible();
    await page.getByRole('button', { name: 'Kinds of report' }).click();

    // Every option carries the count it would give, so a filter can be judged
    // before it is spent — and the count has to be the truth.
    const stated = Number(
      (await page.locator('.kinds__list li', { hasText: 'not traced to the Prophet' })
        .first()
        .locator('.kinds__n')
        .innerText()).replace(/,/g, ''),
    );
    await pick('not traced to the Prophet');
    await settled(page);
    expect((await stats(page)).hadiths).toBe(stated);

    // A second choice under the same heading widens: this or that.
    const one = (await stats(page)).hadiths;
    await pick('a short chain');
    await settled(page);
    const both = (await stats(page)).hadiths;
    expect(both).toBeGreaterThanOrEqual(one);

    // A choice under another heading narrows: this, and ruled weak.
    await pick('weak');
    await settled(page);
    expect((await stats(page)).hadiths).toBeLessThanOrEqual(both);

    // Women are read off how the literature names them, so the option is only
    // worth having if what it counts is real. This collection has none at all —
    // forty hadiths qudsi, every chain through a Companion man — and a filter
    // that offered a number here would be inventing it.
    await kinds.getByRole('button', { name: 'clear' }).click();
    await settled(page);
    const none = page.locator('.kinds__list li', { hasText: 'a woman transmitted it' }).first();
    await expect(none.locator('.kinds__n')).toHaveText('0');

    // A collection that does have them, to see the same count spent.
    await page.locator('.books').getByText(CHAPTER_BOOK_TITLE).click();
    await settled(page);
    const stated_women = Number(
      (await page.locator('.kinds__list li', { hasText: 'a woman transmitted it' })
        .first()
        .locator('.kinds__n')
        .innerText()).replace(/,/g, ''),
    );
    expect(stated_women).toBeGreaterThan(0);
    await pick('a woman transmitted it');
    await settled(page);
    expect((await stats(page)).hadiths).toBe(stated_women);
    await page.locator('.books').getByText(CHAPTER_BOOK_TITLE).click();

    await kinds.getByRole('button', { name: 'clear' }).click();
    await settled(page);
    expect((await stats(page)).hadiths).toBe(SMALL_BOOK_HADITHS);

    // Folded again, with nothing chosen, it goes back to naming its headings.
    await page.getByRole('button', { name: 'Kinds of report' }).click();
    await expect(page.locator('.kinds__list')).toHaveCount(0);
  });

  test('a narrator can be found by name and lit up in the graph', async ({ app: page }) => {
    await openSidebar(page);
    const box = page.getByLabel('Find a narrator by name');
    const results = page.locator('.rawi');

    // Arabic finds the Arabic. `عائشة` is spelled here without the hamza and
    // without vowels, which is how it is typed.
    await box.fill('عائشه');
    await expect(results.first()).toBeVisible();
    await expect(results.first()).toContainText('عائشة');

    // Only 84 of the 8,123 narrators carry an English name, so a Latin query
    // has to reach the Arabic through the consonants both spellings share.
    await box.fill('abu hurayra');
    await expect(results.first()).toBeVisible();
    await expect(results.first()).toContainText('هريرة');

    // A narrator can be in the corpus without being on screen — al-Bukhārī is
    // not in this collection — and the list says so rather than lighting
    // nothing and leaving it at that.
    await box.fill('bukhari');
    await expect(results.first()).toBeVisible();
    await expect(results.first()).toContainText('not in view');

    await box.fill('abu hurayra');
    await expect(results.first()).toContainText('هريرة');
    await results.first().click();
    const detail = page.locator('.detail');
    await expect(detail).toBeVisible();
    await expect(detail.locator('.detail__ar')).toContainText('عبد الرحمن بن صخر');
    // The heading stops at the settled reading; the rest is on its title.
    expect(await detail.locator('.detail__ar').innerText()).not.toContain('وقيل');
    expect(await detail.locator('.detail__ar').getAttribute('title')).toContain('وقيل');

    await page.locator('.detail__close').click();
    await box.fill('zzzznobody');
    await expect(results).toHaveCount(0);
    await box.fill('');
  });

  test('an assessment opens onto what the work actually says', async ({ app: page }) => {
    await openSidebar(page);
    // al-Zuhrī is in Taqrīb al-Tahdhīb under a nasab nobody else has, which is
    // what made him matchable; 4,264 chains make him worth reading.
    await page.getByLabel('Find a narrator by name').fill('الزهري');
    await page.locator('.rawi').first().click();
    await expect(page.locator('.detail')).toBeVisible();

    // Only a card with an entry behind it offers to open. The others say what
    // they have always said and are not buttons.
    const openable = page.locator('.verdict--open');
    await expect(openable.first()).toBeVisible();
    await expect(page.locator('.verdict__text')).toHaveCount(0);

    await openable.first().locator('.verdict__toggle').click();
    const entry = page.locator('.verdict__text').first();
    await expect(entry).toBeVisible();
    // Ibn Ḥajar's sentence, not the one word the grade chip carries.
    await expect(entry).toContainText('الزهري');
    expect((await entry.innerText()).length).toBeGreaterThan(80);
    // Never the text on its own: the edition it was read from goes with it.
    await expect(page.locator('.verdict__edition').first()).toContainText('عوامة');

    await openable.first().locator('.verdict__toggle').click();
    await expect(page.locator('.verdict__text')).toHaveCount(0);
    await page.locator('.detail__close').click();
    await page.getByLabel('Find a narrator by name').fill('');
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
