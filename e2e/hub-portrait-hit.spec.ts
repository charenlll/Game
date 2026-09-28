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
  await page.mouse.move(safe!.x + 1000, safe!.y + 290);
  await expect(page.locator('.hub-character')).not.toHaveClass(/is-opaque-hover/);
  await page.mouse.click(safe!.x + 1000, safe!.y + 290);
  await expect(page.getByRole('dialog', { name: '信物详情' })).toHaveCount(0);

  await page.mouse.move(safe!.x + 1150, safe!.y + 380);
  await expect(page.locator('.hub-character')).toHaveClass(/is-opaque-hover/);
  await page.mouse.click(safe!.x + 1150, safe!.y + 380);
  await expect(page.locator('.growth-screen')).toBeVisible();
  await page.locator('.growth-back').click();

  await page.getByRole('button', { name: '信物录' }).click();
  await page.locator('.collection-memento').click();
  await expect(page.getByRole('dialog', { name: '信物详情' })).toBeVisible();
});
