import { expect, test, type Page } from '@playwright/test';

const ART = '/opt/cursor/artifacts';

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${ART}/${name}.png`, animations: 'disabled' });
}

async function onScreen(page: Page) {
  const box = await page.locator('[data-back]').boundingBox();
  const vp = page.viewportSize()!;
  expect(box).toBeTruthy();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height + 1);
  expect(box!.x).toBeLessThan(vp.width / 2);
  expect(box!.y).toBeLessThan(120);
}

async function start(page: Page) {
  await page.addInitScript(() => localStorage.setItem('ca_tips_seen', '1'));
  await page.goto('/?debug&fast');
  await page.locator('[data-deck="isperia"]').click();
  await page.locator('.startbar .big').click();
  await page.locator('.primary', { hasText: 'Keep hand' }).click();
  await expect(page.locator('.player.me')).toBeVisible();
  await expect(page.locator('[data-back]')).toHaveCount(0);
}

async function openAndBack(page: Page, open: () => Promise<void>, gone: string) {
  await open();
  await expect(page.locator('[data-back]')).toBeVisible();
  await onScreen(page);
  await page.locator('[data-back]').tap();
  await expect(page.locator(gone)).toHaveCount(0);
  await expect(page.locator('.player.me')).toBeVisible();
  await expect(page.locator('[data-back]')).toHaveCount(0);
}

test('iPhone Back returns to the board from every inspect view', async ({ page }) => {
  await start(page);

  await page.locator('.me button[title="View graveyard"]').tap();
  await expect(page.locator('.modal h2')).toContainText('Graveyard');
  await onScreen(page);
  await shot(page, 'screenshot_back_iphone_portrait_view');
  await page.locator('[data-back]').tap();
  await expect(page.locator('.modal')).toHaveCount(0);
  await expect(page.locator('.player.me')).toBeVisible();
  await shot(page, 'screenshot_back_iphone_portrait_board');

  await openAndBack(page, async () => {
    await page.locator('.me button[title="View exile"]').tap();
    await expect(page.locator('.modal h2')).toContainText('Exile');
  }, '.modal');

  const zone = page.locator('.me [data-cmd]').first();
  await zone.scrollIntoViewIfNeeded();
  const zb = await zone.boundingBox();
  await page.mouse.move(zb!.x + zb!.width / 2, zb!.y + Math.min(12, zb!.height / 2));
  await page.mouse.down();
  await expect(page.locator('[data-zoom]')).toBeVisible();
  await page.mouse.up();
  await onScreen(page);
  await page.locator('[data-back]').tap();
  await expect(page.locator('[data-zoom]')).toHaveCount(0);

  await openAndBack(page, async () => {
    await page.locator('header .logbtn').tap();
    await expect(page.locator('.app')).toHaveClass(/logopen/);
  }, '.app.logopen');

  await openAndBack(page, async () => {
    await page.locator('[data-player="1"] .boardtoggle').tap();
    await expect(page.locator('[data-opp-view="1"]')).toBeVisible();
    await expect(page.locator('[data-player="1"]')).toHaveAttribute('data-board', 'open');
  }, '[data-board="open"]');

  await openAndBack(page, async () => {
    await page.locator('header .ghost', { hasText: 'Settings' }).tap();
    await expect(page.locator('.modal h2')).toContainText('Settings');
  }, '.modal');

  await page.setViewportSize({ width: 852, height: 393 });
  await page.waitForFunction(() => document.documentElement.classList.contains('short'));
  await page.locator('.me button[title="View graveyard"]').tap();
  await onScreen(page);
  await shot(page, 'screenshot_back_iphone_landscape_view');
  await page.locator('[data-back]').tap();
  await expect(page.locator('.modal')).toHaveCount(0);
  await expect(page.locator('.player.me')).toBeVisible();
  await shot(page, 'screenshot_back_iphone_landscape_board');
});

test('desktop keeps its close controls and Escape dismisses a view', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: false });
  const page = await ctx.newPage();
  await start(page);
  await expect(page.locator('html')).not.toHaveClass(/compact/);
  const pos = await page.locator('.hand').evaluate(el => getComputedStyle(el).position);
  expect(pos).toBe('absolute');
  await page.locator('.me button[title="View graveyard"]').click();
  await expect(page.locator('.modal h2')).toContainText('Graveyard');
  await expect(page.locator('[data-back]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal')).toHaveCount(0);
  await expect(page.locator('.player.me')).toBeVisible();
  await ctx.close();
});
