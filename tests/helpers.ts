import { expect, type Locator, type Page } from '@playwright/test';

/**
 * A collection small enough that the graph settles in a second or two. Most
 * tests are about whether a control does what it says, not about scale, and
 * running each of them against 49,843 chains would make the suite unusable.
 */
export const SMALL_BOOK = 'qudsi40';

/** Listed in the sidebar as "The Forty Hadith Qudsi". */
export const SMALL_BOOK_TITLE = 'The Forty Hadith Qudsi';
export const SMALL_BOOK_HADITHS = 40;

/** The smallest collection that is divided into chapters — 402 across 57. */
export const CHAPTER_BOOK = 'shamail_muhammadiyah';
export const CHAPTER_BOOK_TITLE = 'Shamail al-Muhammadiyah';

/**
 * Errors the page logged. Attach before navigating.
 *
 * Console errors are collected as well as thrown ones because React swallows a
 * render error into `console.error` before the boundary rethrows, and a failed
 * shard fetch never throws at all.
 */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];

  /**
   * The site pulls its two typefaces from Google Fonts, so a run on a machine
   * without outbound access — a sandbox, an offline laptop — reports a failure
   * that says nothing about the code under test. Only what this site serves is
   * held to account here.
   */
  const ours = (url: string) => {
    try {
      return new URL(url).host === '127.0.0.1:4173';
    } catch {
      return true;
    }
  };

  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (!ours(message.location().url || '')) return;
    const text = message.text();
    // Chromium reports a lost WebGL context on teardown of a headless page;
    // it says nothing about the site.
    if (text.includes('Context Lost')) return;
    errors.push(`console: ${text}`);
  });
  page.on('requestfailed', (request) => {
    if (!ours(request.url())) return;
    const failure = request.failure()?.errorText ?? '';
    // Navigating away mid-fetch cancels requests; that is not a failure.
    if (failure.includes('ERR_ABORTED')) return;
    errors.push(`request failed: ${request.url()} — ${failure}`);
  });
  return errors;
}

/**
 * Load the site with a starting selection already saved, so the app never lays
 * out the whole corpus.
 *
 * This uses the same storage the app writes on every change, which does mean a
 * broken persistence layer would show up as failures across the suite rather
 * than in one place — `view.spec.ts` covers that path directly, so look there
 * first when everything goes red at once.
 */
export async function openWith(
  page: Page,
  view: Partial<{
    books: string[];
    chapters: [string, number[]][];
    pinned: string[];
    query: string;
    phraseOnly: boolean;
    isolated: string[];
    focus: string;
  }> = {},
): Promise<void> {
  // Seeded only when there is nothing stored. An init script runs on every
  // navigation, so seeding unconditionally would re-apply this on reload and
  // silently undo whatever the app had saved — which is the one thing the
  // persistence test is trying to observe.
  await page.addInitScript((saved) => {
    if (!localStorage.getItem('isnad:view')) {
      localStorage.setItem('isnad:view', JSON.stringify(saved));
    }
  }, {
    v: 2,
    books: [SMALL_BOOK],
    chapters: [],
    pinned: [],
    query: '',
    phraseOnly: false,
    isolated: [],
    ...view,
  });
  await page.goto('/');
  await ready(page);
}

/**
 * Change the saved view and reload into it.
 *
 * `openWith` seeds through an init script, which cannot be re-registered with
 * a different value — the scripts accumulate and the first one still runs. So a
 * test that needs a second starting point edits the stored view the way the app
 * would have and reloads, which is also closer to what it is asserting.
 */
export async function applyView(page: Page, patch: Record<string, unknown>): Promise<void> {
  await page.evaluate((changes) => {
    const stored = JSON.parse(localStorage.getItem('isnad:view') ?? '{"v":2}');
    localStorage.setItem('isnad:view', JSON.stringify({ ...stored, ...changes }));
  }, patch);
  await page.reload();
  await ready(page);
}

/** Wait for the corpus to load and the graph to stop being rearranged. */
export async function ready(page: Page): Promise<void> {
  await expect(page.locator('.boot')).toHaveCount(0, { timeout: 120_000 });
  await expect(page.locator('.books input').first()).toBeAttached({ timeout: 60_000 });
  await settled(page);
}

/** Wait out an in-flight layout. */
export async function settled(page: Page): Promise<void> {
  // The worker is only started after the graph is rebuilt, so give the click
  // that triggered it a moment to get that far before deciding it is done.
  await page.waitForTimeout(300);
  await expect(page.locator('.laying')).toHaveCount(0, { timeout: 120_000 });
}

/** The three figures across the top of the sidebar. */
export async function stats(page: Page): Promise<{ hadiths: number; narrators: number; links: number }> {
  const values = await page.locator('.stat__value').allInnerTexts();
  const [hadiths, narrators, links] = values.map((v) => Number(v.replace(/,/g, '')));
  return { hadiths, narrators, links };
}

/** The sidebar is a sheet on a phone; open it before touching anything inside. */
export async function openSidebar(page: Page): Promise<void> {
  const toggle = page.locator('.topbar__toggle');
  if (!(await toggle.isVisible())) return;
  if ((await toggle.innerText()).includes('search')) await toggle.click();
  await expect(page.locator('.app--controls')).toHaveCount(1);
}

/**
 * Right-click the first narrator found along the vertical centre of the canvas.
 *
 * Nodes are spheres in a 3D scene with no DOM of their own, so there is nothing
 * to select — they have to be hit. With a single chain drawn they stack down
 * the middle of the view, which makes a scan down that line reliable rather
 * than a matter of luck.
 */
export async function openNodeMenu(page: Page): Promise<boolean> {
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) return false;
  const x = box.x + box.width / 2;
  for (let y = box.y + box.height * 0.12; y < box.y + box.height * 0.9; y += 8) {
    // The canvas covers the window, but panels and the legend sit over it — on
    // a phone they cover most of it. Clicking where one of those is on top
    // never reaches the scene, so skip those points rather than spending the
    // scan on them.
    const onCanvas = await page.evaluate(
      ([px, py]) => document.elementFromPoint(px, py)?.tagName === 'CANVAS',
      [x, y],
    );
    if (!onCanvas) continue;

    await page.mouse.click(x, y, { button: 'right' });
    if (await page.locator('.menu').count()) return true;
  }
  return false;
}

/** Give the scene the screen back, so nodes can be reached by pointer. */
export async function showGraph(page: Page): Promise<void> {
  const toggle = page.locator('.topbar__toggle');
  if (!(await toggle.isVisible())) return;
  if ((await toggle.innerText()).includes('view the graph')) await toggle.click();
  await expect(page.locator('.app--controls')).toHaveCount(0);
}

/** Run a text search and wait for the graph to catch up with it. */
export async function trace(page: Page, wording: string): Promise<void> {
  await page.getByLabel('Search the text of the hadiths').fill(wording);
  await page.getByRole('button', { name: 'trace' }).click();
  await expect(page.locator('.found, .hint').first()).toBeVisible();
  await settled(page);
}

/** Every button that is on screen and meant to be usable. */
export function liveButtons(page: Page): Locator {
  return page.locator('button:visible:not([disabled])');
}
