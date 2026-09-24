import { expect, test } from '@playwright/test';

test('普通启动先显示主菜单并加载 BA06 与 LG01', async ({ page }) => {
  await page.goto('/?seed=42');
  await expect(page.locator('.main-menu-screen')).toBeVisible();
  await expect(page.getByRole('button', { name: '开始游戏' })).toBeVisible();
  await expect(page.getByRole('button', { name: '设置' })).toBeVisible();
  await expect(page.locator('.menu-version')).toHaveText('Version 0.1.0');
  await expect.poll(() => page.locator('.menu-logo img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect.poll(() => page.locator('.viewport-background').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  expect(await page.locator('.viewport-background').getAttribute('src')).toContain('assets/backgrounds/menu/main_menu_background.png');
  expect(await page.locator('.menu-logo img').getAttribute('src')).toContain('assets/ui/menu/game_logo.png');
});

test('Logo素材无法加载时显示文字标题占位', async ({ page }) => {
  await page.route('**/assets/ui/menu/game_logo.png', route => route.abort());
  await page.goto('/?seed=42');
  await expect(page.locator('.menu-logo img')).toBeHidden();
  await expect(page.locator('.menu-logo h1')).toBeVisible();
  await expect(page.locator('.menu-logo h1')).toHaveText('夜渡');
});

test('主菜单在标准、低分辨率、宽屏和矮屏中保持舞台布局', async ({ page }) => {
  for (const size of [{ width: 1600, height: 900 }, { width: 1920, height: 1080 }, { width: 1280, height: 720 }, { width: 2560, height: 1080 }, { width: 932, height: 430 }]) {
    await page.setViewportSize(size);
    if (!await page.locator('.main-menu-screen').count()) await page.goto('/?seed=42');
    const layout = await page.evaluate(() => {
      const stage = document.querySelector<HTMLElement>('.game-stage')!;
      const scale = Number(stage.dataset.scale);
      const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      const stageRect = stage.getBoundingClientRect();
      const logical = (r: DOMRect) => ({ x: (r.left - stageRect.left) / scale, y: (r.top - stageRect.top) / scale, width: r.width / scale, height: r.height / scale });
      return { logo: logical(rect('.menu-logo')), start: logical(rect('.menu-start-button')), settings: logical(rect('.menu-secondary')), version: logical(rect('.menu-version')) };
    });
    expect(layout.logo.x + layout.logo.width / 2).toBeCloseTo(800, 0);
    expect(layout.start.x + layout.start.width / 2).toBeCloseTo(800, 0);
    expect(layout.settings.x + layout.settings.width / 2).toBeCloseTo(800, 0);
    expect(layout.version.y + layout.version.height).toBeCloseTo(876, 0);
  }
});

test('设置显示最小占位并可返回，开始游戏进入序章', async ({ page }) => {
  await page.goto('/?seed=42');
  await page.getByRole('button', { name: '设置' }).click();
  await expect(page.getByRole('dialog')).toContainText('设置功能将在后续版本开放');
  await page.getByRole('button', { name: '返回' }).click();
  await expect(page.locator('.main-menu-screen')).toBeVisible();
  await page.getByRole('button', { name: '开始游戏' }).click();
  await expect(page.locator('.prologue-scene')).toHaveAttribute('data-beat-id', 'beat-0001');
  await expect(page.getByTestId('story-dialogue')).toContainText('水声很近。');
});

test('重新载入从主菜单干净启动且设置状态不会残留', async ({ page }) => {
  await page.goto('/?seed=42');
  await page.getByRole('button', { name: '设置' }).click();
  await page.reload();
  await expect(page.locator('.main-menu-screen')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
