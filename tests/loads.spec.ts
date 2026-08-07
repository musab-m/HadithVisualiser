import { test as fresh } from '@playwright/test';
import { expect, test } from './fixtures';
import { collectErrors, openSidebar, ready, stats, trace } from './helpers';

/**
 * The site is static, so "does it load" means the whole corpus loads: a
 * manifest, eleven book indexes and a narrator registry, all fetched with
 * relative paths that a base-path mistake would quietly break.
 *
 * This is the only file that opens with nothing saved, so it is also the only
 * one exercising the whole-corpus path — everything else starts from a small
 * selection to keep the suite quick.
 */
fresh.describe('loading from cold', () => {
  fresh('a first visit draws the whole corpus', async ({ page }) => {
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

  fresh('the scene renders something rather than an empty canvas', async ({ page }) => {
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

});

/**
 * The page has the same structure whatever is selected, so these share a page
 * with the rest of the suite rather than each paying for a boot.
 */
test.describe('the page itself', () => {
  test('the page is navigable without a mouse', async ({ app: page }) => {

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

  test('text has enough contrast against what is behind it', async ({ app: page }) => {
    // Put as much of the interface on screen as one page can hold, so this
    // judges the panels, the results, the reader and a biography rather than
    // an empty sidebar.
    // The legend goes first: once the reader is open it covers that corner.
    await page.getByRole('button', { name: 'about the data' }).click();
    await openSidebar(page);
    await trace(page, 'mercy');
    await page.locator('.hadith-ref').first().click();
    await expect(page.locator('.reader')).toBeVisible();
    await page.locator('.chain__node').first().click();
    await expect(page.locator('.detail')).toBeVisible();

    const failures = await page.evaluate(() => {
      const parse = (colour: string): [number, number, number, number] => {
        const parts = colour.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0];
        return [parts[0], parts[1], parts[2], parts[3] ?? 1];
      };
      const channel = (c: number) => {
        const s = c / 255;
        return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      const luminance = ([r, g, b]: number[]) =>
        0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
      const over = (fg: number[], bg: number[]) =>
        [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3]));

      /** Composite every translucent ancestor down to the page background. */
      const backdrop = (el: Element): number[] => {
        const stack: number[][] = [];
        for (let node: Element | null = el; node; node = node.parentElement) {
          const layer = parse(getComputedStyle(node).backgroundColor);
          if (layer[3] > 0) stack.push(layer);
          if (layer[3] === 1) break;
        }
        // The page itself is the floor; nothing here sits on white.
        let base = [7, 10, 18];
        for (const layer of stack.reverse()) base = over(layer, base);
        return base;
      };

      const bad: string[] = [];
      const seen = new Set<Element>();
      for (const node of document.querySelectorAll('body *')) {
        // Only elements holding text of their own.
        const text = [...node.childNodes]
          .filter((c) => c.nodeType === Node.TEXT_NODE)
          .map((c) => c.textContent?.trim())
          .join('');
        if (!text || seen.has(node)) continue;
        seen.add(node);

        const style = getComputedStyle(node);
        if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') continue;
        const rect = node.getBoundingClientRect();
        if (!rect.width || !rect.height) continue;
        // Labels drawn over the 3D scene have a canvas behind them, which
        // cannot be sampled this way; they carry their own backdrop and shadow.
        if (node.closest('.scene') || node.closest('.node-label') || node.closest('.band-label')) continue;

        const fg = parse(style.color);
        const colour = fg[3] < 1 ? over(fg, backdrop(node)) : fg.slice(0, 3);
        const [a, b] = [luminance(colour), luminance(backdrop(node))].sort((x, y) => y - x);
        const contrast = (a + 0.05) / (b + 0.05);

        // WCAG AA: 3:1 once the text is large and bold, 4.5:1 otherwise.
        const size = parseFloat(style.fontSize);
        const bold = Number(style.fontWeight) >= 700;
        const needed = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
        if (contrast < needed) {
          bad.push(
            `${node.className || node.tagName} "${text.slice(0, 24)}" ${contrast.toFixed(2)}:1 (needs ${needed})`,
          );
        }
      }
      return bad;
    });

    expect(failures).toEqual([]);
  });

  test('every control has a name a screen reader can announce', async ({ app: page }) => {

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
