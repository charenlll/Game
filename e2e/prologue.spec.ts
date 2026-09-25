import { expect, test, type Page } from '@playwright/test';

test('序章开场使用全屏纯黑底，旁白逐字显示，点击可完成当前句', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/?seed=42');
  await page.evaluate(() => document.querySelector<HTMLButtonElement>('.menu-start-button')!.click());
  const viewport = page.locator('.game-viewport');
  const scene = page.locator('.prologue-scene');
  await expect(scene).toHaveAttribute('data-beat-id', 'beat-0001');
  await expect(viewport).toHaveClass(/prologue-story-black/);
  await expect(page.locator('.story-child, .story-feichuan, .prologue-obsession')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector('.game-viewport')!, '::before').backgroundColor)).toBe('rgb(0, 0, 0)');
  for (const size of [{ width: 1280, height: 720 }, { width: 932, height: 430 }]) {
    await page.setViewportSize(size);
    const coverage = await page.evaluate(() => {
      const viewport = document.querySelector<HTMLElement>('.game-viewport')!;
      const rect = viewport.getBoundingClientRect();
      const veil = getComputedStyle(viewport, '::before');
      return { rect: [rect.left, rect.top, rect.width, rect.height], opacity: veil.opacity, color: veil.backgroundColor };
    });
    expect(coverage).toEqual({ rect: [0, 0, size.width, size.height], opacity: '1', color: 'rgb(0, 0, 0)' });
  }

  const result = await page.evaluate(() => {
    const fire = (): void => document.querySelector<HTMLElement>('.prologue-scene')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    for (let index = 0; index < 2 && document.querySelector('.prologue-scene')?.getAttribute('data-beat-id') === 'beat-0001'; index++) fire();
    fire();
    return { beat: document.querySelector('.prologue-scene')?.getAttribute('data-beat-id'), text: document.querySelector('.story-text')?.textContent };
  });
  expect(result).toEqual({ beat: 'beat-0002', text: '一下一下，推着什么东西轻轻碰上岸边。' });
});

test('第一战背景和数值正确，第二战能恢复可操作手牌并使用 BA09', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/?seed=42');
  await page.getByRole('button', { name: '开始游戏' }).click();
  await advanceToBeat(page, 'transition-battle1');
  await page.locator('.prologue-scene').click();
  await expect(page.locator('.game')).toBeVisible();
  await expect(page.locator('.scene-background')).toHaveAttribute('src', /BA08\.png/);
  await expect(page.getByTestId('obsession')).toHaveText('执念 40 / 40');

  await page.evaluate(() => (globalThis as any).__nightFerryDebug.finishBattle('won'));
  await expect(page.locator('.reward-screen')).toBeVisible({ timeout: 15000 });
  await page.locator('.reward-option').first().click();
  await page.getByRole('button', { name: '收入行囊' }).click();
  await advanceToBeat(page, 'transition-battle2');
  await page.locator('.prologue-scene').click();
  await expect(page.locator('.game')).toBeVisible();
  await expect(page.locator('.scene-background')).toHaveAttribute('src', /BA09\.png/);
  await expect(page.getByTestId('obsession')).toHaveText('执念 50 / 50');

  const hand = page.getByTestId('hand');
  const playable = hand.locator('.card:not(.unavailable):not(:disabled)').first();
  await expect(playable).toBeVisible({ timeout: 5000 });
  const beforePlayed = await page.evaluate(() => (globalThis as any).__nightFerryDebug.state().battle.Stats.CardsPlayed);
  const box = await playable.boundingBox();
  if (!box) throw new Error('第二战的可用手牌没有布局位置');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(800, 400, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => (globalThis as any).__nightFerryDebug.state().battle.Stats.CardsPlayed)).toBeGreaterThan(beforePlayed);
});

test('完成整章后先展示黑屏信物，点击获取才保存并进入驿站', async ({ page }) => {
  await page.goto('/?seed=42');
  await page.getByRole('button', { name: '开始游戏' }).click();
  await advanceToBeat(page, 'transition-battle1');
  await page.locator('.prologue-scene').click();
  await page.evaluate(() => (globalThis as any).__nightFerryDebug.finishBattle('won'));
  await expect(page.locator('.reward-screen')).toBeVisible();
  await page.locator('.reward-option').first().click();
  await page.getByRole('button', { name: '收入行囊' }).click();

  await advanceToBeat(page, 'transition-battle2');
  await page.locator('.prologue-scene').click();
  await page.evaluate(() => (globalThis as any).__nightFerryDebug.finishBattle('won'));
  await expect(page.locator('.prologue-scene')).toHaveAttribute('data-beat-id', 'beat-0327');
  await expect(page.locator('.story-text')).toContainText('孩子抱着船坐回岸边');
  await advanceToBeat(page, 'transition-finalBattle');
  await page.locator('.prologue-scene').click();
  await page.evaluate(() => (globalThis as any).__nightFerryDebug.finishBattle('won'));
  await advanceToBeat(page, 'beat-0618');
  await expect(page.locator('.story-release-light')).toHaveCount(0);
  await advanceToBeat(page, 'chapter-end');
  await page.locator('.prologue-scene').click();
  if (await page.locator('.prologue-scene').count()) await page.locator('.prologue-scene').click();
  await expect(page.getByTestId('prologue-keepsake')).toBeVisible();
  await expect(page.getByRole('button', { name: '获取信物' })).toBeVisible();
  await expect(page.locator('.game-viewport')).toHaveClass(/prologue-story-black/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('night-ferry.save')!).campaign.chapters.prologue.status)).not.toBe('complete');

  await page.getByRole('button', { name: '获取信物' }).click();
  await expect(page.locator('.hub-screen')).toBeVisible();
  await expect(page.locator('.hub-memento-slot')).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('night-ferry.save')!));
  expect(saved.campaign.chapters.prologue.status).toBe('complete');
  expect(saved.profile.mementoIds).toContain('prologue_wooden_boat');
  expect(saved.appliedGrantIds).toContain('prologue_complete');
  expect(saved.activeSession).toBeNull();
});

test('连续剧情可通过右上角按钮确认跳过并进入下一场战斗', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/?seed=42');
  await page.locator('.menu-start-button').click();
  await expect(page.locator('.story-skip-trigger')).toBeVisible();
  await page.locator('.story-skip-trigger').click();
  await expect(page.locator('.skip-confirm-dialog')).toBeVisible();
  await page.locator('.skip-confirm-secondary').click();
  await expect(page.locator('.skip-confirm-dialog')).toHaveCount(0);
  await page.locator('.story-skip-trigger').click();
  await page.locator('.skip-confirm-primary').click();
  await expect(page.locator('.game')).toBeVisible();
  await expect(page.locator('.scene-background')).toHaveAttribute('src', /BA08\.png/);
  await expect(page.getByTestId('obsession')).toHaveText('执念 40 / 40');
  const flags = await page.evaluate(() => (globalThis as any).__nightFerryDebug.state().story.storyFlags);
  expect(flags.met_child).toBe(true);
});

test('第二战执念归零后不依赖卡牌动画即可进入后续剧情', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/?seed=42');
  await page.locator('.menu-start-button').click();
  await advanceToBeat(page, 'transition-battle1');
  await page.locator('.prologue-scene').click();
  await page.evaluate(() => (globalThis as any).__nightFerryDebug.finishBattle('won'));
  await expect(page.locator('.reward-screen')).toBeVisible();
  await page.locator('.reward-option').first().click();
  await page.locator('.run-primary').click();
  await advanceToBeat(page, 'transition-battle2');
  await page.locator('.prologue-scene').click();
  await expect(page.locator('.game')).toBeVisible();
  await expect(page.locator('.game-viewport')).not.toHaveClass(/prologue-story-black/);
  await expect.poll(() => page.evaluate(() => {
    const image = document.querySelector<HTMLImageElement>('.viewport-background');
    return { src: image?.getAttribute('src'), loaded: !!image?.naturalWidth };
  })).toMatchObject({ src: /BA09\.png/, loaded: true });
  await expect(page.getByTestId('hand').locator('.card').first()).toBeVisible();
  await expect(page.locator('.end-button')).toBeEnabled();
  await page.evaluate(() => {
    const state = (globalThis as any).__nightFerryDebug.state().battle;
    state.Obsession = 4;
    state.Light = 10;
    state.Phase = 'PLAYER_TURN';
    state.Hand[0].DefinitionID = 'common_001';
    state.Hand[0].CostModifiers = [];
    const card = document.querySelector<HTMLButtonElement>('.card[data-id]')!;
    card.disabled = false;
    card.removeAttribute('disabled');
  });
  const card = page.getByTestId('hand').locator('.card[data-id]').first();
  const box = await card.boundingBox();
  if (!box) throw new Error('胜利回归测试未能定位手牌');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(800, 400, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.soul-target')).toHaveClass(/releasing/);
  await expect(page.locator('.soul-unresolved')).toHaveCSS('animation-name', 'soul-dissolve-out');
  await expect(page.locator('.soul-released')).toHaveCSS('animation-name', 'soul-reform-in');
  await expect(page.locator('.modal-backdrop')).toHaveCount(0);
  await expect(page.locator('.prologue-scene')).toHaveAttribute('data-beat-id', 'beat-0327');
  await expect(page.locator('.story-text')).toContainText('孩子抱着船坐回岸边');
});

async function advanceToBeat(page: Page, targetID: string): Promise<void> {
  const reached = await page.evaluate(target => {
    for (let index = 0; index < 1600; index++) {
      const scene = document.querySelector<HTMLElement>('.prologue-scene');
      if (!scene) return false;
      const current = scene.dataset.beatId;
      if (current === target) return true;
      scene.click();
      const next = document.querySelector<HTMLElement>('.prologue-scene');
      if (next?.dataset.beatId === current) next.click();
    }
    return false;
  }, targetID);
  expect(reached, `推进序章时未到达节点 ${targetID}`).toBe(true);
}
