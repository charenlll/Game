import { expect, test, type Page } from '@playwright/test';

test('重载后从当前序章对白节点继续', async ({ page }) => {
  await page.goto('/?seed=2718');
  await page.getByRole('button', { name: '开始游戏' }).click();
  await advanceToBeat(page, 'beat-0020');
  const savedNode = await page.evaluate(() => JSON.parse(localStorage.getItem('night-ferry.save')!).campaign.chapters.prologue.currentNodeId);
  expect(savedNode).toBe('beat-0020');

  await page.reload();
  await expect(page.locator('.prologue-scene')).toHaveAttribute('data-beat-id', 'beat-0020');
  await expect.poll(() => page.locator('.story-text').textContent()).toContain('什么渡口？');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('night-ferry.save')!).activeSession.screen)).toBe('story');
});

test('重载后完整恢复第二场战斗手牌、回合、随机状态与 Intent 游标', async ({ page }) => {
  await page.goto('/?seed=31415');
  await page.getByRole('button', { name: '开始游戏' }).click();
  await advanceToBeat(page, 'transition-battle1');
  await page.locator('.prologue-scene').click();
  await expect(page.locator('.game')).toBeVisible();
  await page.evaluate(() => (globalThis as any).__nightFerryDebug.finishBattle('won'));
  await expect(page.locator('.reward-screen')).toBeVisible();
  await page.locator('.reward-option').first().click();
  await page.getByRole('button', { name: '收入行囊' }).click();
  await advanceToBeat(page, 'transition-battle2');
  await page.locator('.prologue-scene').click();
  await expect(page.locator('.game')).toBeVisible();
  await expect(page.getByTestId('obsession')).toHaveText('执念 50 / 50');
  await expect(page.locator('.end-button')).toBeEnabled({ timeout: 10000 });
  await page.locator('.end-button').click();
  await expect.poll(() => page.evaluate(() => (globalThis as any).__nightFerryDebug.state().battle.Turn)).toBe(2);

  const beforeReload = await page.evaluate(() => ({
    runtime: (globalThis as any).__nightFerryDebug.state().battle,
    saved: JSON.parse(localStorage.getItem('night-ferry.save')!).activeSession.battle.state,
    cursor: JSON.parse(localStorage.getItem('night-ferry.save')!).activeSession.battle,
  }));
  expect(beforeReload.runtime).toEqual(beforeReload.saved);
  expect(beforeReload.cursor.turnIndex).toBe(2);

  await page.reload();
  await expect(page.locator('.game')).toBeVisible();
  await expect(page.getByTestId('obsession')).toHaveText('执念 50 / 50');
  const afterReload = await page.evaluate(() => (globalThis as any).__nightFerryDebug.state().battle);
  expect(afterReload).toEqual(beforeReload.runtime);
  await expect(page.getByTestId('hand').locator('.card')).toHaveCount(beforeReload.runtime.Hand.length);
  await expect(page.locator('.end-button')).toBeEnabled();
});

test('重载后保留奖励选项与已选卡牌', async ({ page }) => {
  await page.goto('/?seed=1618');
  await page.getByRole('button', { name: '开始游戏' }).click();
  await advanceToBeat(page, 'transition-battle1');
  await page.locator('.prologue-scene').click();
  await expect(page.locator('.game')).toBeVisible();
  await page.evaluate(() => (globalThis as any).__nightFerryDebug.finishBattle('won'));
  await expect(page.locator('.reward-screen')).toBeVisible();
  const offered = await page.locator('.reward-option').evaluateAll(nodes => nodes.map(node => (node as HTMLElement).dataset.card));
  await page.reload();
  await expect(page.locator('.reward-screen')).toBeVisible();
  expect(await page.locator('.reward-option').evaluateAll(nodes => nodes.map(node => (node as HTMLElement).dataset.card))).toEqual(offered);

  await page.locator('.reward-option').first().click();
  const selected = await page.locator('.reward-option.selected').getAttribute('data-card');
  expect(selected).toBeTruthy();
  await page.reload();
  await expect(page.locator('.reward-option.selected')).toHaveAttribute('data-card', selected!);
});

async function advanceToBeat(page: Page, targetID: string): Promise<void> {
  const reached = await page.evaluate(target => {
    for (let index = 0; index < 1800; index++) {
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
