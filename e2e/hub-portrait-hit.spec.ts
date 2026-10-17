import { expect, test } from '@playwright/test';

test('主界面信物不可点击，立绘仍按 PNG Alpha 命中，信物录内可查看', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('night-ferry.prologue.v1', JSON.stringify({
    prologue_complete: true, wooden_boat_trace_unlocked: true,
  })));
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/?seed=42');
  await page.locator('.menu-start-button').click();
  await page.locator('.hub-portrait-image').evaluate(image => (image as HTMLImageElement).decode());
  const safe = await page.locator('.hub-safe-viewport').boundingBox();
  expect(safe).not.toBeNull();

  await expect(page.locator('.hub-home .hub-memento-display')).toBeVisible();
  await expect(page.locator('.hub-home button.hub-memento-slot')).toHaveCount(0);
  // Derive samples from the current PNG: art updates can change the opaque area.
  const samples = await page.locator('.hub-portrait-image').evaluate(image => {
    const img = image as HTMLImageElement;
    img.style.animation = 'none';
    const r = img.getBoundingClientRect();
    const scale = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight);
    const x0 = r.left + (r.width - img.naturalWidth * scale) / 2;
    const y0 = r.bottom - img.naturalHeight * scale;
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let clear: { x: number; y: number } | undefined;
    let opaque: { x: number; y: number } | undefined;
    for (let y = Math.floor(canvas.height * .12); y < canvas.height * .6; y += 30) {
      for (let x = Math.floor(canvas.width * .12); x < canvas.width * .88; x += 30) {
        const point = { x: x0 + x * scale, y: y0 + y * scale };
        if (document.elementFromPoint(point.x, point.y)?.closest('[data-hub-action]')) continue;
        const alpha = data[(y * canvas.width + x) * 4 + 3]!;
        if (alpha === 0 && !clear) clear = point;
        if (alpha > 240 && !opaque) opaque = point;
      }
    }
    if (!clear || !opaque) throw new Error('当前角色PNG缺少可测的透明或不透明区域');
    return { clear, opaque };
  });
  await page.mouse.move(samples.clear.x, samples.clear.y);
  await expect(page.locator('.hub-character')).not.toHaveClass(/is-opaque-hover/);
  await page.mouse.click(samples.clear.x, samples.clear.y);
  await expect(page.getByRole('dialog', { name: '信物详情' })).toHaveCount(0);

  await page.mouse.move(samples.opaque.x, samples.opaque.y);
  await expect(page.locator('.hub-character')).toHaveClass(/is-opaque-hover/);
  await page.mouse.click(samples.opaque.x, samples.opaque.y);
  await expect(page.locator('.growth-screen')).toBeVisible();
  await page.locator('.growth-back').click();

  await page.getByRole('button', { name: '信物录' }).click();
  await page.locator('.collection-memento').click();
  await expect(page.getByRole('dialog', { name: '信物详情' })).toBeVisible();
});
