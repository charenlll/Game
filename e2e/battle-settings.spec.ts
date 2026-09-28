import { expect, test, type Page } from '@playwright/test';

test('战斗设置复用通用按钮，序章返回入口可用并适配窗口尺寸', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/?seed=42');
  await page.locator('.menu-start-button').click();
  await advanceToBeat(page, 'transition-battle1');
  await page.locator('.prologue-scene').click();

  const settings = page.locator('button[data-action="menu"]');
  await expect(settings).toBeVisible();
  await expect(settings.locator('img')).toHaveAttribute('src', /HB10\.png/);
  await expect.poll(() => settings.locator('img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(settings).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(settings).toHaveCSS('border-top-style', 'none');
  await expect(settings).toHaveCSS('width', '66px');
  await expect(settings).toHaveCSS('height', '66px');
  const iconSize = await settings.locator('img').evaluate(image => image.getBoundingClientRect().width);
  expect(iconSize).toBeCloseTo(51, 0);
  await settings.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('#dialog-title')).toHaveText('设置');
  await expect(dialog.locator('.menu-grid')).toHaveCount(0);
  await expect(dialog.locator('.battle-menu-actions .primary-button')).toHaveCount(2);
  await expect(dialog.locator('[data-action="restart"]')).toBeEnabled();
  const returnButton = dialog.locator('[data-action="return-menu"]');
  await expect(returnButton).toBeEnabled();

  for (const size of [
    { width: 1600, height: 800 },
    { width: 1600, height: 900 },
    { width: 1920, height: 1080 },
    { width: 1280, height: 720 },
    { width: 2560, height: 1080 },
    { width: 932, height: 430 },
  ]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(25);
    const bounds = await page.evaluate(() => {
      const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!.getBoundingClientRect();
      const buttons = [...document.querySelectorAll<HTMLElement>('.battle-menu-actions button')].map(button => button.getBoundingClientRect());
      const settings = document.querySelector<HTMLElement>('.settings-icon-button')!.getBoundingClientRect();
      return { dialog: [dialog.left, dialog.top, dialog.right, dialog.bottom], buttons: buttons.map(box => [box.left, box.top, box.right, box.bottom]), settings: [settings.left, settings.top, settings.right, settings.bottom] };
    });
    expect(bounds.dialog[0]).toBeGreaterThanOrEqual(0);
    expect(bounds.dialog[1]).toBeGreaterThanOrEqual(0);
    expect(bounds.dialog[2]).toBeLessThanOrEqual(size.width);
    expect(bounds.dialog[3]).toBeLessThanOrEqual(size.height);
    for (const [left, top, right, bottom] of bounds.buttons) {
      expect(left).toBeGreaterThanOrEqual(bounds.dialog[0]);
      expect(top).toBeGreaterThanOrEqual(bounds.dialog[1]);
      expect(right).toBeLessThanOrEqual(bounds.dialog[2]);
      expect(bottom).toBeLessThanOrEqual(bounds.dialog[3]);
    }
    expect(bounds.settings[0]).toBeGreaterThanOrEqual(0);
    expect(bounds.settings[1]).toBeGreaterThanOrEqual(0);
    expect(bounds.settings[2]).toBeLessThanOrEqual(size.width);
    expect(bounds.settings[3]).toBeLessThanOrEqual(size.height);
  }

  await dialog.locator('[data-action="restart"]').click();
  await expect(page.locator('.modal-backdrop')).toHaveCount(0);
  await expect(page.getByTestId('turn')).toHaveText('01');
});

test('序章对局中的 F12 控制台入口可返回开始游戏菜单', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/?seed=42');
  await page.locator('.menu-start-button').click();
  await advanceToBeat(page, 'transition-battle1');
  await page.locator('.prologue-scene').click();

  await page.evaluate(() => {
    (globalThis as typeof globalThis & { __nightFerryDebug?: { returnToMenu(): void } }).__nightFerryDebug?.returnToMenu();
  });
  await expect(page.locator('.main-menu-screen')).toBeVisible();
  await expect(page.locator('.menu-start-button')).toBeVisible();
  await expect(page.locator('.hub-screen')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.main-menu-screen')).toBeVisible();
  await expect(page.locator('.game')).toHaveCount(0);
});

test('从驿站选择渡魂重玩序章，重载后仍返回驿站', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('night-ferry.prologue.v1', JSON.stringify({
      prologue_complete: true,
      wooden_boat_trace_unlocked: true,
      currentFerrymanId: 'feichuan',
      unlockedFerrymen: { feichuan: true },
      copper: 0,
      soulFlame: 0,
    }));
  });
  await page.goto('/?seed=42');
  await page.locator('.menu-start-button').click();
  await page.getByRole('button', { name: '渡魂', exact: true }).click();
  await page.getByRole('button', { name: '再次渡魂' }).click();
  await advanceToBeat(page, 'transition-battle1');
  await page.locator('.prologue-scene').click();
  await expect(page.locator('.game')).toBeVisible();

  const save = await page.evaluate(() => JSON.parse(localStorage.getItem('night-ferry.save')!));
  expect(save.activeSession.entrySource).toBe('hub');
  expect(save.campaign.chapters.prologue.status).toBe('complete');

  await page.reload();
  await expect(page.locator('.game')).toBeVisible();
  await page.locator('button[data-action="menu"]').click();
  await page.locator('[role="dialog"] [data-action="return-menu"]').click();
  await expect(page.locator('.hub-screen')).toBeVisible();
  await expect(page.locator('.main-menu-screen')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.hub-screen')).toBeVisible();
  await expect(page.locator('.game')).toHaveCount(0);
});

test('序章完成后的战斗可以从设置返回驿站主页', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('night-ferry.prologue.v1', JSON.stringify({
      prologue_complete: true,
      wooden_boat_trace_unlocked: true,
      currentFerrymanId: 'feichuan',
      unlockedFerrymen: { feichuan: true },
      copper: 0,
      soulFlame: 0,
    }));
  });
  await page.goto('/?seed=42&test-run=1');
  await page.locator('button[data-action="menu"]').click();
  const returnButton = page.locator('[role="dialog"] [data-action="return-menu"]');
  await expect(returnButton).toBeEnabled();
  await returnButton.click();
  await expect(page.locator('.hub-screen')).toBeVisible();
  await expect(page.locator('.game')).toHaveCount(0);
  await page.goto('/?seed=42');
  await expect(page.locator('.hub-screen')).toBeVisible();
  await expect(page.locator('.game')).toHaveCount(0);
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
  expect(reached).toBe(true);
}
