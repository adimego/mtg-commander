import { expect, test, type Page } from '@playwright/test';

const ART = '/opt/cursor/artifacts';

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${ART}/${name}.png`, animations: 'disabled' });
}

/** Every hand card's picture sits fully inside the hand strip and the viewport. */
async function assertHand(page: Page) {
  const cards = page.locator('.hand .hcard');
  const n = await cards.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const card = cards.nth(i);
    await card.scrollIntoViewIfNeeded();
    const box = await card.evaluate(el => {
      const hand = el.closest('.hand')!.getBoundingClientRect();
      const img = (el.querySelector('.cimg, .frame') as HTMLElement).getBoundingClientRect();
      return {
        doc: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) <= window.innerHeight + 1,
        clipped: img.top < hand.top - 1 || img.bottom > hand.bottom + 1 || img.left < hand.left - 1 || img.right > hand.right + 1,
        outside: img.top < -1 || img.left < -1 || img.bottom > window.innerHeight + 1 || img.right > window.innerWidth + 1,
        short: img.height < img.width * 1.25 || img.height < 40,
        height: img.height,
        width: img.width,
      };
    });
    expect(box.doc, JSON.stringify(box)).toBe(true);
    expect(box.clipped, JSON.stringify(box)).toBe(false);
    expect(box.outside, JSON.stringify(box)).toBe(false);
    expect(box.short, JSON.stringify(box)).toBe(false);
  }
}

async function boot(page: Page) {
  await page.addInitScript(() => localStorage.setItem('ca_tips_seen', '1'));
  await page.goto('/?debug&fast');
  await page.locator('[data-deck="isperia"]').click();
  await page.locator('.startbar .big').click();
  await expect(page.locator('.hand .hcard')).toHaveCount(7);
}

test('wide foldable hand shows full cards in every phase', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 720 });
  await boot(page);
  await expect(page.locator('html')).toHaveClass(/wide/);
  await assertHand(page);
  await shot(page, 'screenshot_duo_hand_mulligan');

  await page.locator('.primary', { hasText: 'Keep hand' }).click();
  await page.waitForFunction(() => /End turn|To combat|Main phase/.test(document.body.innerText));
  await assertHand(page);
  await shot(page, 'screenshot_duo_hand_main');

  for (const size of [{ width: 1000, height: 500 }, { width: 852, height: 393 }, { width: 768, height: 1024 }]) {
    await page.setViewportSize(size);
    await page.waitForFunction(() => document.documentElement.classList.contains('wide'));
    await assertHand(page);
  }
  await page.setViewportSize({ width: 852, height: 393 });
  await shot(page, 'screenshot_duo_hand_landscape');

  await page.setViewportSize({ width: 1024, height: 720 });
  await page.evaluate(() => {
    const w = window as unknown as { __ca: { act: (f: (g: any) => void) => void; CARDS: Record<string, { types: string[]; keywords?: string[] }> } };
    w.__ca.act(g => {
      const me = g.players[0];
      let n = 0;
      for (let i = me.library.length - 1; i >= 0 && n < 5; i--) {
        const c = me.library[i];
        const d = w.__ca.CARDS[c.id];
        if (!d.types.includes('Creature') || (d.keywords ?? []).includes('defender')) continue;
        me.library.splice(i, 1);
        c.tapped = false; c.sick = false; c.kw = ['haste'];
        me.battlefield.push(c);
        n++;
      }
      g.active = 0; g.step = 'attackers'; g.awaiting = 'attack'; g.priority = 0;
      g.stack = []; g.pending = []; g.decision = null; g.choice = null;
    });
  });
  await expect(page.locator('[data-combat="attack"]')).toBeVisible();
  await assertHand(page);

  await page.evaluate(() => {
    const w = window as unknown as { __ca: { act: (f: (g: any) => void) => void } };
    w.__ca.act(g => {
      const me = g.players[0];
      g.awaiting = null; g.step = 'main2'; g.priority = 0; g.active = 0; g.passes = 0;
      g.stack = []; g.pending = []; g.decision = null; g.choice = null;
      while (me.hand.length < 9 && me.library.length) me.hand.push(me.library.pop());
    });
  });
  const end = page.locator('.actionbar .sec', { hasText: 'End turn' });
  if (await end.count()) await end.first().click();
  else await page.locator('.primary').click();
  await expect(page.locator('.prompt')).toContainText(/Discard \d+ cards/, { timeout: 30_000 });
  await assertHand(page);
  await shot(page, 'screenshot_duo_hand_discard');
});

test('portrait phone and desktop hands are unchanged', async ({ browser }) => {
  const phone = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true });
  const page = await phone.newPage();
  await boot(page);
  await expect(page.locator('html')).toHaveClass(/portrait/);
  await expect(page.locator('html')).not.toHaveClass(/wide/);
  await expect(page.locator('[data-glance]')).toHaveCount(0);
  await page.locator('.primary', { hasText: 'Keep hand' }).click();
  await expect(page.locator('.hand .hcard').first()).toBeVisible();
  await phone.close();

  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: false });
  const dpage = await desk.newPage();
  await boot(dpage);
  await expect(dpage.locator('html')).not.toHaveClass(/compact/);
  expect(await dpage.locator('.hand').evaluate(el => getComputedStyle(el).position)).toBe('absolute');
  await desk.close();
});
