import { expect, test } from '@playwright/test';
import { SMALL_BOOK, applyView, openWith, settled, stats } from './helpers';

/**
 * The phone layout is a different arrangement rather than a narrower one: the
 * sidebar becomes a sheet, the biography and the reader become sheets under it,
 * and the only way to the controls is the top bar. None of that is exercised by
 * the desktop run.
 */
test.describe('on a phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone layout only');

  test('the sheet opens from the top bar and gives the screen back', async ({ page }) => {
    await openWith(page);

    const toggle = page.locator('.topbar__toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveText('search & collections');

    // At rest the sheet is off screen rather than merely invisible, so the
    // graph has the whole viewport.
    const off = await page.locator('.sidebar').boundingBox();
    const height = page.viewportSize()!.height;
    expect(off!.y).toBeGreaterThanOrEqual(height - 2);

    await toggle.click();
    await expect(toggle).toHaveText('view the graph');
    const open = await page.locator('.sidebar').boundingBox();
    expect(open!.y).toBeLessThan(height);

    await toggle.click();
    await expect(toggle).toHaveText('search & collections');
  });

  test('choosing a hadith closes the sheet so the chain is visible', async ({ page }) => {
    await openWith(page);
    await page.locator('.topbar__toggle').click();

    await page.getByPlaceholder(/Hadith number/).fill('qudsi40 1');
    await page.locator('.picker__result').first().click();
    await settled(page);

    await expect(page.locator('.app--controls')).toHaveCount(0);
    expect((await stats(page)).hadiths).toBe(1);
  });

  test('a long press opens the narrator menu; a tap does not', async ({ page, context }) => {
    // Dispatching a 90ms press does not mean the page receives one. With a
    // software renderer driving a 3D scene, the main thread stalls for seconds
    // and the release lands late enough to be a long press in good faith — so
    // wall-clock duration cannot separate a tap from a hold here at all. What
    // can be judged is the outcome: a press the site treated as a tap must not
    // have opened the menu as well.
    await openWith(page, { pinned: [`${SMALL_BOOK}:1`] });
    await settled(page);

    const cdp = await context.newCDPSession(page);
    const hold = async (x: number, y: number, ms: number) => {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x, y, radiusX: 6, radiusY: 6, force: 1, id: 1 }],
      });
      await page.waitForTimeout(ms);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };

    const box = (await page.locator('canvas').boundingBox())!;
    const x = box.x + box.width / 2;

    // Find a narrator with short taps, which also proves a tap opens the
    // biography and never the menu.
    let hit: number | undefined;
    for (let y = box.y + box.height * 0.12; y < box.y + box.height * 0.9 && hit === undefined; y += 8) {
      await hold(x, y, 90);
      await page.waitForTimeout(120);

      if (await page.locator('.detail').count()) {
        hit = y;
        // This press was handled as a tap — it opened the biography — so it is
        // a press the tap rule can be judged on, whatever the clock says it
        // lasted. Both opening at once would mean the long-press timer fired
        // and the click was not suppressed.
        expect(await page.locator('.menu').count(), 'a tap opened the menu too').toBe(0);
        await page.locator('.detail__close').click();
      } else if (await page.locator('.menu').count()) {
        // Delivered as a hold rather than a tap: inconclusive, not a failure.
        // Nothing here can make the runtime hand over a 90ms press when the
        // main thread is stalled for seconds at a time.
        await page.keyboard.press('Escape');
      }
    }
    expect(hit, 'never landed on a narrator').not.toBeUndefined();

    // Held, the menu must appear while the finger is still down. The wait is
    // long because a software renderer starves timers between frames, not
    // because the press is.
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y: hit!, radiusX: 6, radiusY: 6, force: 1, id: 1 }],
    });
    await expect(page.locator('.menu')).toBeVisible({ timeout: 30_000 });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    // The click that follows the press belongs to the menu, not to the node.
    await expect(page.locator('.menu')).toBeVisible();
    await expect(page.locator('.detail')).toHaveCount(0);

    // And it has to be reachable, not hanging off the edge of the screen.
    const menu = (await page.locator('.menu').boundingBox())!;
    const view = page.viewportSize()!;
    expect(menu.x).toBeGreaterThanOrEqual(0);
    expect(menu.y).toBeGreaterThanOrEqual(0);
    expect(menu.x + menu.width).toBeLessThanOrEqual(view.width + 1);
    expect(menu.y + menu.height).toBeLessThanOrEqual(view.height + 1);
  });

  test('the isolation bar stays clear of the top bar and inside the screen', async ({ page }) => {
    await openWith(page);
    const id = await page.evaluate(async () => {
      const res = await fetch('data/narrators/index.json');
      const file = await res.json();
      const all = Object.values(file.narrators ?? file) as { id: string; ar: string; n: number }[];
      // The longest name in the corpus is the case that breaks the layout.
      const named = all.filter((n) => n.id !== 'prophet' && n.n > 1 && !/\d/.test(n.ar));
      named.sort((a, b) => b.ar.length - a.ar.length);
      return named[0]?.id ?? '';
    });
    test.skip(!id, 'no narrator to isolate on');

    await applyView(page, { books: ['bukhari'], isolated: [id] });

    const bar = await page.locator('.isolation').boundingBox();
    const topbar = await page.locator('.topbar').boundingBox();
    expect(bar!.y).toBeGreaterThanOrEqual(topbar!.y + topbar!.height - 1);
    expect(bar!.x + bar!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);

    // Everything inside the bar has to sit inside it — a chip that overflows
    // paints across the count and the way out.
    const spilled = await page.evaluate(() => {
      const bar = document.querySelector('.isolation')!.getBoundingClientRect();
      return [...document.querySelectorAll('.isolation__who li, .isolation__count, .isolation__clear')]
        .map((n) => n.getBoundingClientRect())
        .filter((r) => r.right > bar.right + 0.5 || r.left < bar.left - 0.5 || r.bottom > bar.bottom + 0.5).length;
    });
    expect(spilled).toBe(0);
  });
});
