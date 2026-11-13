import { expect, test, type Browser, type Page } from '@playwright/test';

const ART = '/opt/cursor/artifacts';
const CMD = 'isperia-supreme-judge';

async function boot(page: Page) {
  await page.addInitScript(() => localStorage.setItem('ca_tips_seen', '1'));
  await page.goto('/?debug&fast');
  await page.locator('[data-deck="isperia"]').click();
  await page.locator('.startbar .big').click();
  await page.locator('.primary', { hasText: 'Keep hand' }).click();
  await page.waitForFunction(() => /End turn|To combat|Main phase/.test(document.body.innerText));
}

async function mainWithMana(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __ca: { act: (f: (g: any) => void) => void } };
    w.__ca.act(g => {
      const me = g.players[0];
      me.pool = ['W', 'W', 'W', 'W', 'U', 'U'];
      g.active = 0; g.step = 'main1'; g.priority = 0; g.awaiting = null; g.passes = 0;
      g.stack = []; g.pending = []; g.decision = null; g.choice = null; g.res = null; g.winner = null;
    });
  });
}

async function castFromButton(page: Page) {
  const btn = page.locator(`[data-cast-cmd="${CMD}"]`);
  await expect(btn).toBeEnabled();
  await expect(btn).toContainText('Cast commander');
  await expect(btn).toContainText('{2}{W}{W}{U}{U}');
  await btn.click();
  await page.waitForFunction(id => {
    const g = (window as unknown as { __ca: { game: () => { players: { battlefield: { id: string }[] }[] } } }).__ca.game();
    return g.players[0].battlefield.some(c => c.id === id);
  }, CMD);
}

async function returnCommander(page: Page) {
  await page.evaluate(id => {
    const w = window as unknown as { __ca: { act: (f: (g: any) => void) => void; checkState: () => void } };
    w.__ca.act(g => {
      const c = g.players[0].battlefield.find((x: { id: string; damage: number }) => x.id === id);
      if (!c) throw new Error('commander is not on the battlefield');
      c.damage = 99;
    });
    w.__ca.checkState();
  }, CMD);
  await page.waitForFunction(id => {
    const g = (window as unknown as { __ca: { game: () => { players: { command: { id: string }[]; casts: Record<string, number> }[] } } }).__ca.game();
    const me = g.players[0];
    return me.command.some(c => c.id === id) && (me.casts[id] ?? 0) >= 1;
  }, CMD);
}

test('foldable command zone casts the commander and shows the new tax', async ({ browser }) => {
  for (const size of [{ width: 1024, height: 720, shot: true }, { width: 852, height: 393, shot: false }]) {
    const page = await open(browser, size);
    await boot(page);
    await expect(page.locator('html')).toHaveClass(/wide/);
    const zone = page.locator('[data-command-zone]');
    await expect(zone).toBeVisible();
    await expect(zone).toContainText('Command zone');
    await expect(page.locator(`[data-cmd="${CMD}"]`)).toBeVisible();
    await expect(page.locator(`[data-cmd="${CMD}"] .tax`)).toContainText('+0');
    await expect(page.locator(`[data-cast-cmd="${CMD}"]`)).toBeDisabled();
    await expect(page.locator(`[data-cast-cmd="${CMD}"]`)).toContainText('Not enough mana');

    if (size.shot) {
      await page.evaluate(() => {
        const w = window as unknown as { __ca: { act: (f: (g: any) => void) => void; CARDS: Record<string, { types: string[] }> } };
        w.__ca.act(g => {
          const me = g.players[0];
          const extra = me.library.find((c: { id: string }) => w.__ca.CARDS[c.id].types.includes('Creature') && !me.commanderIds.includes(c.id));
          me.library.splice(me.library.indexOf(extra), 1);
          me.command.push(extra);
          me.commanderIds.push(extra.id);
        });
      });
      await expect(page.locator('[data-cast-cmd]')).toHaveCount(2);
      await expect(page.locator('.gcmd [data-cmd]')).toHaveCount(2);
      await page.evaluate(() => {
        const w = window as unknown as { __ca: { act: (f: (g: any) => void) => void } };
        w.__ca.act(g => {
          const me = g.players[0];
          const id = me.commanderIds.pop();
          const c = me.command.find((x: { id: string }) => x.id === id);
          me.command = me.command.filter((x: { id: string }) => x !== c);
          me.library.push(c);
        });
      });
      await expect(page.locator('[data-cast-cmd]')).toHaveCount(1);
    }

    await mainWithMana(page);
    if (size.shot) await page.screenshot({ path: `${ART}/screenshot_duo_command_zone.png`, animations: 'disabled' });
    await page.locator(`[data-cmd="${CMD}"]`).click();
    await expect(page.locator('[data-zoom]')).toBeVisible();
    await expect(page.locator('[data-zoom-cast]')).toBeEnabled();
    await page.locator('.zoomx').click();
    await expect(page.locator('[data-zoom]')).toHaveCount(0);

    await castFromButton(page);
    await expect(page.locator(`[data-cmd="${CMD}"]`)).toHaveClass(/away/);
    await expect(page.locator(`[data-cast-cmd="${CMD}"]`)).toBeDisabled();
    await expect(page.locator(`[data-cast-cmd="${CMD}"]`)).toContainText('In play');
    await returnCommander(page);
    await expect(page.locator(`[data-cmd="${CMD}"] .tax`)).toContainText('+2');
    await expect(page.locator(`[data-cast-cmd="${CMD}"]`)).toContainText('{4}{W}{W}{U}{U}');
    await expect(page.locator(`[data-cast-cmd="${CMD}"]`)).toContainText('Not enough mana');
    const box = await page.locator('[data-command-zone]').boundingBox();
    const vp = page.viewportSize()!;
    expect(box && box.y).toBeGreaterThanOrEqual(0);
    expect(box && box.y + box.height).toBeLessThanOrEqual(vp.height + 1);
    if (size.shot) await page.screenshot({ path: `${ART}/screenshot_duo_command_tax.png`, animations: 'disabled' });
    await page.context().close();
  }
});

test('portrait and desktop still cast the commander from the command zone', async ({ browser }) => {
  for (const size of [{ width: 393, height: 852, touch: true }, { width: 1440, height: 900, touch: false }]) {
    const page = await open(browser, size, size.touch);
    await boot(page);
    await expect(page.locator('html')).not.toHaveClass(/wide/);
    await expect(page.locator('[data-cast-cmd]')).toHaveCount(0);
    await mainWithMana(page);
    const zone = page.locator(`.me [data-cmd="${CMD}"]`);
    await zone.scrollIntoViewIfNeeded();
    await expect(zone).toBeVisible();
    await expect(zone).toHaveClass(/playable/);
    await zone.click();
    await page.waitForFunction(id => {
      const g = (window as unknown as { __ca: { game: () => { players: { battlefield: { id: string }[]; stack?: unknown[] }[]; stack: { card?: { id: string } }[] } } }).__ca.game();
      return g.players[0].battlefield.some(c => c.id === id) || g.stack.some(s => s.card?.id === id);
    }, CMD);
    await page.context().close();
  }
});

async function open(browser: Browser, size: { width: number; height: number }, touch = true) {
  const ctx = await browser.newContext({ viewport: size, hasTouch: touch });
  return ctx.newPage();
}
