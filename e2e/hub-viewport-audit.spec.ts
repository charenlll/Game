import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';

const reviewSizes = [
  { width: 1600, height: 800 },
  { width: 1600, height: 900 },
  { width: 1920, height: 1080 },
  { width: 1280, height: 720 },
  { width: 1920, height: 1200 },
  { width: 2560, height: 1080 },
  { width: 932, height: 430 },
];

async function enterHub(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('night-ferry.prologue.v1', JSON.stringify({
    prologue_complete: true,
    wooden_boat_trace_unlocked: true,
  })));
  await page.setViewportSize({ width: 1600, height: 800 });
  await page.goto('/?seed=42');
  await page.locator('.menu-start-button').click();
  await expect(page.locator('.hub-screen')).toBeVisible();
}

async function waitForHubCanvas(page: Page, size: { width: number; height: number }): Promise<void> {
  await page.waitForFunction(({ width, height }) => {
    const safe = document.querySelector('.hub-safe-viewport')?.getBoundingClientRect();
    if (!safe) return false;
    const scale = Math.min(width / 1600, height / 800);
    return Math.abs(safe.left - (width - 1600 * scale) / 2) < 1
      && Math.abs(safe.top - (height - 800 * scale) / 2) < 1
      && Math.abs(safe.width - 1600 * scale) < 1
      && Math.abs(safe.height - 800 * scale) < 1;
  }, size);
}

async function expectVisibleInsideViewport(locator: Locator, width: number, height: number, tolerance = 3): Promise<void> {
  const rect = await locator.boundingBox();
  expect(rect, `Expected ${locator} to have a rendered box`).not.toBeNull();
  expect(rect!.x, `${locator} left`).toBeGreaterThanOrEqual(-tolerance);
  expect(rect!.y, `${locator} top`).toBeGreaterThanOrEqual(-tolerance);
  expect(rect!.x + rect!.width, `${locator} right`).toBeLessThanOrEqual(width + tolerance);
  expect(rect!.y + rect!.height, `${locator} bottom`).toBeLessThanOrEqual(height + tolerance);
}

async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images, image => image.decode().catch(() => undefined)));
    const panel = document.querySelector<HTMLElement>('[data-hb19-panel]');
    if (panel) {
      const source = getComputedStyle(panel, '::before').borderImageSource;
      const url = source.match(/url\(["']?(.*?)["']?\)/)?.[1];
      if (url) {
        const image = new Image();
        image.src = url;
        await image.decode();
      }
    }
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  await page.waitForTimeout(40);
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`) });
}

test('驿站页面与弹窗在不同横屏视口内完整显示，遮罩覆盖整个屏幕', async ({ page }, testInfo) => {
  await enterHub(page);

  for (const [index, size] of reviewSizes.entries()) {
    await page.setViewportSize(size);
    await waitForHubCanvas(page, size);

    for (const selector of [
      '.hub-resources', '.hub-settings', '.hub-shelf-area', '.hub-character',
      '.hub-character img', '.hub-primary-action', '.hub-secondary-actions', '.hub-current-ferryman',
    ]) await expectVisibleInsideViewport(page.locator(selector), size.width, size.height);
    for (const button of await page.locator('.hub-secondary-actions .hub-asset-button').all()) await expectVisibleInsideViewport(button, size.width, size.height);
    await expect(page.locator('.hub-home .hub-title')).toHaveCount(0);

    if (index === 0) await capture(page, testInfo, 'hub-home-1600x800');

    await page.locator('.hub-settings').click();
    await expect(page.getByRole('dialog', { name: '设置' })).toBeVisible();
    await expectVisibleInsideViewport(page.locator('.hub-popup-viewport-backdrop'), size.width, size.height);
    await expectVisibleInsideViewport(page.locator('.hub-settings-panel'), size.width, size.height);
    const settingsBackdrop = await page.locator('.hub-popup-viewport-backdrop').boundingBox();
    const safeGeometry = await page.evaluate(() => {
      const safe = document.querySelector('.hub-safe-viewport')!.getBoundingClientRect();
      const overlay = document.querySelector('.hub-popup-safe-surface')!.getBoundingClientRect();
      return { safe: { x: safe.x, y: safe.y, width: safe.width, height: safe.height }, overlay: { x: overlay.x, y: overlay.y, width: overlay.width, height: overlay.height } };
    });
    expect(safeGeometry.overlay.x).toBeCloseTo(safeGeometry.safe.x, 0);
    expect(safeGeometry.overlay.y).toBeCloseTo(safeGeometry.safe.y, 0);
    expect(safeGeometry.overlay.width).toBeCloseTo(safeGeometry.safe.width, 0);
    expect(safeGeometry.overlay.height).toBeCloseTo(safeGeometry.safe.height, 0);
    expect(settingsBackdrop!.x).toBeCloseTo(0, 0);
    expect(settingsBackdrop!.y).toBeCloseTo(0, 0);
    expect(settingsBackdrop!.width).toBeCloseTo(size.width, 0);
    expect(settingsBackdrop!.height).toBeCloseTo(size.height, 0);
    if (index === 0 || index === reviewSizes.length - 1) await capture(page, testInfo, `hub-settings-${size.width}x${size.height}`);
    if (index === reviewSizes.length - 1) await page.locator('.hub-popup-viewport-backdrop').click({ position: { x: 4, y: 4 } });
    else await page.locator('.hub-settings-close').click();
    await expect(page.getByRole('dialog', { name: '设置' })).toHaveCount(0);

    await page.locator('.hub-current-ferryman').click();
    await expect(page.getByRole('dialog', { name: '摆渡人' })).toBeVisible();
    await expectVisibleInsideViewport(page.locator('.hub-popup-viewport-backdrop'), size.width, size.height);
    await expectVisibleInsideViewport(page.locator('.ferryman-drawer'), size.width, size.height);
    for (const row of await page.locator('.ferryman-drawer .hub-ferryman-card').all()) await expectVisibleInsideViewport(row, size.width, size.height);
    if (index === 0 || index === reviewSizes.length - 1) await capture(page, testInfo, `hub-ferryman-drawer-${size.width}x${size.height}`);
    if (index === reviewSizes.length - 1) await page.locator('.hub-popup-viewport-backdrop').click({ position: { x: 4, y: 4 } });
    else await page.locator('.ferryman-drawer-close').click();
    await expect(page.getByRole('dialog', { name: '摆渡人' })).toHaveCount(0);

    await page.getByRole('button', { name: '信物录' }).click();
    if (index === 0 || index === reviewSizes.length - 1) await capture(page, testInfo, `hub-collection-${size.width}x${size.height}`);
    await page.locator('.collection-memento').click();
    await expect(page.getByRole('dialog', { name: '信物详情' })).toBeVisible();
    await expectVisibleInsideViewport(page.locator('.hub-popup-viewport-backdrop'), size.width, size.height);
    await expectVisibleInsideViewport(page.locator('.memento-detail-popup'), size.width, size.height);
    if (index === 0 || index === reviewSizes.length - 1) await capture(page, testInfo, `hub-memento-${size.width}x${size.height}`);
    if (size.width > 1600) await page.locator('.hub-popup-viewport-backdrop').click({ position: { x: 4, y: 4 } });
    else await page.locator('.memento-popup-scrim').click({ position: { x: 4, y: 4 } });
    await expect(page.getByRole('dialog', { name: '信物详情' })).toHaveCount(0);

    await page.getByRole('button', { name: '返回' }).click();
    await page.getByRole('button', { name: '渡魂', exact: true }).click();
    for (const entry of await page.locator('.hub-stage-entry').all()) await expectVisibleInsideViewport(entry, size.width, size.height);
    for (const button of await page.locator('.hub-stage-button').all()) await expectVisibleInsideViewport(button, size.width, size.height);
    if (index === 0 || index === reviewSizes.length - 1) await capture(page, testInfo, `hub-stage-select-${size.width}x${size.height}`);
    await page.getByRole('button', { name: '返回' }).click();

    await page.locator('.hub-character').click();
    await expect(page.locator('.growth-screen')).toBeVisible();
    for (const selector of ['.growth-portrait', '.growth-header', '.growth-trait--merchant', '.growth-trait--locked', '.growth-exclusive-cards', '.growth-more-cards', '.growth-node-panel', '.growth-bottom-row']) {
      await expectVisibleInsideViewport(page.locator(selector), size.width, size.height);
    }
    if (index === 0 || index === reviewSizes.length - 1) await capture(page, testInfo, `hub-growth-${size.width}x${size.height}`);
    await page.locator('.growth-card').first().click();
    await expect(page.getByRole('dialog', { name: '狐火' })).toBeVisible();
    await expectVisibleInsideViewport(page.locator('.hub-popup-viewport-backdrop'), size.width, size.height);
    await expectVisibleInsideViewport(page.locator('.card-preview-popup'), size.width, size.height);
    if (index === 0 || index === reviewSizes.length - 1) await capture(page, testInfo, `hub-card-preview-${size.width}x${size.height}`);
    await page.locator('.hub-popup-scrim').click({ position: { x: 30, y: 30 } });
    await page.getByRole('button', { name: '返回' }).click();
    await expect(page.locator('.hub-home')).toBeVisible();
  }
});
