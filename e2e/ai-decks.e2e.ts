import { expect, test, type Page } from '@playwright/test';

const ART = '/opt/cursor/artifacts';
const AVENGERS = 'precon-msc-avengers-assemble';

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${ART}/${name}.png`, animations: 'disabled' });
}

async function ready(page: Page) {
  await page.addInitScript(() => localStorage.setItem('ca_tips_seen', '1'));
  await page.goto('/?debug&fast');
  await page.waitForSelector('[data-ai="1"]');
}

/** AI 1 plays a named precon. AI 2 and AI 3 stay Random. */
async function choose(page: Page) {
  await page.locator('[data-ai="1"]').selectOption(AVENGERS);
  await expect(page.locator('[data-ai="1"]')).toHaveValue(AVENGERS);
  await expect(page.locator('[data-ai="2"]')).toHaveValue('random');
  await expect(page.locator('[data-ai="3"]')).toHaveValue('random');
  for (const sel of ['[data-ai="1"]', '[data-ai="2"]', '[data-ai="3"]']) {
    const box = await page.locator(sel).boundingBox();
    expect(box && box.height).toBeGreaterThanOrEqual(44);
  }
}

async function startIsperia(page: Page) {
  await page.locator('[data-deck="isperia"]').click();
  await page.locator('.startbar .big').click();
  await page.locator('.primary', { hasText: 'Keep hand' }).click();
  await expect(page.locator('[data-player="1"] .pdeck')).toHaveText('Avengers Assemble');
  const names = await page.locator('.player.opp .pdeck').allTextContents();
  expect(names).toHaveLength(3);
  for (const n of names) expect(n.trim().length).toBeGreaterThan(2);
  const log = await page.evaluate(() => (window as unknown as { __ca: { game: () => { log: string[] } } }).__ca.game().log.join('\n'));
  expect(log).toContain('AI 1 is playing Avengers Assemble.');
  expect(log).toMatch(/AI 2 is playing .+\./);
  expect(log).toMatch(/AI 3 is playing .+\./);
}

test('iPhone: each AI is Random or a picked deck', async ({ page }) => {
  await ready(page);
  await choose(page);
  await shot(page, 'screenshot_ai_setup_iphone_portrait');
  await page.setViewportSize({ width: 852, height: 393 });
  await page.waitForFunction(() => document.documentElement.classList.contains('short') && !document.documentElement.classList.contains('portrait'));
  await shot(page, 'screenshot_ai_setup_iphone_landscape');
  await page.setViewportSize({ width: 393, height: 852 });
  await startIsperia(page);
  await shot(page, 'screenshot_ai_game_iphone');
});

test('iPhone: an AI can play a starter deck', async ({ page }) => {
  await ready(page);
  const starter = page.locator('[data-ai="1"] optgroup[label="Starter decks"] option');
  await expect(starter).toHaveCount(4);
  await expect(starter.nth(1)).toHaveText('Rakdos Scourge (BR)');
  await page.locator('[data-ai="1"]').evaluate((el: HTMLSelectElement) => { el.size = 8; });
  await shot(page, 'screenshot_ai_starter_picker_iphone');
  await page.locator('[data-ai="1"]').evaluate((el: HTMLSelectElement) => { el.size = 0; });
  await page.locator('[data-ai="1"]').selectOption('judith');
  await page.locator('[data-deck="isperia"]').click();
  await page.locator('.startbar .big').click();
  await page.locator('.primary', { hasText: 'Keep hand' }).click();
  await expect(page.locator('[data-player="1"] .pdeck')).toHaveText('Rakdos Scourge (BR)');
  const log = await page.evaluate(() => (window as unknown as { __ca: { game: () => { log: string[] } } }).__ca.game().log.join('\n'));
  expect(log).toContain('AI 1 is playing Rakdos Scourge (BR).');
  await shot(page, 'screenshot_ai_starter_game_iphone');
});

test('desktop: each AI is Random or a picked deck', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: false });
  const page = await ctx.newPage();
  await ready(page);
  await expect(page.locator('html')).not.toHaveClass(/compact/);
  await choose(page);
  await page.locator('.aiset').scrollIntoViewIfNeeded();
  await shot(page, 'screenshot_ai_setup_desktop');
  await startIsperia(page);
  await expect(page.locator('aside')).toBeVisible();
  await shot(page, 'screenshot_ai_game_desktop');
  await page.locator('header .ghost', { hasText: 'Quit' }).click();
  await page.locator('[data-ai="2"]').evaluate((el: HTMLSelectElement) => { el.size = 8; });
  await page.locator('.aiset').scrollIntoViewIfNeeded();
  await shot(page, 'screenshot_ai_starter_picker_desktop');
  await page.locator('[data-ai="2"]').evaluate((el: HTMLSelectElement) => { el.size = 0; });
  await page.locator('[data-ai="2"]').selectOption('ruric');
  await page.locator('[data-deck="isperia"]').click();
  await page.locator('.startbar .big').click();
  await page.locator('.primary', { hasText: 'Keep hand' }).click();
  await expect(page.locator('[data-player="2"] .pdeck')).toHaveText('Gruul Unbowed (RG)');
  const log = await page.evaluate(() => (window as unknown as { __ca: { game: () => { log: string[] } } }).__ca.game().log.join('\n'));
  expect(log).toContain('AI 2 is playing Gruul Unbowed (RG).');
  await ctx.close();
});
