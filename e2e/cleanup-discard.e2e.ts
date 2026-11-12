import { expect, test, type Page } from '@playwright/test';

const ART = '/opt/cursor/artifacts';

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${ART}/${name}.png`, animations: 'disabled' });
}

async function ready(page: Page) {
  await page.addInitScript(() => localStorage.setItem('ca_tips_seen', '1'));
  await page.goto('/?debug&fast');
  await page.locator('[data-deck="isperia"]').click();
  await page.locator('.startbar .big, .big').first().click();
  await page.locator('.primary', { hasText: 'Keep hand' }).click();
  await page.waitForFunction(() => /End turn|To combat|Main phase/.test(document.body.innerText));
}

async function nineCards(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as { __ca: { act: (f: (g: any) => void) => void; CARDS: Record<string, { name: string }> } };
    let chosen: { uid: number; name: string }[] = [];
    w.__ca.act(g => {
      const me = g.players[0];
      while (me.hand.length < 9) {
        const c = me.library.pop();
        if (!c) break;
        me.hand.push(c);
      }
      chosen = me.hand.slice(0, 2).map((c: { uid: number; id: string }) => ({ uid: c.uid, name: w.__ca.CARDS[c.id].name }));
    });
    return chosen;
  });
}

async function endTurn(page: Page) {
  const end = page.locator('.actionbar .sec', { hasText: 'End turn' });
  if (await end.count() && await end.first().isEnabled()) await end.first().click();
  else await page.locator('.primary').click();
  await expect(page.locator('.prompt')).toContainText('Discard 2 cards (hand size 7)', { timeout: 40_000 });
}

async function clickCard(page: Page, uid: number) {
  const card = page.locator(`[data-hand="${uid}"]`);
  await card.scrollIntoViewIfNeeded();
  const box = await card.boundingBox();
  if (!box) throw new Error('hand card has no box');
  await page.mouse.click(box.x + box.width / 2, box.y + Math.min(16, box.height / 2));
}

async function chooseTwo(page: Page, uids: number[]) {
  const confirm = page.locator('[data-discard-confirm]');
  await expect(confirm).toBeDisabled();
  await clickCard(page, uids[0]);
  await expect(page.locator(`[data-hand="${uids[0]}"]`)).toHaveAttribute('data-discarding', '1');
  await expect(page.locator('[data-discard-sel]')).toHaveAttribute('data-discard-sel', '1');
  await expect(confirm).toBeDisabled();
  await clickCard(page, uids[0]);
  await expect(page.locator(`[data-hand="${uids[0]}"]`)).not.toHaveAttribute('data-discarding', '1');
  await clickCard(page, uids[0]);
  await clickCard(page, uids[1]);
  await expect(confirm).toBeEnabled();
  const box = await confirm.boundingBox();
  expect(box && box.height).toBeGreaterThanOrEqual(44);
}

async function confirmDiscard(page: Page, uids: number[]) {
  await page.locator('[data-discard-confirm]').click();
  await page.waitForFunction(ids => {
    const g = (window as unknown as { __ca: { game: () => { players: { graveyard: { uid: number }[] }[] } } }).__ca.game();
    const gy = new Set(g.players[0].graveyard.map(c => c.uid));
    return (ids as number[]).every(id => gy.has(id));
  }, uids);
}

test('iPhone: choose which two cards to discard at cleanup', async ({ page }) => {
  await ready(page);
  const chosen = await nineCards(page);
  await endTurn(page);
  const uids = chosen.map(c => c.uid);
  await expect(page.locator('[data-discard-need]')).toHaveAttribute('data-discard-need', '2');
  await chooseTwo(page, uids);
  await shot(page, 'screenshot_cleanup_iphone_portrait');
  await page.setViewportSize({ width: 852, height: 393 });
  await page.waitForFunction(() => document.documentElement.classList.contains('short'));
  await expect(page.locator('[data-discard-confirm]')).toBeEnabled();
  await shot(page, 'screenshot_cleanup_iphone_landscape');
  await page.setViewportSize({ width: 1000, height: 500 });
  await page.waitForFunction(() => document.documentElement.classList.contains('wide'));
  await shot(page, 'screenshot_cleanup_iphone_foldable');
  await confirmDiscard(page, uids);
});

test('desktop: choose which two cards to discard at cleanup', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: false });
  const page = await ctx.newPage();
  await ready(page);
  await expect(page.locator('html')).not.toHaveClass(/compact/);
  const chosen = await nineCards(page);
  await endTurn(page);
  const uids = chosen.map(c => c.uid);
  await chooseTwo(page, uids);
  await shot(page, 'screenshot_cleanup_desktop');
  await confirmDiscard(page, uids);
  await ctx.close();
});
