import { test as base, devices, expect, type Page } from '@playwright/test';
import { SMALL_BOOK_HADITHS, SMALL_BOOK_TITLE, ready, settled } from './helpers';

/**
 * A page that outlives the test using it.
 *
 * Booting this site costs about fifteen seconds before a test can do anything,
 * and almost none of that is the corpus: the network is ~100ms and parsing all
 * sixteen book indexes is under 80ms. It is the app coming up and WebGL being
 * set up in software, which a runner without a GPU pays in full. That cost is
 * the same whether the graph holds forty chains or fifty thousand, so it does
 * not shrink by testing less — it only shrinks by paying it fewer times.
 *
 * So the page is created once per worker and handed to every test that can work
 * from a known state, with `resetApp` putting it back between them through the
 * interface rather than by reloading — a reload would buy the boot again.
 *
 * Tests that need a genuinely fresh start — a first visit, anything about what
 * survives a refresh — take the ordinary `page` fixture instead and pay for it
 * knowingly.
 */
export const test = base.extend<{ app: Page }, { sharedPage: Page }>({
  sharedPage: [
    async ({ browser }, use, workerInfo) => {
      const mobile = workerInfo.project.name === 'mobile';
      const context = await browser.newContext({
        baseURL: 'http://127.0.0.1:4173',
        ...(mobile ? devices['Pixel 7'] : { viewport: { width: 1440, height: 900 } }),
      });
      const page = await context.newPage();

      // One collection to start from: small enough that every interaction on it
      // is about a second rather than the twenty-six a full-corpus click costs
      // without a GPU.
      await page.addInitScript((view) => {
        localStorage.setItem('isnad:view', JSON.stringify(view));
      }, CLEAN);
      await page.goto('/');
      await ready(page);

      await use(page);
      await context.close();
    },
    { scope: 'worker' },
  ],

  app: async ({ sharedPage }, use) => {
    await resetApp(sharedPage);
    await use(sharedPage);
  },
});

export { expect };

/** The state every shared test starts from. */
const CLEAN = {
  v: 2,
  books: ['qudsi40'],
  chapters: [],
  pinned: [],
  query: '',
  phraseOnly: false,
  isolated: [],
};

/**
 * Put the app back to one small collection, nothing else open.
 *
 * Driven through the interface, because a reload costs the same thirteen
 * seconds as a whole new page — measured, not assumed — so reloading between
 * tests would give back everything sharing a page saves.
 *
 * The catch is that a reset by clicking is only as good as its author's guess
 * about what the last test left behind, and a wrong guess shows up as one test
 * failing because of another, which is worse than a slow suite. So the state is
 * *verified* afterwards, and anything unexpected falls back to a reload. The
 * fast path is the common one; correctness does not depend on it.
 */
export async function resetApp(page: Page): Promise<void> {
  // Ask first. Checking costs a few DOM queries; tidying costs several clicks
  // and a relayout each, which was quietly giving back much of what sharing a
  // page saves. Most tests leave at least part of this already true.
  if (await isClean(page)) return;

  try {
    await tidyUp(page);
    await expectClean(page);
  } catch {
    await hardReset(page);
  }
}

/** The same conditions as `expectClean`, as a question rather than an assertion. */
async function isClean(page: Page): Promise<boolean> {
  return page.evaluate(
    ([title, hadiths]) => {
      const none = (sel: string) => !document.querySelector(sel);
      const on = [...document.querySelectorAll('.book--on')];
      return (
        none('.detail') &&
        none('.reader') &&
        none('.menu') &&
        none('.isolation') &&
        none('.found') &&
        none('.app--controls') &&
        on.length === 1 &&
        (on[0].textContent ?? '').includes(title as string) &&
        document.querySelector('.stat__value')?.textContent === String(hadiths)
      );
    },
    [SMALL_BOOK_TITLE, SMALL_BOOK_HADITHS] as [string, number],
  );
}

/** Seed the known view and reload. Slow, certain, and rarely needed. */
async function hardReset(page: Page): Promise<void> {
  await page.evaluate((view) => {
    localStorage.setItem('isnad:view', JSON.stringify(view));
  }, CLEAN);
  await page.reload();
  await ready(page);
  await expectClean(page);
}

/** Everything the shared tests rely on being true when they start. */
async function expectClean(page: Page): Promise<void> {
  await expect(page.locator('.detail')).toHaveCount(0);
  await expect(page.locator('.reader')).toHaveCount(0);
  await expect(page.locator('.menu')).toHaveCount(0);
  await expect(page.locator('.isolation')).toHaveCount(0);
  await expect(page.locator('.found')).toHaveCount(0);
  await expect(page.locator('.app--controls')).toHaveCount(0);
  await expect(page.locator('.book--on')).toHaveCount(1);
  await expect(page.locator('.book--on')).toContainText(SMALL_BOOK_TITLE);
  await expect(page.locator('.stat__value').first()).toHaveText(String(SMALL_BOOK_HADITHS));
}

async function tidyUp(page: Page): Promise<void> {
  // Either sheet can be the upper one, so close whichever is actually on top
  // and look again rather than assuming an order.
  for (let attempt = 0; attempt < 3; attempt++) {
    const closes = page.locator('.detail__close, .reader__close');
    if (!(await closes.count())) break;
    await closes.last().click({ timeout: 10_000 });
  }
  if (await page.locator('.menu').count()) await page.keyboard.press('Escape');

  const isolation = page.locator('.isolation__clear');
  if (await isolation.count()) {
    await isolation.click();
    await settled(page);
  }

  // The controls sheet has to be open on a phone to reach anything below.
  const toggle = page.locator('.topbar__toggle');
  const onPhone = await toggle.isVisible();
  if (onPhone && (await toggle.innerText()).includes('search')) await toggle.click();

  const clearSearch = page
    .locator('.panel', { hasText: 'Trace a wording' })
    .getByRole('button', { name: 'clear' });
  if (await clearSearch.count()) {
    await clearSearch.click();
    await settled(page);
  }
  // The query box keeps its text after a clear; a stale draft would be
  // submitted by the next test that presses trace without typing.
  const draft = page.getByLabel('Search the text of the hadiths');
  if (await draft.inputValue()) await draft.fill('');

  const clearPins = page
    .locator('.panel', { hasText: 'Selected hadiths' })
    .getByRole('button', { name: 'clear' });
  if (await clearPins.count()) {
    await clearPins.click();
    await settled(page);
  }

  const chapters = page.getByRole('button', { name: 'whole book' });
  while (await chapters.count()) {
    await chapters.first().click();
    await settled(page);
  }
  const hideChapters = page.getByRole('button', { name: 'hide chapters' });
  if (await hideChapters.count()) await hideChapters.first().click();

  // Back to the one small collection.
  const on = await page.locator('.book--on').count();
  const wanted = page.locator('.book', { hasText: SMALL_BOOK_TITLE });
  if (on !== 1 || !(await wanted.evaluate((el) => el.classList.contains('book--on')))) {
    const all = page.getByRole('button', { name: 'all', exact: true });
    if (await all.count()) await all.click();
    await page.getByRole('button', { name: 'none', exact: true }).click();
    await settled(page);
    await wanted.locator('.check__box').click();
    await settled(page);
  }

  const legend = page.getByRole('button', { name: 'hide sources' });
  if (await legend.count()) await legend.click();

  if (onPhone) {
    // Leave the sheet closed: the graph is what a phone shows at rest.
    if ((await toggle.innerText()).includes('view the graph')) await toggle.click();
  }
}
