import { expect, test, type Page } from '@playwright/test';

const ART = '/opt/cursor/artifacts';

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${ART}/${name}.png`, animations: 'disabled' });
}

async function noPageScroll(page: Page) {
  const ok = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const table = document.querySelector('.table') as HTMLElement | null;
    const doc = Math.max(root.scrollHeight, body.scrollHeight) <= window.innerHeight + 1;
    const zone = !table || table.scrollHeight <= table.clientHeight + 2;
    return doc && zone;
  });
  expect(ok).toBe(true);
}

async function boot(page: Page) {
  await page.addInitScript(() => localStorage.setItem('ca_tips_seen', '1'));
  await page.goto('/?debug&fast');
  await page.locator('[data-deck="isperia"]').click();
  await page.locator('.startbar .big').click();
  await page.locator('.primary', { hasText: 'Keep hand' }).click();
  await page.waitForFunction(() => /End turn|To combat|Main phase/.test(document.body.innerText));
}

async function stageBoard(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as { __ca: { act: (f: (g: any) => void) => void; CARDS: Record<string, { name: string; types: string[]; keywords?: string[] }> } };
    let mine: number[] = [];
    let foes: number[] = [];
    w.__ca.act(g => {
      const take = (p: any, n: number, attack = false) => {
        const out: number[] = [];
        for (let i = p.library.length - 1; i >= 0 && out.length < n; i--) {
          const c = p.library[i];
          const d = w.__ca.CARDS[c.id];
          const kw = d.keywords ?? [];
          if (!d.types.includes('Creature') || d.types.includes('Land')) continue;
          if (kw.includes('defender') || kw.includes('flying') || kw.includes('menace')) continue;
          p.library.splice(i, 1);
          c.tapped = false; c.sick = false; c.damage = 0; c.pp = 0; c.pt = 0; c.kw = ['haste'];
          p.battlefield.push(c);
          out.push(c.uid);
        }
        const lands = p.library.filter((c: { id: string }) => w.__ca.CARDS[c.id].types.includes('Land')).slice(0, 4);
        for (const c of lands) {
          p.library.splice(p.library.indexOf(c), 1);
          c.tapped = false; c.sick = false;
          p.battlefield.push(c);
        }
        if (attack) out.forEach(uid => { const c = p.battlefield.find((x: { uid: number }) => x.uid === uid); c.attacking = 0; c.blockedBy = []; });
        return out;
      };
      mine = take(g.players[0], 6);
      foes = take(g.players[1], 5, true);
      take(g.players[2], 3);
      take(g.players[3], 2);
      g.players[1].life = 32;
      g.players[1].cmdDamage['0'] = 4;
    });
    return { mine, foes };
  });
}

async function stageAttack(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __ca: { act: (f: (g: any) => void) => void } };
    w.__ca.act(g => {
      g.active = 0; g.step = 'attackers'; g.awaiting = 'attack'; g.priority = 0; g.passes = 0;
      g.stack = []; g.pending = []; g.decision = null; g.choice = null; g.winner = null;
      for (const c of g.players[0].battlefield) { c.sick = false; c.tapped = false; delete c.attacking; }
    });
  });
  await expect(page.locator('[data-combat="attack"]')).toBeVisible();
}

test('foldable duo: boards fit, and combat taps assign attackers and blockers', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 500 });
  await boot(page);
  await expect(page.locator('html')).toHaveClass(/wide/);
  const staged = await stageBoard(page);
  expect(staged.mine.length).toBeGreaterThanOrEqual(5);
  expect(staged.foes.length).toBeGreaterThanOrEqual(5);
  await expect(page.locator('[data-glance="0"] [data-group="creatures"] .gtile')).toHaveCount(staged.mine.length);
  await expect(page.locator('[data-glance="1"]')).toContainText('32');
  await expect(page.locator('[data-glance="1"] .glance-dmg')).toContainText('4');
  await expect(page.locator('[data-glance="1"] [data-group="lands"]')).toContainText('×');
  await noPageScroll(page);
  await shot(page, 'screenshot_duo_board');

  await stageAttack(page);
  const attackers = staged.mine.slice(0, 5);
  for (let i = 0; i < attackers.length; i++) {
    const defId = i < 3 ? 1 : 2;
    await page.locator(`.combatrow[data-uid="${attackers[i]}"] [data-defender="${defId}"]`).click();
  }
  await expect(page.locator('.combatbar [data-defender="1"]')).toContainText(/\d+/);
  await shot(page, 'screenshot_duo_attackers');
  await page.locator('.primary').click();
  await page.waitForFunction(() => {
    const log = (window as unknown as { __ca: { game: () => { log: string[] } } }).__ca.game().log.join('\n');
    return /attacks AI 1/.test(log) && /attacks AI 2/.test(log);
  });

  await page.evaluate(foes => {
    const w = window as unknown as { __ca: { act: (f: (g: any) => void) => void } };
    w.__ca.act(g => {
      g.active = 1; g.step = 'blockers'; g.awaiting = 'block'; g.blockersDone = []; g.priority = null;
      g.stack = []; g.pending = []; g.decision = null; g.choice = null;
      for (const uid of foes as number[]) {
        const c = g.players[1].battlefield.find((x: { uid: number }) => x.uid === uid);
        if (c) { c.attacking = 0; c.blockedBy = []; c.tapped = true; }
      }
      for (const c of g.players[0].battlefield) { if (c.kw?.includes('haste')) { c.tapped = false; delete c.attacking; delete c.blocking; } }
    });
  }, staged.foes);
  await expect(page.locator('[data-combat="block"]')).toBeVisible();
  const blockers = staged.mine.slice(0, 3);
  const incoming = staged.foes.slice(0, 2);
  await page.locator(`[data-blocker="${blockers[0]}"]`).click();
  await page.locator(`[data-assign="${incoming[0]}"]`).click();
  await page.locator(`[data-blocker="${blockers[1]}"]`).click();
  await page.locator(`[data-assign="${incoming[0]}"]`).click();
  await page.locator(`[data-blocker="${blockers[2]}"]`).click();
  await page.locator(`[data-assign="${incoming[1]}"]`).click();
  await expect(page.locator('[data-combat="block"] [data-assigned]')).toHaveCount(3);
  await shot(page, 'screenshot_duo_blockers');
  await page.locator('.primary').click();
  await page.waitForFunction(() => (window as unknown as { __ca: { game: () => { log: string[] } } }).__ca.game().log.some(l => / blocks /.test(l)));
  await noPageScroll(page);

  await page.setViewportSize({ width: 852, height: 393 });
  await page.waitForFunction(() => document.documentElement.classList.contains('wide') && document.documentElement.classList.contains('short'));
  await noPageScroll(page);
  await shot(page, 'screenshot_duo_landscape');
});

test('desktop layout is unchanged', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: false });
  const page = await ctx.newPage();
  await boot(page);
  await expect(page.locator('html')).not.toHaveClass(/compact/);
  await expect(page.locator('[data-wide]')).toHaveAttribute('data-wide', '0');
  await expect(page.locator('.player.opp .bf')).toHaveCount(3);
  await expect(page.locator('[data-combat]')).toHaveCount(0);
  await expect(page.locator('.hand')).toHaveCSS('position', 'absolute');
  await shot(page, 'screenshot_duo_desktop');
  await ctx.close();
});
