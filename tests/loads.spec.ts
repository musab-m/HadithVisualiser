import { expect, test } from '@playwright/test';
import { collectErrors, openWith, ready, stats } from './helpers';

/**
 * The site is static, so "does it load" means the whole corpus loads: a
 * manifest, sixteen book indexes and a narrator registry, all fetched with
 * relative paths that a base-path mistake would quietly break.
 *
 * This is the only file that opens with nothing saved, so it is also the only
 * one exercising the whole-corpus path — everything else starts from a small
 * selection to keep the suite quick.
 */
test.describe('loading', () => {
  test('a first visit draws the whole corpus', async ({ page }) => {
    const errors = collectErrors(page);
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);

    await ready(page);

    // The figures come from the manifest and the parsed chains; if the data
    // failed to fetch they are all zero and the page still looks fine.
    const { hadiths, narrators, links } = await stats(page);
    expect(hadiths).toBeGreaterThan(40_000);
    expect(narrators).toBeGreaterThan(5_000);
    expect(links).toBeGreaterThan(20_000);

    await expect(page.locator('canvas')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('the scene renders something rather than an empty canvas', async ({ page }) => {
    await page.goto('/');
    await ready(page);

    // A WebGL failure, a shader that will not compile, or a graph of nothing
    // all leave a canvas that is present, sized and blank.
    const drawn = await page.evaluate(() => {
      const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
      if (!canvas) return { ok: false, reason: 'no canvas' };
      const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
      if (!gl) return { ok: false, reason: 'no webgl context' };
      if (gl.isContextLost()) return { ok: false, reason: 'context lost' };
      return { ok: canvas.width > 0 && canvas.height > 0, reason: `${canvas.width}x${canvas.height}` };
    });
    expect(drawn.ok, drawn.reason).toBe(true);

    // Narrator labels are DOM, and only exist once a layout has been applied.
    await expect(page.locator('.node-label').first()).toBeVisible({ timeout: 60_000 });
  });

  // The layout of the page is the same whatever is selected, so these two run
  // against one small collection rather than paying for the whole corpus.
  test('the page is navigable without a mouse', async ({ page }) => {
    await openWith(page);

    expect(await page.getAttribute('html', 'lang')).toBeTruthy();
    await expect(page).toHaveTitle(/isn/i);

    // One h1, and headings for each section, so the page has a structure a
    // screen reader can move through.
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'Collections' })).toBeVisible();

    // Record focus as it moves rather than asking after every keystroke: with
    // a software renderer each round trip costs a frame.
    await page.evaluate(() => {
      (window as unknown as { __focus: string[] }).__focus = [];
      document.addEventListener('focusin', () => {
        const el = document.activeElement;
        (window as unknown as { __focus: string[] }).__focus.push(el?.tagName.toLowerCase() ?? 'none');
      });
    });
    for (let i = 0; i < 8; i++) await page.keyboard.press('Tab');
    const reached = await page.evaluate(() => (window as unknown as { __focus: string[] }).__focus);

    // Tabbing has to reach real controls rather than being swallowed by the
    // canvas, which takes focus and gives nothing back.
    expect(reached.filter((tag) => tag === 'input' || tag === 'button').length).toBeGreaterThan(2);
  });

  test('every control has a name a screen reader can announce', async ({ page }) => {
    await openWith(page);

    const unnamed = await page.evaluate(() => {
      // Deliberately not `??` between these: an absent aria-labelledby yields
      // an empty string, which is not nullish, and would end the chain before
      // the element's own text was ever considered.
      const name = (el: Element) => {
        const labelledBy = el.getAttribute('aria-labelledby');
        return (
          el.getAttribute('aria-label') ||
          (labelledBy ? (document.getElementById(labelledBy)?.textContent ?? '') : '') ||
          el.textContent ||
          ''
        ).trim();
      };

      const bad: string[] = [];
      for (const button of document.querySelectorAll('button')) {
        if ((button as HTMLElement).offsetParent === null) continue;
        if (!name(button)) bad.push(`button: ${button.className}`);
      }
      for (const input of document.querySelectorAll('input')) {
        const labelled =
          input.getAttribute('aria-label') ||
          input.getAttribute('placeholder') ||
          input.closest('label')?.textContent?.trim();
        if (!labelled) bad.push(`input: ${input.className}`);
      }
      return bad;
    });
    expect(unnamed).toEqual([]);
  });
});
