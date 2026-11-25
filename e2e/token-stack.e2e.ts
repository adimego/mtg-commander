import { expect, test, type Page } from '@playwright/test';

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const rows = [...document.querySelectorAll('.crow, .nrow, .mine .row, .bf')];
    const doc = Math.max(root.scrollWidth, body.scrollWidth) > Math.max(root.clientWidth, body.clientWidth) + 2;
    const rowOff = rows.some(el => {
      const r = el as HTMLElement;
      return r.scrollWidth > r.clientWidth + 2 && getComputedStyle(r).overflowX === 'visible';
    });
    return doc || rowOff;
  });
  expect(overflow, 'creature row or page should not overflow horizontally off-screen').toBe(false);
}

test('30+ identical tokens stack, stay on screen, and N of the stack can attack', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ca_tips_seen', '1'));
  await page.goto('/?debug&fast');
  await page.waitForSelector('.setup h1');
  const krenko = page.locator('[data-deck="preset-krenko"]');
  if (await krenko.count()) await krenko.click();
  else await page.locator('.deckopt').first().click();
  await page.locator('.startbar .big').click();
  const keep = page.locator('.primary', { hasText: 'Keep hand' });
  if (await keep.count()) await keep.click();
  await page.waitForFunction(() => /End turn|To combat|Main phase/.test(document.body.innerText));

  await page.evaluate(() => {
    const w = window as unknown as { __ca: { act: (f: (g: any) => void) => void; compile: (o: Record<string, unknown>) => string; CARDS: Record<string, { name: string }> } };
    const id = w.__ca.compile({ name: 'Goblin', type_line: 'Token Creature — Goblin', oracle_text: '', power: '1', toughness: '1', colors: ['R'], mana_cost: '', keywords: ['haste'] });
    w.__ca.act(g => {
      const p = g.players[0];
      p.battlefield = p.battlefield.filter((c: { token?: boolean }) => !c.token);
      for (let i = 0; i < 30; i++) {
        p.battlefield.push({
          uid: g.nextUid++, id, owner: 0, token: true, tapped: i >= 21, sick: false, damage: 0, pp: 0, pt: 0, kw: ['haste'],
        });
      }
      g.step = 'attackers';
      g.awaiting = 'attack';
      g.active = 0;
      g.priority = 0;
      g.stack = [];
      g.pending = [];
      g.decision = null;
      g.choice = null;
      g.res = null;
    });
  });

  const stack = page.locator('[data-stack="30"]').first();
  await expect(stack).toBeVisible();
  await expect(page.locator('.stack-badge, .stack-cap').first()).toContainText(/30/);
  const cap = page.locator('.stack-cap').first();
  if (await cap.count()) await expect(cap).toContainText(/21 untapped|Goblin ×30/);
  await noHorizontalOverflow(page);

  const opp = page.locator('[data-player="1"]').first();
  await opp.scrollIntoViewIfNeeded();
  const strike = page.locator('.oppstrike, [data-player="1"] .avatar, [data-player="1"]').first();
  await strike.click();

  await stack.locator('.cimg, .frame, .perm').first().click();
  const picker = page.locator('[data-stack-picker="attack"]');
  await expect(picker).toBeVisible();
  await expect(picker.locator('h3')).toContainText(/Goblin ×30/);
  const range = picker.locator('input[type="range"]');
  await range.fill('7');
  await expect(picker.locator('[data-n]')).toHaveAttribute('data-n', '7');
  await picker.locator('[data-ans="attack"]').click();
  await expect(picker).toHaveCount(0);

  const confirm = page.locator('.primary, .big', { hasText: /Attack with 7/ });
  await expect(confirm).toBeVisible();
  await confirm.click();

  const attacking = await page.evaluate(() => {
    const w = window as unknown as { __ca: { game: () => any } };
    const g = w.__ca.game();
    const mine = g.players[0].battlefield as { token?: boolean; attacking?: number; atkT?: number }[];
    const still = mine.filter(c => c.token && c.attacking !== undefined).length;
    const did = mine.filter(c => c.token && c.atkT === g.turn).length;
    const logHits = (g.log as string[]).filter((l: string) => /Goblin attacks/.test(l)).length;
    return { still, did, logHits, life: g.players[1].life };
  });
  expect(attacking.did === 7 || attacking.logHits === 7 || attacking.still === 7, JSON.stringify(attacking)).toBe(true);
  await noHorizontalOverflow(page);
});
