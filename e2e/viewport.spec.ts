import { expect, test, type Page } from '@playwright/test';

const landscapeSizes = [
  { width: 1600, height: 900 },
  { width: 1920, height: 1080 },
  { width: 1280, height: 720 },
  { width: 1920, height: 1200 },
  { width: 2560, height: 1080 },
  { width: 932, height: 430 },
  { width: 844, height: 390 },
];

async function stageSnapshot(page: Page) {
  return page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>('.game-stage')!;
    const stageRect = stage.getBoundingClientRect();
    const scale = Number(stage.dataset.scale);
    const normalized = (selector: string) => {
      const rect = document.querySelector(selector)!.getBoundingClientRect();
      return {
        x: (rect.left - stageRect.left) / scale,
        y: (rect.top - stageRect.top) / scale,
        width: rect.width / scale,
        height: rect.height / scale,
      };
    };
    return {
      stage: { left: stageRect.left, top: stageRect.top, width: stageRect.width, height: stageRect.height, scale },
      hud: normalized('.hud'),
      soul: normalized('.soul-target'),
      hand: normalized('.hand-layer'),
      character: normalized('.character'),
    };
  });
}

test('1600x900舞台在全部目标横屏尺寸中等比居中且坐标不漂移', async ({ page }) => {
  let baseline: Awaited<ReturnType<typeof stageSnapshot>> | undefined;
  for (const size of landscapeSizes) {
    await page.setViewportSize(size);
    if (!baseline) await page.goto('/?seed=42');
    const expectedScale = Math.min(size.width / 1600, size.height / 900);
    await expect.poll(() => page.locator('.game-stage').getAttribute('data-scale')).toBe(String(expectedScale));
    await expect.poll(async () => (await page.locator('.game-stage').boundingBox())?.x).toBeCloseTo((size.width - 1600 * expectedScale) / 2, 1);
    const snapshot = await stageSnapshot(page);
    expect(snapshot.stage.scale).toBeCloseTo(expectedScale, 5);
    expect(snapshot.stage.width).toBeCloseTo(1600 * expectedScale, 1);
    expect(snapshot.stage.height).toBeCloseTo(900 * expectedScale, 1);
    expect(snapshot.stage.left).toBeCloseTo((size.width - snapshot.stage.width) / 2, 1);
    expect(snapshot.stage.top).toBeCloseTo((size.height - snapshot.stage.height) / 2, 1);
    baseline ??= snapshot;
    for (const key of ['hud', 'soul', 'hand', 'character'] as const) {
      expect(snapshot[key].x).toBeCloseTo(baseline[key].x, 1);
      expect(snapshot[key].y).toBeCloseTo(baseline[key].y, 1);
      expect(snapshot[key].width).toBeCloseTo(baseline[key].width, 1);
      expect(snapshot[key].height).toBeCloseTo(baseline[key].height, 1);
    }
  }
});

test('窗口尺寸往返不会累计缩放误差', async ({ page }) => {
  await page.setViewportSize({ width: 1980, height: 1020 });
  await page.goto('/?seed=42');
  const before = await stageSnapshot(page);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.setViewportSize({ width: 932, height: 430 });
  await page.setViewportSize({ width: 1980, height: 1020 });
  await expect.poll(() => page.locator('.game-stage').getAttribute('data-scale')).toBe(String(Math.min(1980 / 1600, 1020 / 900)));
  const after = await stageSnapshot(page);
  expect(after).toEqual(before);
});

test('手机横屏缩放后触摸拖牌仍按舞台坐标结算', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 932, height: 430 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.goto('/?seed=42');
  await expect(page.locator('.hand > .card').first()).toBeEnabled();
  const card = page.locator('[data-card="common_001"]').first();
  const box = (await card.boundingBox())!;
  const startX = box.x + box.width / 2;
  const startY = box.y + 10;
  await card.dispatchEvent('pointerdown', { pointerId: 31, pointerType: 'touch', isPrimary: true, button: 0, clientX: startX, clientY: startY });
  await page.locator('#app').dispatchEvent('pointermove', { pointerId: 31, pointerType: 'touch', isPrimary: true, buttons: 1, clientX: 466, clientY: 150 });
  await page.locator('#app').dispatchEvent('pointerup', { pointerId: 31, pointerType: 'touch', isPrimary: true, button: 0, clientX: 466, clientY: 150 });
  await expect(page.getByTestId('light')).toHaveText('2');
  await context.close();
});

test('竖屏只显示全局旋转提示且旋转后状态保留', async ({ page }) => {
  await page.goto('/?seed=42');
  await page.getByRole('button', { name: /结束回合/ }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.viewport-rotate')).toBeVisible();
  await expect(page.locator('.game-stage')).toBeHidden();
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator('.viewport-rotate')).toBeHidden();
  await expect(page.getByTestId('turn')).toHaveText('02');
});

test('奖励卡牌与卡座在全部目标横屏尺寸中保持相同对齐', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/?seed=42');
  await expect(page.locator('.hand > .card').first()).toBeEnabled();
  await page.evaluate(() => (globalThis as any).__nightFerryDebug.finishBattle('won'));
  await expect(page.locator('.reward-screen')).toBeVisible();
  for (const size of landscapeSizes) {
    await page.setViewportSize(size);
    const expectedScale = Math.min(size.width / 1600, size.height / 900);
    await expect.poll(() => page.locator('.game-stage').getAttribute('data-scale')).toBe(String(expectedScale));
    const alignments = await page.locator('.reward-option').evaluateAll(options => options.map(option => {
      const optionRect = option.getBoundingClientRect();
      const cardRect = option.querySelector('.reward-card')!.getBoundingClientRect();
      const scale = Number(document.querySelector<HTMLElement>('.game-stage')!.dataset.scale);
      return {
        centerDelta: Math.abs((cardRect.left + cardRect.width / 2) - (optionRect.left + optionRect.width / 2)) / scale,
        bottomInset: (optionRect.bottom - cardRect.bottom) / scale,
      };
    }));
    for (const alignment of alignments) {
      expect(alignment.centerDelta).toBeLessThan(1);
      expect(alignment.bottomInset).toBeCloseTo(78, 1);
    }
  }
});
