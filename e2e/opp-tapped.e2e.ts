import { expect, test, type Page } from '@playwright/test';

const ART = '/opt/cursor/artifacts';

async function boot(page: Page) {
  await page.addInitScript(() => localStorage.setItem('ca_tips_seen', '1'));
  await page.goto('/?debug&fast');
  await page.locator('[data-deck="isperia"]').click();
  await page.locator('.startbar .big').click();
  await page.locator('.primary', { hasText: 'Keep hand' }).click();
  await page.waitForFunction(() => /End turn|To combat|Main phase/.test(document.body.innerText));
}

/** Drop creatures onto a battlefield, tapping every other one. */
async function stage(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __ca: { act: (f: (g: any) => void) => void; CARDS: Record<string, { types: string[] }> } };
    w.__ca.act(g => {
      const put = (pid: number, n: number) => {
        const p = g.players[pid];
        let k = 0;
        for (let i = p.library.length - 1; i >= 0 && k < n; i--) {
          const c = p.library[i];
          if (!w.__ca.CARDS[c.id].types.includes('Creature')) continue;
          p.library.splice(i, 1);
          c.tapped = k % 2 === 0;
          c.sick = false;
          p.battlefield.push(c);
          k++;
        }
        if (k < 2) throw new Error('not enough creatures to show tapped and untapped');
      };
      put(1, 4);
      put(0, 2);
    });
  });
}

/** A sideways card's matrix has a non-zero rotation; a flat one is none or a pure translation. */
async function tapStyle(page: Page, sel: string) {
  return page.locator(sel).first().evaluate(el => {
    const face = el.matches('.perm, .gtile, .cimg, .frame') ? el : el.querySelector('.perm, .cimg, .frame')!;
    const s = getComputedStyle(face);
    const slot = el.closest('.slot') ?? el;
    const row = slot.parentElement;
    const plain = row?.querySelector('.slot:not(.tapped), .gtile:not(.tapped)');
    const m = s.transform;
    const parts = m.startsWith('matrix(') ? m.slice(7, -1).split(',').map(n => parseFloat(n)) : [];
    const rotated = parts.length === 6 && (Math.abs(parts[1]) > 0.01 || Math.abs(parts[2]) > 0.01);
    return {
      transform: m,
      rotated,
      filter: s.filter,
      opacity: parseFloat(s.opacity),
      width: slot.getBoundingClientRect().width,
      plainWidth: plain ? plain.getBoundingClientRect().width : 0,
    };
  });
}

test('tapped opponent permanents stay put and only dim', async ({ browser }) => {
  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: false });
  const page = await desk.newPage();
  await boot(page);
  await stage(page);
  await expect(page.locator('.player.opp .slot.tapped').first()).toBeVisible();

  const opp = await tapStyle(page, '.player.opp .slot.tapped');
  expect(opp.rotated, JSON.stringify(opp)).toBe(false);
  expect(opp.filter, JSON.stringify(opp)).toContain('grayscale');
  expect(opp.opacity, JSON.stringify(opp)).toBeLessThan(0.95);
  expect(Math.abs(opp.width - opp.plainWidth), JSON.stringify(opp)).toBeLessThan(2);

  const mine = await tapStyle(page, '.player.me .slot.tapped');
  expect(mine.rotated, JSON.stringify(mine)).toBe(true);

  await page.locator('.player.opp').first().screenshot({ path: `${ART}/screenshot_opp_tapped.png`, animations: 'disabled' });
  await desk.close();

  const fold = await browser.newContext({ viewport: { width: 1024, height: 720 }, hasTouch: true });
  const wide = await fold.newPage();
  await boot(wide);
  await stage(wide);
  await expect(wide.locator('html')).toHaveClass(/wide/);
  const tile = await tapStyle(wide, '.player.opp .gtile.tapped');
  expect(tile.rotated, JSON.stringify(tile)).toBe(false);
  expect(tile.filter, JSON.stringify(tile)).toContain('grayscale');
  expect(tile.opacity, JSON.stringify(tile)).toBeLessThan(0.95);
  await wide.locator('.player.opp .gtile.tapped').first().click();
  await expect(wide.locator('[data-zoom] .pvcard[data-tapped="1"]')).toBeVisible();
  const zoomed = await tapStyle(wide, '[data-zoom] .pvcard.tapped .cimg');
  expect(zoomed.rotated, JSON.stringify(zoomed)).toBe(true);
  await wide.locator('[data-zoom] .zoombox').screenshot({ path: `${ART}/screenshot_opp_tapped_zoom.png`, animations: 'disabled' });
  await fold.close();

  const phone = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true });
  const port = await phone.newPage();
  await boot(port);
  await stage(port);
  await port.locator('.player.opp .boardtoggle').first().tap();
  await expect(port.locator('[data-opp-view]')).toBeVisible();
  const full = await tapStyle(port, '[data-opp-view] .slot.tapped');
  expect(full.rotated, JSON.stringify(full)).toBe(false);
  expect(full.filter, JSON.stringify(full)).toContain('grayscale');
  expect(full.opacity, JSON.stringify(full)).toBeLessThan(0.95);
  expect(Math.abs(full.width - full.plainWidth), JSON.stringify(full)).toBeLessThan(2);
  await phone.close();
});
