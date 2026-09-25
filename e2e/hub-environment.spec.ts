import { expect, test, type TestInfo } from '@playwright/test';

test('驿站环境层按背景cover覆盖完整视口，并在页面离开、返回时正确暂停复用', async ({ page }, testInfo: TestInfo) => {
  await page.addInitScript(() => localStorage.setItem('night-ferry.prologue.v1', JSON.stringify({
    prologue_complete: true,
    wooden_boat_trace_unlocked: true,
  })));
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/?seed=42');
  await page.locator('.menu-start-button').click();
  await expect(page.locator('.hub-environment-canvas')).toHaveCount(1);
  await page.waitForTimeout(250);

  for (const size of [
    { width: 1600, height: 800 },
    { width: 1600, height: 900 },
    { width: 1920, height: 1080 },
    { width: 1280, height: 720 },
    { width: 1920, height: 1200 },
    { width: 2560, height: 1080 },
    { width: 932, height: 430 },
  ]) {
    await page.setViewportSize(size);
    await page.waitForFunction(({ width, height }) => {
      const safe = document.querySelector('.hub-safe-viewport')?.getBoundingClientRect();
      if (!safe) return false;
      const scale = Math.min(width / 1600, height / 800);
      return Math.abs(safe.left - (width - 1600 * scale) / 2) < 1
        && Math.abs(safe.top - (height - 800 * scale) / 2) < 1
        && Math.abs(safe.width - 1600 * scale) < 1
        && Math.abs(safe.height - 800 * scale) < 1;
    }, size);
    const alignment = await page.evaluate(() => {
      const viewport = document.querySelector('.game-viewport')!.getBoundingClientRect();
      const layer = document.querySelector('.hub-environment-layer')!.getBoundingClientRect();
      const canvas = document.querySelector('.hub-environment-canvas')!.getBoundingClientRect();
      const style = getComputedStyle(document.querySelector('.hub-environment-canvas')!);
      return {
        viewport: { x: viewport.x, y: viewport.y, width: viewport.width, height: viewport.height },
        layer: { x: layer.x, y: layer.y, width: layer.width, height: layer.height },
        canvas: { x: canvas.x, y: canvas.y, width: canvas.width, height: canvas.height },
        pointerEvents: style.pointerEvents,
      };
    });
    expect(alignment.layer.x).toBeCloseTo(alignment.viewport.x, 0);
    expect(alignment.layer.y).toBeCloseTo(alignment.viewport.y, 0);
    expect(alignment.layer.width).toBeCloseTo(alignment.viewport.width, 0);
    expect(alignment.layer.height).toBeCloseTo(alignment.viewport.height, 0);
    expect(alignment.canvas.x).toBeCloseTo(alignment.viewport.x, 0);
    expect(alignment.canvas.y).toBeCloseTo(alignment.viewport.y, 0);
    expect(alignment.canvas.width).toBeCloseTo(alignment.viewport.width, 0);
    expect(alignment.canvas.height).toBeCloseTo(alignment.viewport.height, 0);
    expect(alignment.pointerEvents).toBe('none');

    if ((size.width === 1600 && (size.height === 800 || size.height === 900)) || (size.width === 932 && size.height === 430)) {
      await expect.poll(() => page.locator('.hub-environment-canvas').evaluate(canvas => {
        const element = canvas as HTMLCanvasElement;
        const pixels = element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data;
        for (let index = 3; index < pixels.length; index += 4) if (pixels[index]! > 0) return true;
        return false;
      }), { timeout: 10000 }).toBe(true);
      await page.evaluate(async () => {
        await Promise.all(Array.from(document.images, image => image.decode().catch(() => undefined)));
        await document.fonts.ready;
      });
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await page.screenshot({ path: testInfo.outputPath(`hub-environment-${size.width}x${size.height}.png`) });
    }
  }

  const fogResponse = await page.request.get('/assets/hub/effects/HBFX05_ground_fog.png');
  expect(fogResponse.ok()).toBe(true);
  const fogDimensions = await page.evaluate(async () => {
    const image = new Image();
    image.src = '/assets/hub/effects/HBFX05_ground_fog.png';
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  });
  expect(fogDimensions).toEqual({ width: 1983, height: 793 });

  await expect(page.locator('.hub-environment-canvas')).toHaveCount(1);
  await page.locator('.hub-settings').click();
  await expect(page.locator('.hub-environment-canvas')).toHaveCount(1);
  await page.locator('.hub-settings-close').click();
  await page.getByRole('button', { name: '信物录' }).click();
  await expect(page.locator('.hub-environment-canvas')).toHaveCount(0);
  await page.getByRole('button', { name: '返回' }).click();
  await expect(page.locator('.hub-environment-canvas')).toHaveCount(1);
  await page.locator('.hub-character').click();
  await expect(page.locator('.hub-environment-canvas')).toHaveCount(0);
  await page.getByRole('button', { name: '返回' }).click();
  await expect(page.locator('.hub-environment-canvas')).toHaveCount(1);
});
