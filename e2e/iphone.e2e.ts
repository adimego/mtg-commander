import { expect, test, type Page } from '@playwright/test';

const ART = '/opt/cursor/artifacts';

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${ART}/${name}.png`, animations: 'disabled' });
}

function ca(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as { __ca: { game: () => any; CARDS: Record<string, { name: string; types: string[] }> } };
    const g = w.__ca.game();
    const name = (c: { id: string }) => w.__ca.CARDS[c.id]?.name ?? c.id;
    const me = g?.players?.[0];
    return {
      started: !!g?.started,
      step: g?.step,
      active: g?.active,
      awaiting: g?.awaiting,
      priority: g?.priority,
      winner: g?.winner,
      landPlayed: !!me?.landPlayed,
      stack: g?.stack?.length ?? 0,
      log: (g?.log ?? []).slice(-6),
      hand: (me?.hand ?? []).map((c: { uid: number; id: string }) => ({ uid: c.uid, name: name(c) })),
      bf: (me?.battlefield ?? []).map((c: { uid: number; id: string; tapped: boolean; sick: boolean; blocking?: number }) => ({ uid: c.uid, name: name(c), tapped: c.tapped, sick: c.sick, blocking: c.blocking })),
      incoming: (g?.players ?? []).flatMap((p: { battlefield: { uid: number; id: string; attacking?: number }[] }) => p.battlefield.filter(c => c.attacking === 0).map(c => ({ uid: c.uid, name: name(c) }))),
    };
  });
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    return Math.max(root.scrollWidth, body.scrollWidth) > Math.max(root.clientWidth, body.clientWidth) + 2;
  });
  expect(overflow).toBe(false);
}

async function settle(page: Page): Promise<boolean> {
  const zoom = page.locator('.zoomov');
  if (await zoom.count() && await zoom.isVisible()) {
    await page.locator('.zoomx').tap();
    return true;
  }
  const modal = page.locator('.modal');
  if (await modal.count() && await modal.first().isVisible()) {
    const got = page.getByRole('button', { name: /Got it/i });
    if (await got.count() && await got.first().isVisible()) { await got.first().tap(); return true; }
    if (await page.locator('.importbox, .mbox:has(h2:text("Settings"))').count()) return false;
    for (const sel of ['[data-ans="no"]', '[data-ans="nokick"]', '[data-ans="nowarp"]', '[data-ans="noteam"]', '[data-ans="normal"]']) {
      const b = page.locator(sel).first();
      if (await b.count() && await b.isVisible() && await b.isEnabled()) { await b.tap(); return true; }
    }
    const pick = page.locator('.modal [data-pick], .modal [data-mode], .modal [data-order]').first();
    if (await pick.count() && await pick.isVisible()) await pick.tap();
    const go = page.locator('.modal [data-ans="confirm"], .modal [data-ans="yes"], .modal [data-ans="cast"], .modal [data-ans]').first();
    if (await go.count() && await go.isVisible() && await go.isEnabled()) { await go.tap(); return true; }
    return false;
  }
  const prompt = (await page.locator('.prompt').innerText().catch(() => '')) || '';
  if (/choose|target/i.test(prompt)) {
    const t = page.locator('.perm.targetable .cimg, .perm.targetable .frame, .player.targetable, .sitem.targetable').first();
    if (await t.count() && await t.isVisible()) { await t.tap(); return true; }
  }
  return false;
}

async function tapUid(page: Page, uid: number) {
  const face = page.locator(`[data-uid="${uid}"] .cimg, [data-uid="${uid}"] .perm > .frame`).first();
  await face.scrollIntoViewIfNeeded();
  await face.tap();
}

test('iPhone touch: deck, commander, land, spell, attack, block', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ca_tips_seen', '1'));
  await page.goto('/?debug&fast');
  await page.waitForSelector('.setup h1');
  const meta = await page.locator('meta[name="viewport"]').getAttribute('content');
  expect(meta).toContain('viewport-fit=cover');
  expect(await page.locator('link[rel="manifest"]').getAttribute('href')).toContain('manifest.webmanifest');
  expect(await page.locator('meta[name="apple-mobile-web-app-capable"]').getAttribute('content')).toBe('yes');
  await expect(page.locator('html')).toHaveClass(/compact/);
  await expect(page.locator('html')).toHaveClass(/portrait/);
  await noHorizontalScroll(page);
  const startBox = await page.locator('.startbar .big').boundingBox();
  expect(startBox && startBox.height).toBeGreaterThanOrEqual(44);
  const deckBox = await page.locator('[data-deck="isperia"]').boundingBox();
  const barBox = await page.locator('.startbar').boundingBox();
  expect(deckBox && barBox && deckBox.y + deckBox.height).toBeLessThanOrEqual(barBox.y + 1);
  await shot(page, 'screenshot_iphone_portrait_home');

  await page.locator('.deckopt.addnew').scrollIntoViewIfNeeded();
  await page.locator('.deckopt.addnew').tap();
  await expect(page.locator('.decktext')).toBeVisible();
  const area = await page.locator('.decktext').boundingBox();
  const vp = page.viewportSize()!;
  expect(area).toBeTruthy();
  expect(area!.x).toBeGreaterThanOrEqual(-1);
  expect(area!.x + area!.width).toBeLessThanOrEqual(vp.width + 2);
  await expect(page.getByRole('button', { name: /Check deck/ })).toBeVisible();
  await page.locator('.importbox .x').tap();
  await expect(page.locator('.importbox')).toHaveCount(0);

  const deck = page.locator('[data-deck="precon-msc-the-fantastic-four"]');
  await deck.scrollIntoViewIfNeeded();
  await deck.tap();
  await page.locator('.startbar .big').tap();
  await expect(page.locator('[data-commander-choice]')).toBeVisible();
  await noHorizontalScroll(page);
  const cmd = page.locator('[data-pick-commander]').first();
  const cmdBox = await cmd.boundingBox();
  expect(cmdBox && cmdBox.width).toBeGreaterThanOrEqual(44);
  expect(cmdBox && cmdBox.height).toBeGreaterThanOrEqual(44);
  await shot(page, 'screenshot_iphone_portrait_commander');
  await cmd.tap();

  await page.waitForSelector('.app');
  await expect(page.locator('.app')).toHaveAttribute('data-compact', '1');
  const cols = await page.locator('.app').evaluate(el => getComputedStyle(el).gridTemplateColumns);
  const tracks = cols.trim().split(/\s+/).map(parseFloat);
  expect(tracks.filter(n => n > 1).length).toBe(1);
  await page.locator('.primary').waitFor();
  const keep = await page.locator('.primary').boundingBox();
  expect(keep && keep.height).toBeGreaterThanOrEqual(44);

  const zone = page.locator('.me [data-cmd]').first();
  await zone.scrollIntoViewIfNeeded();
  const zb = await zone.boundingBox();
  if (!zb) throw new Error('commander zone has no box');
  await page.mouse.move(zb.x + zb.width / 2, zb.y + Math.min(12, zb.height / 2));
  await page.mouse.down();
  await expect(page.locator('[data-zoom]')).toBeVisible();
  await page.mouse.up();
  await page.locator('.zoomx').tap();
  await expect(page.locator('[data-zoom]')).toHaveCount(0);
  await expect(page.locator('.stackview')).toHaveCount(0);

  await page.locator('.primary', { hasText: 'Keep hand' }).tap();
  await page.waitForFunction(() => {
    const btn = document.querySelector('.primary');
    return !!btn && !btn.hasAttribute('disabled') && /To combat|End turn|Main phase/.test(btn.textContent || document.body.innerText);
  });

  await page.evaluate(() => {
    const w = window as unknown as { __ca: { act: (f: (g: any) => void) => void; CARDS: Record<string, { name: string }> } };
    w.__ca.act(g => {
      const me = g.players[0];
      const want = ['Island', 'Sol Ring', 'Lockjaw, Slobbering Teleporter', 'H.E.R.B.I.E., Lovable Robot'];
      const take = (n: string) => {
        const held = me.hand.find((c: { id: string }) => w.__ca.CARDS[c.id].name === n);
        if (held) return held;
        const i = me.library.findIndex((c: { id: string }) => w.__ca.CARDS[c.id].name === n);
        if (i < 0) throw new Error('deck is missing ' + n);
        const [c] = me.library.splice(i, 1);
        return c;
      };
      const kept = want.map(take);
      me.library.push(...me.hand.filter((c: unknown) => !kept.includes(c)));
      me.hand = kept;
    });
  });

  await page.locator('header .ghost', { hasText: 'Settings' }).tap();
  await page.locator('[data-hold]').check();
  await page.locator('.modal .x').tap();

  let stackChecked = false;
  let attacked = false;
  let blocked = false;
  let portraitGame = false;
  const deadline = Date.now() + 90_000;
  let waits = 0;

  while (Date.now() < deadline && !blocked) {
    if (await settle(page)) continue;
    const s = await ca(page);
    if (s.winner !== null && s.winner !== undefined) break;
    const primary = page.locator('.primary');
    const label = ((await primary.textContent()) || '').replace(/\s+/g, ' ').trim();
    const enabled = await primary.isEnabled();
    const handUid = async (n: string) => (await ca(page)).hand.find(c => c.name === n)?.uid;
    const playable = async (uid?: number) => uid !== undefined && await page.locator(`[data-hand="${uid}"]`).evaluate(el => el.classList.contains('playable')).catch(() => false);
    const island = await handUid('Island');
    const sol = await handUid('Sol Ring');
    const lockjaw = await handUid('Lockjaw, Slobbering Teleporter');
    const herbie = await handUid('H.E.R.B.I.E., Lovable Robot');

    if (!s.landPlayed && await playable(island)) { await page.locator(`[data-hand="${island}"]`).tap(); continue; }
    if (await playable(sol)) {
      await page.locator(`[data-hand="${sol}"]`).tap();
      await expect(page.locator('.stackview')).toBeVisible();
      await page.locator('button.stackhead').tap();
      await expect(page.locator('.stackview')).toHaveAttribute('data-stack-open', '0');
      await expect(page.locator('.sitems')).toBeHidden();
      await page.locator('button.stackhead').tap();
      await expect(page.locator('.sitems')).toBeVisible();
      stackChecked = true;
      await page.locator('header .ghost', { hasText: 'Settings' }).tap();
      await page.locator('[data-hold]').uncheck();
      await page.locator('.modal .x').tap();
      continue;
    }
    if (await playable(lockjaw)) { await page.locator(`[data-hand="${lockjaw}"]`).tap(); continue; }
    if (await playable(herbie)) { await page.locator(`[data-hand="${herbie}"]`).tap(); continue; }

    if (!portraitGame && s.bf.some(c => c.name === 'Sol Ring')) {
      await noHorizontalScroll(page);
      const handCard = page.locator('.hand .hcard').first();
      if (await handCard.count()) {
        const hb = await handCard.boundingBox();
        const pb = await page.locator('.primary').boundingBox();
        expect(hb && pb && hb.y + hb.height).toBeLessThanOrEqual(pb.y + 2);
      }
      await shot(page, 'screenshot_iphone_portrait_game');
      portraitGame = true;
    }

    if (s.awaiting === 'attack' && s.active === 0 && !attacked) {
      const lj = s.bf.find(c => c.name.startsWith('Lockjaw') && !c.tapped && !c.sick);
      const hb = s.bf.find(c => c.name.startsWith('H.E.R.B.I.E'));
      if (lj && hb) {
        await tapUid(page, lj.uid);
        await expect(page.locator('.primary')).toContainText(/Attack with/);
        await page.locator('.primary').tap();
        attacked = true;
        continue;
      }
    }

    if (s.awaiting === 'block' && attacked && !blocked && s.incoming.length) {
      const mine = [...s.bf.filter(c => !c.tapped)].sort((a, b) => Number(b.name.startsWith('H.E.R.B.I.E')) - Number(a.name.startsWith('H.E.R.B.I.E')));
      let assigned = false;
      for (const b of mine) {
        if (!(await page.locator(`[data-uid="${b.uid}"]`).isVisible().catch(() => false))) continue;
        await tapUid(page, b.uid);
        for (const a of s.incoming) {
          if (!(await page.locator(`[data-uid="${a.uid}"] .perm`).isVisible().catch(() => false))) continue;
          await tapUid(page, a.uid);
          const now = ((await page.locator('.primary').textContent()) || '');
          if (!/Confirm \d+ block/.test(now)) continue;
          if (now.includes('⚠')) {
            const other = mine.find(x => x.uid !== b.uid);
            if (!other) continue;
            await tapUid(page, other.uid);
            await tapUid(page, a.uid);
          }
          assigned = true;
          break;
        }
        if (assigned) break;
      }
      if (assigned) {
        await page.locator('.primary').tap();
        await page.waitForFunction(() => (window as unknown as { __ca: { game: () => { log: string[] } } }).__ca.game().log.some(l => / blocks /.test(l)));
        blocked = true;
        continue;
      }
    }

    if (enabled && !/Waiting/.test(label)) { waits = 0; await primary.tap(); continue; }
    waits++;
    if (waits === 30) console.log('waiting', JSON.stringify({ label, step: s.step, active: s.active, awaiting: s.awaiting, log: s.log }));
    await page.waitForTimeout(200);
  }
  if (!blocked) console.log('stopped', JSON.stringify(await ca(page)));

  expect(stackChecked).toBe(true);
  expect(attacked).toBe(true);
  expect(blocked).toBe(true);
  expect(portraitGame).toBe(true);

  await page.setViewportSize({ width: 852, height: 393 });
  await page.waitForFunction(() => document.documentElement.classList.contains('compact') && document.documentElement.classList.contains('short') && !document.documentElement.classList.contains('portrait'));
  await noHorizontalScroll(page);
  await shot(page, 'screenshot_iphone_landscape_game');

  await page.setViewportSize({ width: 1000, height: 500 });
  await page.waitForFunction(() => document.documentElement.classList.contains('compact') && document.documentElement.classList.contains('wide') && document.documentElement.classList.contains('short'));
  await noHorizontalScroll(page);
  await shot(page, 'screenshot_iphone_foldable_game');
});

test('desktop layout stays a full table', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: false });
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem('ca_tips_seen', '1'));
  await page.goto('/?debug&fast');
  await page.waitForSelector('[data-deck="isperia"]');
  await expect(page.locator('html')).not.toHaveClass(/compact/);
  await page.locator('[data-deck="isperia"]').click();
  await page.locator('.big', { hasText: 'Start game' }).click();
  await page.locator('.primary', { hasText: 'Keep hand' }).click();
  await page.locator('.hand').waitFor();
  const handPos = await page.locator('.hand').evaluate(el => getComputedStyle(el).position);
  expect(handPos).toBe('absolute');
  await expect(page.locator('aside')).toBeVisible();
  const cols = await page.locator('.app').evaluate(el => getComputedStyle(el).gridTemplateColumns);
  expect(cols.trim().split(/\s+/).length).toBe(2);
  await shot(page, 'screenshot_desktop_game');
  await ctx.close();
});
