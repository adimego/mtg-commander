import { expect, test, type Page } from '@playwright/test';

const ART = '/opt/cursor/artifacts';

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${ART}/${name}.png`, animations: 'disabled' });
}

async function start(page: Page) {
  await page.addInitScript(() => localStorage.setItem('ca_tips_seen', '1'));
  await page.goto('/?debug&fast');
  await page.locator('[data-deck="isperia"]').click();
  await page.locator('.startbar .big').click();
  await page.locator('.primary', { hasText: 'Keep hand' }).click();
  await page.waitForFunction(() => /To combat|End turn|Main phase/.test(document.body.innerText));
  await page.locator('header .ghost', { hasText: 'Settings' }).tap();
  await page.locator('[data-hold]').check();
  await page.locator('.modal .x').tap();
  await expect(page.locator('.modal')).toHaveCount(0);
}

async function stage(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as {
      __ca: { act: (f: (g: any) => void) => void; CARDS: Record<string, { name: string; types: string[]; keywords?: string[]; typeLine?: string; text?: string }> };
      __staged?: Record<string, string | number>;
    };
    w.__ca.act(g => {
      const cards = w.__ca.CARDS;
      const info = (c: { id: string }) => cards[c.id];
      const take = (p: { hand: any[]; library: any[]; graveyard: any[]; exile: any[] }, pred: (c: any) => boolean) => {
        for (const z of ['hand', 'library', 'graveyard', 'exile'] as const) {
          const i = p[z].findIndex(pred);
          if (i >= 0) return p[z].splice(i, 1)[0];
        }
        return null;
      };
      const creature = (c: any) => { const d = info(c); return d.types.includes('Creature') && !d.types.includes('Land') && !(d.keywords ?? []).some(k => /hexproof|shroud/i.test(k)); };
      const land = (c: any) => info(c).types.includes('Land') && !info(c).types.includes('Creature');
      const other = (c: any) => { const t = info(c).types; return !t.includes('Creature') && !t.includes('Land') && !t.includes('Planeswalker'); };
      const aura = (c: any) => /Aura/.test(info(c).typeLine || '') || /enchant creature/i.test(info(c).text || '');
      const prep = (c: any, tapped = false) => { c.tapped = tapped; c.damage = 0; c.sick = false; c.pp = 0; c.pt = 0; return c; };
      const me = g.players[0];
      const a = g.players[1];
      const b = g.players[2];
      const foe = take(a, creature);
      const soil = take(a, land);
      const extra = take(a, other);
      const charm = take(a, c => aura(c) && c !== extra);
      const foe2 = take(b, creature);
      const swords = take(me, (c: any) => c.id === 'swords-to-plowshares');
      const path = take(me, (c: any) => c.id === 'path-to-exile');
      const bounce = take(me, (c: any) => c.id === 'unsummon');
      if (!foe || !soil || !foe2 || !swords || !path || !bounce) throw new Error('could not stage the opponent board');
      prep(foe, true); foe.counters = { '+1/+1': 2 };
      prep(soil); if (extra) prep(extra); if (charm) { prep(charm); charm.attachedTo = foe.uid; }
      prep(foe2);
      a.battlefield.push(foe, soil, ...(extra ? [extra] : []), ...(charm ? [charm] : []));
      b.battlefield.push(foe2);
      me.library.push(...me.hand);
      me.hand = [swords, path, bounce];
      me.pool = ['W', 'W', 'W', 'U', 'U', 'U'];
      a.life = 27;
      a.cmdDamage['0'] = 7;
      w.__staged = {
        name: a.name, life: a.life, deck: a.deckName, commander: cards[a.commanderId].name,
        hand: a.hand.length, library: a.library.length, gy: a.graveyard.length, exile: a.exile.length,
        creature: info(foe).name, creature2: info(foe2).name, land: info(soil).name,
        other: extra ? info(extra).name : '', aura: charm ? info(charm).name : '',
        uid: foe.uid, uid2: foe2.uid,
      };
    });
    return w.__staged!;
  });
}

async function openBoard(page: Page, pid = 1) {
  await page.locator(`[data-player="${pid}"] .boardtoggle`).tap();
  await expect(page.locator(`[data-opp-view="${pid}"]`)).toBeVisible();
}

async function shows(page: Page, sel: string, name: string) {
  const text = await page.locator(sel).evaluate(el => `${el.textContent ?? ''}\n${[...el.querySelectorAll('img')].map(i => i.alt).join('\n')}`);
  expect(text).toContain(name);
}

async function castAt(page: Page, spell: string, uid: number, glowShot?: string) {
  const uidHit = await page.evaluate(name => {
    const w = window as unknown as { __ca: { game: () => { players: { hand: { uid: number; id: string }[] }[] }; CARDS: Record<string, { name: string }> } };
    const c = w.__ca.game().players[0].hand.find(x => w.__ca.CARDS[x.id].name === name);
    return c?.uid ?? null;
  }, spell);
  expect(uidHit).not.toBeNull();
  const el = page.locator(`[data-hand="${uidHit}"]`);
  await el.scrollIntoViewIfNeeded();
  await expect(el).toHaveClass(/playable/);
  await el.tap();
  const target = page.locator(`[data-opp-view] [data-uid="${uid}"] .perm`);
  await expect(target).toHaveClass(/targetable/);
  if (glowShot) await shot(page, glowShot);
  await target.tap();
  await page.waitForFunction(name => (window as unknown as { __ca: { game: () => { log: string[] } } }).__ca.game().log.some(l => l.includes(`casts ${name}`)), spell);
}

async function collapseStack(page: Page) {
  const head = page.locator('button.stackhead');
  if (await head.count() && await head.getAttribute('aria-expanded') === 'true') await head.tap();
}

test('opponent board fills the phone and stays usable on a foldable', async ({ page }) => {
  await start(page);
  const staged = await stage(page);
  await openBoard(page);

  const vp = page.viewportSize()!;
  const view = await page.locator('[data-opp-view]').boundingBox();
  expect(view).toBeTruthy();
  expect(view!.height).toBeGreaterThan(vp.height * 0.45);
  expect(view!.width).toBeGreaterThan(vp.width * 0.85);
  await expect(page.locator('[data-opp-view] .pname')).toContainText(String(staged.name));
  await expect(page.locator('[data-opp-view] .life')).toHaveText(String(staged.life));
  await expect(page.locator('[data-opp-view] .pdeck')).toHaveText(String(staged.deck));
  await expect(page.locator('[data-opp-view] [title="Cards in hand"]')).toContainText(String(staged.hand));
  await expect(page.locator('[data-opp-view] [title="Cards in library"]')).toContainText(String(staged.library));
  await expect(page.locator('[data-opp-view] [title="View graveyard"]')).toContainText(String(staged.gy));
  await expect(page.locator('[data-opp-view] [title="View exile"]')).toContainText(String(staged.exile));
  await expect(page.locator('[data-opp-view] .cdmg')).toContainText('7/21');
  await expect(page.locator('[data-opp-view] [data-cmd]').first()).toBeVisible();
  await shows(page, '[data-opp-view] [data-group="creatures"]', String(staged.creature));
  await shows(page, '[data-opp-view] [data-group="lands"]', String(staged.land));
  await expect(page.locator(`[data-opp-view] [data-uid="${staged.uid}"]`)).toHaveClass(/tapped/);
  await expect(page.locator('[data-opp-view] [data-counter="+1/+1"]')).toBeVisible();
  const card = await page.locator('[data-opp-view] [data-group="creatures"] .slot').first().boundingBox();
  expect(card && card.width).toBeGreaterThanOrEqual(96);
  expect(card && card.height).toBeGreaterThanOrEqual(120);
  const back = await page.locator('[data-back]').boundingBox();
  const prompt = await page.locator('.prompt').boundingBox();
  const bar = await page.locator('.actionbar').boundingBox();
  expect(back && back.y).toBeLessThan(120);
  expect(prompt && bar).toBeTruthy();
  expect(prompt!.y).toBeGreaterThanOrEqual(view!.y + view!.height - 2);
  expect(bar!.y + bar!.height).toBeLessThanOrEqual(vp.height + 1);
  await shot(page, 'screenshot_oppboard_portrait');

  await page.locator('[data-opp-tab="2"]').tap();
  await expect(page.locator('[data-opp-view="2"]')).toBeVisible();
  await shows(page, '[data-opp-view] [data-group="creatures"]', String(staged.creature2));
  await page.locator('[aria-label="Next opponent"]').tap();
  await expect(page.locator('[data-opp-view="3"]')).toBeVisible();
  await page.locator('[data-opp-tab="1"]').tap();
  await expect(page.locator('[data-opp-view="1"]')).toBeVisible();

  const land = page.locator('[data-opp-view] [data-group="lands"] .perm').first();
  await land.tap();
  await expect(page.locator('[data-zoom]')).toBeVisible();
  await page.locator('[data-back]').tap();
  await expect(page.locator('[data-zoom]')).toHaveCount(0);
  await expect(page.locator('[data-opp-view="1"]')).toBeVisible();

  await castAt(page, 'Swords to Plowshares', Number(staged.uid), 'screenshot_oppboard_portrait_target');
  await page.locator('[data-back]').tap();
  await expect(page.locator('[data-opp-view]')).toHaveCount(0);
  await expect(page.locator('.player.me')).toBeVisible();
  await collapseStack(page);

  await page.setViewportSize({ width: 852, height: 393 });
  await page.waitForFunction(() => document.documentElement.classList.contains('wide') && document.documentElement.classList.contains('short'));
  await openBoard(page);
  const wideView = await page.locator('[data-opp-view]').boundingBox();
  const me = await page.locator('.player.me').boundingBox();
  expect(wideView && me).toBeTruthy();
  expect(wideView!.width).toBeGreaterThan(me!.width);
  expect(wideView!.x + wideView!.width).toBeLessThanOrEqual(me!.x + 4);
  await expect(page.locator('.hand')).toBeVisible();
  await expect(page.locator('.actionbar .primary')).toBeVisible();
  await page.locator('[data-opp-tab="2"]').tap();
  await shows(page, '[data-opp-view]', String(staged.creature2));
  await page.locator('[data-opp-tab="1"]').tap();
  await shot(page, 'screenshot_oppboard_landscape');
  await castAt(page, 'Path to Exile', Number(staged.uid));
  await page.locator('[data-back]').tap();
  await expect(page.locator('[data-opp-view]')).toHaveCount(0);
  await collapseStack(page);

  await page.setViewportSize({ width: 1000, height: 500 });
  await page.waitForFunction(() => document.documentElement.classList.contains('wide') && document.documentElement.classList.contains('compact'));
  await openBoard(page);
  const fold = await page.locator('[data-opp-view]').boundingBox();
  const mine = await page.locator('.player.me').boundingBox();
  expect(fold && mine).toBeTruthy();
  expect(fold!.width).toBeGreaterThan(mine!.width * 1.3);
  expect(fold!.height).toBeGreaterThan(350);
  await shot(page, 'screenshot_oppboard_foldable');
  await castAt(page, 'Unsummon', Number(staged.uid));
  await page.locator('[data-back]').tap();
  await expect(page.locator('[data-opp-view]')).toHaveCount(0);
  await expect(page.locator('.player.me')).toBeVisible();
});

test('desktop still shows opponent boards inline', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: false });
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem('ca_tips_seen', '1'));
  await page.goto('/?debug&fast');
  await page.locator('[data-deck="isperia"]').click();
  await page.locator('.big', { hasText: 'Start game' }).click();
  await page.locator('.primary', { hasText: 'Keep hand' }).click();
  await expect(page.locator('html')).not.toHaveClass(/compact/);
  await expect(page.locator('.boardtoggle')).toHaveCount(0);
  await expect(page.locator('[data-opp-view]')).toHaveCount(0);
  await expect(page.locator('.player.opp .bf')).toHaveCount(3);
  expect(await page.locator('.hand').evaluate(el => getComputedStyle(el).position)).toBe('absolute');
  await shot(page, 'screenshot_oppboard_desktop');
  await ctx.close();
});
