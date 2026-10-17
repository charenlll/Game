import { expect, test } from '@playwright/test';
import { manyiAssetManifest } from '../src/data/chapters/manyi-assets';

test('17张正式素材由开发服务返回真实PNG且浏览器可完整解码', async ({ page }) => {
  await page.goto('/?seed=17');
  const decoded = await page.evaluate(async assets => {
    const base = (document.querySelector('.menu-background') as HTMLImageElement).src.split('/assets/')[0] + '/';
    const results = [];
    for (const asset of assets) {
      const response = await fetch(new URL(asset.path, base));
      const bitmap = await createImageBitmap(await response.blob());
      results.push({ path: asset.path, width: bitmap.width, height: bitmap.height });
      bitmap.close();
    }
    return results;
  }, manyiAssetManifest.map(({ path }) => ({ path })));
  expect(decoded).toEqual(manyiAssetManifest.map(({ path, width, height }) => ({ path, width, height })));
});

test('彩色对白仅显示文字，两侧人物按原比例以半身构图入镜', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('night-ferry.prologue.v1', JSON.stringify({ prologue_complete: true, wooden_boat_trace_unlocked: true })));
  await page.goto('/?seed=31');
  await page.getByRole('button', { name: '开始游戏' }).click();
  await page.locator('[data-hub-action="open-stages"]').click();
  await page.locator('[data-hub-action="start-manyi"]').click();
  for (let i = 0; i < 100 && !await page.locator('.manyi-portrait.is-guest').count(); i++) {
    await page.locator('.manyi-scene').click({ position: { x: 800, y: 450 } });
  }
  await expect(page.locator('.manyi-portrait')).toHaveCount(2);
  await expect(page.locator('.manyi-portrait.is-guest')).toHaveAttribute('src', /CH1-01\.png$/);
  await expect(page.locator('.manyi-scene img[src*="placeholder"]')).toHaveCount(0);
  for (const viewport of [{ width: 1912, height: 914 }, { width: 1600, height: 800 }, { width: 1280, height: 720 }, { width: 932, height: 430 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(() => page.locator('.manyi-background').evaluate(image => image.getBoundingClientRect().width)).toBeCloseTo(viewport.width, 0);
    await expect(page.locator('.manyi-dialogue')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(page.locator('.manyi-dialogue')).toHaveCSS('border-top-width', '0px');
    for (const layer of ['.manyi-background', '.manyi-scene-filter']) {
      const bounds = await page.locator(layer).boundingBox();
      expect(bounds!.x).toBeCloseTo(0, 0);
      expect(bounds!.y).toBeCloseTo(0, 0);
      expect(bounds!.width).toBeCloseTo(viewport.width, 0);
      expect(bounds!.height).toBeCloseTo(viewport.height, 0);
    }
    await expect(page.locator('.manyi-scene')).toHaveCSS('overflow', 'visible');
    const portraits = await page.locator('.manyi-portrait').evaluateAll(async images => {
      await Promise.all(images.map(image => (image as HTMLImageElement).decode()));
      const scene = document.querySelector('.manyi-scene')!.getBoundingClientRect();
      return images.map(image => {
        const img = image as HTMLImageElement;
        const r = img.getBoundingClientRect();
        return { headVisible: r.top >= scene.top && r.top < scene.top + scene.height / 4, lowerBodyOutside: r.bottom > scene.bottom + scene.height / 2, ratio: r.width / r.height, sourceRatio: img.naturalWidth / img.naturalHeight };
      });
    });
    for (const portrait of portraits) {
      expect(portrait.headVisible).toBe(true);
      expect(portrait.lowerBodyOutside).toBe(true);
      expect(portrait.ratio).toBeCloseTo(portrait.sourceRatio, 2);
    }
  }
});

test('《满溢》六场主线、可选分支、固定奖励与信物形成完整闭环', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('night-ferry.prologue.v1', JSON.stringify({ prologue_complete: true, wooden_boat_trace_unlocked: true })));
  await page.goto('/?seed=17');
  await page.getByRole('button', { name: '开始游戏' }).click();
  await page.locator('[data-hub-action="open-stages"]').click();
  await page.locator('[data-hub-action="start-manyi"]').click();
  const skipToStop = async (): Promise<void> => {
    await expect(page.locator('[data-testid="manyi-story"]')).toBeVisible();
    await page.locator('[data-manyi-action="skip-open"]').click();
    await page.locator('[data-manyi-action="skip-confirm"]').click();
  };
  const winBattle = async (expectedCard?: string): Promise<void> => {
    await expect(page.locator('.game')).toBeVisible();
    await page.evaluate(() => (window as any).__nightFerryDebug.finishBattle('won'));
    await expect(page.locator('.manyi-reward-screen')).toBeVisible();
    if (expectedCard) {
      await expect(page.locator('.manyi-reward-screen .card-title')).toHaveCount(1);
      await expect(page.locator('.manyi-reward-screen .card-title')).toHaveText(expectedCard);
    } else await page.locator('.manyi-reward-screen .reward-option').first().click();
    await page.locator('[data-manyi-action="reward-claim"]').click();
  };

  await skipToStop();
  await expect(page.locator('.scene-background')).toHaveAttribute('src', /manyi\/SC01\.png$/);
  await expect(page.locator('.soul-unresolved')).toHaveAttribute('src', /EN1-01\.png$/);
  const flags = await page.evaluate(() => JSON.parse(localStorage.getItem('night-ferry.save')!).campaign.chapters.manyi.flags);
  expect(flags.chiying_met).toBe(true);
  await winBattle('周转');
  await skipToStop();
  await expect(page.locator('.scene-background')).toHaveAttribute('src', /manyi\/SC02\.png$/);
  await expect(page.locator('.soul-unresolved')).toHaveAttribute('src', /EN1-02\.png$/);
  await winBattle('清账');
  await skipToStop();
  await expect(page.locator('[data-testid="manyi-choice"]')).toBeVisible();
  await page.locator('[data-manyi-action="choose"][data-option="skip"]').click();
  await skipToStop();
  await expect(page.locator('.scene-background')).toHaveAttribute('src', /manyi\/SC03\.png$/);
  await expect(page.locator('.soul-unresolved')).toHaveAttribute('src', /EN1-03\.png$/);
  await winBattle('借势');
  await skipToStop();
  await page.locator('[data-manyi-action="choose"][data-option="skip"]').click();
  await skipToStop();
  await winBattle();
  await skipToStop();
  await page.locator('[data-manyi-action="choose"][data-option="skip"]').click();
  await skipToStop();
  await winBattle();
  await skipToStop();
  await expect(page.locator('[data-testid="boss-phase"]')).toHaveText('聚财');
  await expect(page.locator('.soul-unresolved')).toHaveAttribute('src', /CH1-01\.png$/);
  for (const [phase, art] of [[2, 'CH1-02'], [3, 'CH1-03']] as const) {
    await expect(page.locator('.hand>.card:not(:disabled)').first()).toBeVisible();
    await page.evaluate(phase => {
      const save = JSON.parse(localStorage.getItem('night-ferry.save')!);
      save.activeSession.battle.state.BossPhase = phase;
      save.activeSession.battle.state.Obsession = phase === 2 ? 30 : 15;
      localStorage.setItem('night-ferry.save', JSON.stringify(save));
    }, phase);
    await page.reload();
    await expect(page.locator('.soul-unresolved')).toHaveAttribute('src', new RegExp(`${art}\\.png$`));
  }
  await expect(page.locator('.soul-released')).toHaveAttribute('src', /CH1-06\.png$/);
  await winBattle();
  await skipToStop();
  await expect(page.locator('[data-testid="manyi-keepsake"]')).toBeVisible();
  await expect(page.locator('.keepsake-art')).toHaveAttribute('src', /PR1-03\.png$/);
  await page.locator('[data-manyi-action="keepsake-claim"]').click();
  await expect(page.locator('.hub-screen')).toBeVisible();
  const save = await page.evaluate(() => JSON.parse(localStorage.getItem('night-ferry.save')!));
  expect(save.campaign.chapters.manyi.status).toBe('complete');
  expect(save.profile.mementoIds).toContain('manyi_return_voucher');
  expect(save.profile.unlockedCardIds).toEqual(expect.arrayContaining(['common_007', 'common_008', 'feichuan_004']));
});

test('三条可选支线均能进入，奖励未领取时刷新仍保持固定选项', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('night-ferry.prologue.v1', JSON.stringify({ prologue_complete: true, wooden_boat_trace_unlocked: true })));
  await page.goto('/?seed=23');
  await page.getByRole('button', { name: '开始游戏' }).click();
  await page.locator('[data-hub-action="open-stages"]').click();
  await page.locator('[data-hub-action="start-manyi"]').click();
  const skip = async (): Promise<void> => {
    await page.locator('[data-manyi-action="skip-open"]').click();
    await page.locator('[data-manyi-action="skip-confirm"]').click();
  };
  const win = async (fixed?: string): Promise<void> => {
    await expect(page.locator('.game')).toBeVisible();
    await page.evaluate(() => (window as any).__nightFerryDebug.finishBattle('won'));
    await expect(page.locator('.manyi-reward-screen')).toBeVisible();
    if (fixed) await expect(page.locator('.manyi-reward-screen .card-title')).toHaveText(fixed);
    else await page.locator('.manyi-reward-screen .reward-option').first().click();
    await page.locator('[data-manyi-action="reward-claim"]').click();
  };
  await skip();
  const beforeClaim = await page.evaluate(() => JSON.parse(localStorage.getItem('night-ferry.save')!));
  await page.reload();
  await expect(page.locator('.game')).toBeVisible();
  const afterReload = await page.evaluate(() => JSON.parse(localStorage.getItem('night-ferry.save')!));
  expect(afterReload.activeSession.battle.state.Hand).toEqual(beforeClaim.activeSession.battle.state.Hand);
  await page.evaluate(() => (window as any).__nightFerryDebug.finishBattle('won'));
  await expect(page.locator('.manyi-reward-screen .card-title')).toHaveText('周转');
  await page.reload();
  await expect(page.locator('.manyi-reward-screen .card-title')).toHaveText('周转');
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem('night-ferry.save')!))).profile.unlockedCardIds).not.toContain('common_007');
  await page.locator('[data-manyi-action="reward-claim"]').click();
  await skip();
  await page.getByRole('button', { name: /结束回合/ }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('night-ferry.save')!).profile.discoveredCardIds.includes('burden_003'))).toBe(true);
  await win('清账');
  for (const expected of ['manyi-optional-a', 'manyi-optional-b', 'manyi-optional-c']) {
    await skip();
    await page.locator('[data-manyi-action="choose"][data-option="enter"]').click();
    await skip();
    expect((await page.evaluate(() => (window as any).__nightFerryDebug.state())).encounterId).toBe(expected);
    await win();
    await skip();
    await win(expected === 'manyi-optional-a' ? '借势' : undefined);
  }
  await skip(); await win();
  await skip();
  await expect(page.locator('[data-testid="manyi-keepsake"]')).toBeVisible();
});

test('牌录可编辑、校验并持久保存每位摆渡人的局外初始牌组', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('night-ferry.prologue.v1', JSON.stringify({ prologue_complete: true, wooden_boat_trace_unlocked: true })));
  await page.goto('/?seed=29');
  await page.getByRole('button', { name: '开始游戏' }).click();
  await page.locator('[data-hub-action="open-card-catalog"]').click();
  await page.locator('[data-hub-action="open-deck-editor"]').click();
  await expect(page.locator('.hub-deck-count')).toContainText('12 / 12');
  await expect(page.locator('.hub-deck-card.is-locked')).toHaveCount(3);
  const faces = await page.locator('.hub-deck-card-face .card-face').evaluateAll(elements => elements.map(face => {
    const card = face.getBoundingClientRect();
    const host = face.closest('.hub-deck-card-face')!.getBoundingClientRect();
    return { dx: card.x - host.x, dy: card.y - host.y, dw: card.width - host.width, dh: card.height - host.height };
  }));
  for (const bounds of faces) for (const delta of Object.values(bounds)) expect(Math.abs(delta)).toBeLessThan(1);
  await page.locator('.hub-home').evaluate(element => element.setAttribute('data-render-identity', 'retained'));
  await page.locator('.hub-deck-grid').evaluate(element => { element.scrollTop = 100; });
  const scrollTop = await page.locator('.hub-deck-grid').evaluate(element => element.scrollTop);
  await page.locator('[data-hub-action="deck-remove"][data-card-id="common_001"]').click();
  await expect(page.locator('.hub-deck-count')).toContainText('11 / 12');
  await expect(page.locator('.hub-home')).toHaveAttribute('data-render-identity', 'retained');
  expect(await page.locator('.hub-deck-grid').evaluate(element => element.scrollTop)).toBeCloseTo(scrollTop, 0);
  await page.locator('[data-hub-action="deck-save"]').click();
  await page.reload();
  await page.getByRole('button', { name: '开始游戏' }).click();
  await page.locator('[data-hub-action="open-card-catalog"]').click();
  await page.locator('[data-hub-action="open-deck-editor"]').click();
  await expect(page.locator('.hub-deck-count')).toContainText('11 / 12');
  await page.locator('[data-hub-action="deck-default"]').click();
  await expect(page.locator('.hub-deck-count')).toContainText('12 / 12');
});

test('章节对白不展示PR1道具占位，章末信物仍由完成流程展示', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('night-ferry.prologue.v1', JSON.stringify({ prologue_complete: true, wooden_boat_trace_unlocked: true })));
  await page.setViewportSize({ width: 1912, height: 914 });
  await page.goto('/?seed=17');
  await page.getByRole('button', { name: '开始游戏' }).click();
  await page.locator('[data-hub-action="open-stages"]').click();
  await page.locator('[data-hub-action="start-manyi"]').click();
  await expect(page.locator('.manyi-story-prop')).toHaveCount(0);
  await expect(page.locator('.manyi-scene img[src*="PR1-"]')).toHaveCount(0);
  await expect(page.locator('.manyi-text')).toBeVisible();
});

test('其他摆渡人不会领取借势，已解锁固定奖励重玩时恢复随机奖励', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('night-ferry.prologue.v1', JSON.stringify({
    prologue_complete: true, wooden_boat_trace_unlocked: true,
    currentFerrymanId: 'moyu', unlockedFerrymen: { feichuan: true, moyu: true },
  })));
  await page.goto('/?seed=37');
  await page.getByRole('button', { name: '开始游戏' }).click();
  const enter = async (): Promise<void> => {
    await page.locator('[data-hub-action="open-stages"]').click();
    await page.locator('[data-hub-action="start-manyi"]').click();
  };
  const skip = async (): Promise<void> => {
    await page.locator('[data-manyi-action="skip-open"]').click();
    await page.locator('[data-manyi-action="skip-confirm"]').click();
  };
  const win = async (): Promise<void> => {
    await expect(page.locator('.game')).toBeVisible();
    await page.evaluate(() => (window as any).__nightFerryDebug.finishBattle('won'));
    await expect(page.locator('.manyi-reward-screen')).toBeVisible();
  };
  await enter();
  for (const card of ['周转', '清账']) {
    await skip(); await win();
    await expect(page.locator('.reward-option .card-title')).toHaveText(card);
    await page.locator('[data-manyi-action="reward-claim"]').click();
  }
  await skip();
  await page.locator('[data-manyi-action="choose"][data-option="skip"]').click();
  await skip(); await win();
  await expect(page.locator('.reward-option')).toHaveCount(3);
  await expect(page.locator('.reward-option [data-card-id="feichuan_004"]')).toHaveCount(0);
  const save = await page.evaluate(() => JSON.parse(localStorage.getItem('night-ferry.save')!));
  expect(save.profile.unlockedCardIds).not.toContain('feichuan_004');
  await page.evaluate(() => (window as any).__nightFerryDebug.returnToMenu());
  await enter(); await skip(); await win();
  await expect(page.locator('.reward-option')).toHaveCount(3);
});
