import { expect, test } from '@playwright/test';

test('已完成序章的开始入口进入驿站，信物架与入口布局居中', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('night-ferry.prologue.v1', JSON.stringify({
    prologue_complete: true,
    wooden_boat_trace_unlocked: true,
  })));
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/?seed=42');
  await expect(page.locator('.main-menu-screen .ferry-trace-layer')).toHaveCount(0);
  await page.getByRole('button', { name: '开始游戏' }).click();
  await expect(page.locator('.hub-screen')).toBeVisible();
  await expect(page.locator('.hub-home .hub-title')).toHaveCount(0);
  await expect(page.locator('.hub-primary-action .hub-button-content')).toHaveText('渡魂');
  await expect(page.locator('.hub-memento-slot')).toBeVisible();
  await expect(page.locator('.hub-background')).toHaveAttribute('src', /HB01\.png/);
  await expect(page.locator('.hub-resources')).toContainText('0');
  const missingHubImages = await page.locator('.hub-screen img').evaluateAll(async images => {
    await Promise.all(images.map(image => (image as HTMLImageElement).decode().catch(() => undefined)));
    return images.filter(image => !(image as HTMLImageElement).naturalWidth).map(image => (image as HTMLImageElement).src);
  });
  expect(missingHubImages).toEqual([]);
  const homeAlignment = await page.evaluate(() => {
    const safe = document.querySelector('.hub-safe-viewport')!.getBoundingClientRect();
    const center = (selector: string) => { const r = document.querySelector(selector)!.getBoundingClientRect(); return r.x + r.width / 2 - safe.x; };
    const hero = document.querySelector('.hub-character img')!;
    const ferrymanSwitch = document.querySelector('.hub-current-ferryman')!.getBoundingClientRect();
    const primaryArt = document.querySelector('.hub-primary-action .hub-button-art')!.getBoundingClientRect();
    const heroFrame = document.querySelector('.hub-character')!.getBoundingClientRect();
    return { primary: center('.hub-primary-action'), secondary: center('.hub-secondary-actions'), primaryArt: { x: primaryArt.x - safe.x, y: primaryArt.y - safe.y, bottom: primaryArt.bottom - safe.y }, heroCenter: heroFrame.x + heroFrame.width / 2 - safe.x, heroWidth: parseFloat(getComputedStyle(hero).width), settingsWidth: document.querySelector('.hub-settings')!.getBoundingClientRect().width, ferrymanSwitch: { x: ferrymanSwitch.x - safe.x, y: ferrymanSwitch.y - safe.y, width: ferrymanSwitch.width, bottom: ferrymanSwitch.bottom - safe.y } };
  });
  expect(homeAlignment.primary).toBeCloseTo(210, 0);
  const primaryArt = await page.locator('.hub-primary-action .hub-button-art').evaluate(image => ({ fit: getComputedStyle(image).objectFit, width: image.getBoundingClientRect().width, height: image.getBoundingClientRect().height }));
  expect(primaryArt.fit).toBe('contain');
  expect(primaryArt.width).toBeCloseTo(210, 0);
  expect(primaryArt.height).toBeCloseTo(210, 0);
  expect(homeAlignment.primaryArt.y + 105).toBeCloseTo(290, 0);
  const viewportBackgroundFit = await page.locator('.viewport-background').evaluate(image => ({ fit: getComputedStyle(image).objectFit, transform: getComputedStyle(image).transform }));
  expect(viewportBackgroundFit.fit).toBe('cover');
  expect(viewportBackgroundFit.transform).toBe('none');
  expect(homeAlignment.secondary).toBeCloseTo(210, 0);
  const secondaryButtons = await page.locator('.hub-secondary-actions .hub-asset-button').evaluateAll(buttons => buttons.map(button => {
    const rect = button.getBoundingClientRect();
    const label = button.querySelector('.hub-button-content')!;
    const style = getComputedStyle(label);
    return { x: rect.x + rect.width / 2, y: rect.y, width: rect.width, height: rect.height, fontSize: style.fontSize, fontFamily: style.fontFamily, fontWeight: style.fontWeight, letterSpacing: style.letterSpacing, labelTransform: style.transform };
  }));
  expect(secondaryButtons).toHaveLength(3);
  expect(secondaryButtons.every(button => Math.abs(button.width - 190.4) < 0.1)).toBe(true);
  expect(secondaryButtons.every(button => Math.abs(button.height - 90) < 0.1)).toBe(true);
  expect(secondaryButtons.every(button => Math.abs(button.x - 210) < 0.1)).toBe(true);
  expect(secondaryButtons[1]!.y).toBeGreaterThan(secondaryButtons[0]!.y);
  expect(secondaryButtons[2]!.y - secondaryButtons[1]!.y).toBeCloseTo(secondaryButtons[1]!.y - secondaryButtons[0]!.y, 0);
  expect(secondaryButtons[0]!.y).toBeGreaterThan(homeAlignment.primaryArt.bottom);
  expect(secondaryButtons.every(button => Math.abs(parseFloat(button.fontSize) - 19) < 0.1)).toBe(true);
  expect(secondaryButtons.every(button => button.fontFamily.includes('Songti SC'))).toBe(true);
  expect(secondaryButtons.every(button => button.fontWeight === '600')).toBe(true);
  expect(secondaryButtons.every(button => button.letterSpacing === '4px')).toBe(true);
  expect(secondaryButtons.every(button => button.labelTransform === 'none')).toBe(true);
  const secondaryDefault = await page.locator('.hub-secondary-actions .hub-asset-button').first().evaluate(button => {
    const rect = button.getBoundingClientRect(); return { x: rect.x, width: rect.width, height: rect.height };
  });
  await page.locator('.hub-secondary-actions .hub-asset-button').first().hover();
  await page.waitForTimeout(220);
  const secondaryHover = await page.locator('.hub-secondary-actions .hub-asset-button').first().evaluate(button => {
    const rect = button.getBoundingClientRect(); return { x: rect.x, width: rect.width, height: rect.height };
  });
  expect(secondaryHover.x - secondaryDefault.x).toBeCloseTo(9, 0);
  expect(secondaryHover.width).toBeCloseTo(secondaryDefault.width, 0);
  expect(secondaryHover.height).toBeCloseTo(secondaryDefault.height, 0);
  await page.mouse.move(800, 780);
  expect(homeAlignment.heroWidth).toBeCloseTo(602, 0);
  expect(homeAlignment.settingsWidth).toBeCloseTo(92, 0);
  expect(homeAlignment.heroCenter).toBeCloseTo(homeAlignment.ferrymanSwitch.x + homeAlignment.ferrymanSwitch.width / 2, 0);
  expect(homeAlignment.ferrymanSwitch.x).toBeCloseTo(1148.8, 0);
  expect(homeAlignment.ferrymanSwitch.y).toBeCloseTo(664, 0);
  expect(homeAlignment.ferrymanSwitch.width).toBeCloseTo(302.4, 0);
  expect(homeAlignment.ferrymanSwitch.bottom).toBeCloseTo(785, 0);
  await expect(page.locator('.hub-current-ferryman .ferryman-card-frame')).toHaveAttribute('src', /ferryman_card|HB11/i);
  const bannerAvatar = await page.locator('.hub-current-ferryman .ferryman-avatar').evaluate(image => {
    const element = image as HTMLImageElement;
    const rect = element.getBoundingClientRect();
    return { naturalWidth: element.naturalWidth, naturalHeight: element.naturalHeight, width: rect.width, height: rect.height, fit: getComputedStyle(element).objectFit };
  });
  expect(bannerAvatar.naturalWidth).toBe(1254);
  expect(bannerAvatar.naturalHeight).toBe(1254);
  expect(bannerAvatar.width).toBeCloseTo(bannerAvatar.height, 0);
  expect(bannerAvatar.fit).toBe('cover');
  await expect(page.locator('.hub-character img')).toHaveCSS('animation-name', 'hub-ferryman-idle');
  await expect(page.locator('.hub-primary-action .hub-button-art')).toHaveAttribute('src', /ferry_primary_button\.png/);
  const primaryDefault = await page.locator('.hub-primary-action').evaluate(button => {
    const rect = button.getBoundingClientRect(); return { width: rect.width, height: rect.height };
  });
  await page.locator('.hub-primary-action').hover();
  await expect(page.locator('.hub-primary-action')).toHaveCSS('transform', 'none');
  const primaryHover = await page.locator('.hub-primary-action').evaluate(button => {
    const rect = button.getBoundingClientRect(); return { width: rect.width, height: rect.height };
  });
  expect(primaryHover).toEqual(primaryDefault);
  await page.mouse.move(800, 780);

  const homeShelfCenter = await page.locator('.hub-home .hub-shelf-area').evaluate(node => { const rect = node.getBoundingClientRect(); const safe = document.querySelector('.hub-safe-viewport')!.getBoundingClientRect(); return rect.x + rect.width / 2 - safe.x; });
  expect(homeShelfCenter).toBeCloseTo(800, 0);
  await expect(page.locator('.hub-home-focus-layer')).toHaveCount(1);
  await expect(page.locator('.hub-shelf')).toHaveCSS('filter', 'brightness(1.05) contrast(1.04)');

  await page.getByRole('button', { name: '信物录' }).click();
  await expect(page.locator('.collection-memento')).toBeVisible();
  await expect(page.locator('.hub-category-title,.hub-empty-category')).toHaveCount(0);
  await page.locator('.collection-memento').click();
  await expect(page.getByRole('dialog', { name: '信物详情' })).toContainText('一艘做得不算精致的小木船');
  await expect(page.getByRole('dialog', { name: '信物详情' }).locator('h2')).toHaveCount(0);
  const mementoTextAlignment = await page.locator('.memento-info').evaluate(info => {
    const panel = document.querySelector('.memento-detail-popup')!.getBoundingClientRect();
    const content = info.getBoundingClientRect();
    return { panelCenter: panel.top + panel.height / 2, contentCenter: content.top + content.height / 2 };
  });
  expect(mementoTextAlignment.contentCenter).toBeCloseTo(mementoTextAlignment.panelCenter, 0);
  await expect(page.locator('.memento-popup-close')).toHaveCount(0);
  await page.locator('.memento-popup-scrim').click({ position: { x: 20, y: 20 } });
  await expect(page.getByRole('dialog', { name: '信物详情' })).toHaveCount(0);

  await expect(page.locator('.hub-page-title')).toHaveCount(0);
  await page.getByRole('button', { name: '下一类' }).click();
  await expect(page.locator('.collection-memento')).toHaveCount(0);
  await expect(page.locator('.hub-category-title,.hub-empty-category')).toHaveCount(0);
  await page.locator('.hub-page-arrow.previous').click();
  await expect(page.locator('.collection-memento')).toBeVisible();

  await page.getByRole('button', { name: '返回' }).click();
  await page.getByRole('button', { name: '渡魂', exact: true }).click();
  await expect(page.locator('.hub-stage-entry')).toHaveCount(2);
  await expect(page.locator('.hub-page-title')).toHaveCount(0);
  const chapterPanel = await page.locator('.hub-stage-entry').first().evaluate(node => {
    const frame = getComputedStyle(node, '::before');
    return { image: frame.borderImageSource, slice: frame.borderImageSlice, width: frame.borderImageWidth };
  });
  expect(chapterPanel.image).toMatch(/info_panel_9slice\.png/);
  expect(chapterPanel.slice).toBe('190 fill');
  expect(chapterPanel.width).toBe('24px');
  const stageGeometry = await page.locator('.hub-stage-entry').first().evaluate(node => {
    const rect = node.getBoundingClientRect(); const safe = document.querySelector('.hub-safe-viewport')!.getBoundingClientRect();
    const action = node.querySelector('.hub-stage-button')!.getBoundingClientRect();
    return { x: rect.x - safe.x, y: rect.y - safe.y, width: rect.width, height: rect.height, actionX: action.x - rect.x, actionY: action.y - rect.y, actionWidth: action.width, actionHeight: action.height };
  });
  expect(stageGeometry.x).toBeCloseTo(340, 0);
  expect(stageGeometry.y).toBeCloseTo(155, 0);
  expect(stageGeometry.width).toBeCloseTo(920, 0);
  expect(stageGeometry.height).toBeCloseTo(184, 0);
  expect(stageGeometry.actionX).toBeCloseTo(663.1, 0);
  expect(stageGeometry.actionY).toBeCloseTo(59.8, 0);
  expect(stageGeometry.actionWidth).toBeCloseTo(184, 0);
  expect(stageGeometry.actionHeight).toBeCloseTo(64.4, 0);
  await expect(page.locator('.hub-stage-button--replay')).toHaveCSS('background-image', /RB01-A\.png/);
  await expect(page.locator('.hub-stage-entry.is-unavailable .hub-stage-button')).toBeDisabled();
  await page.getByRole('button', { name: '再次渡魂' }).click();
  await expect(page.locator('.prologue-scene')).toHaveAttribute('data-beat-id', 'beat-0001');
});

test('摆渡人锁定状态不允许切换，绯川成长页显示既有专属内容并可返回', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 800 });
  await page.addInitScript(() => localStorage.setItem('night-ferry.prologue.v1', JSON.stringify({ prologue_complete: true, wooden_boat_trace_unlocked: true })));
  await page.goto('/?seed=42');
  await page.locator('.menu-start-button').click();
  await expect(page.locator('.hub-screen')).toBeVisible();
  await page.locator('.hub-current-ferryman').click();
  const ferrymanCards = page.locator('.ferryman-drawer .hub-ferryman-card');
  await expect(ferrymanCards).toHaveCount(3);
  await expect(page.locator('.ferryman-card-status')).toHaveCount(0);
  await expect(page.locator('.hub-ferryman-card.is-locked .ferryman-lock')).toHaveCount(2);
  await page.locator('.ferryman-drawer .ferryman-avatar').evaluateAll(images => Promise.all(images.map(image => (image as HTMLImageElement).decode())));
  const avatarAssets = await page.locator('.ferryman-drawer .ferryman-avatar').evaluateAll(images => images.map(image => ({ src: (image as HTMLImageElement).getAttribute('src'), loaded: (image as HTMLImageElement).naturalWidth > 0 })));
  expect(avatarAssets.map(avatar => avatar.src)).toEqual(expect.arrayContaining(['/assets/characters/AV01.png', '/assets/characters/AV02.png', '/assets/characters/AV03.png']));
  expect(avatarAssets.every(avatar => avatar.loaded)).toBe(true);
  const drawerAvatarGeometry = await page.locator('.ferryman-drawer .ferryman-avatar').evaluateAll(images => images.map(image => {
    const element = image as HTMLImageElement;
    const rect = element.getBoundingClientRect();
    return { naturalWidth: element.naturalWidth, naturalHeight: element.naturalHeight, width: rect.width, height: rect.height };
  }));
  expect(drawerAvatarGeometry.every(avatar => avatar.naturalWidth === 1254 && avatar.naturalHeight === 1254)).toBe(true);
  expect(drawerAvatarGeometry.every(avatar => Math.abs(avatar.width - avatar.height) < 1)).toBe(true);
  await page.locator('.ferryman-drawer [data-ferryman="moyu"]').click();
  await expect(page.locator('.hub-toast')).toHaveText('尚未解锁');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('night-ferry.prologue.v1')!).currentFerrymanId ?? 'feichuan')).toBe('feichuan');
  await page.locator('.ferryman-drawer-close').click();

  await page.locator('.hub-character').click();
  await expect(page.locator('.growth-screen')).toBeVisible();
  await expect(page.locator('.growth-screen')).not.toContainText('专属卡牌');
  await expect(page.locator('.growth-info-layout .hub-info-panel')).toHaveCount(3);
  await expect(page.locator('.growth-header')).toContainText('绯川');
  await expect(page.locator('.growth-header')).toContainText('赤狐 · 摆渡人');
  await expect(page.locator('.growth-header .hub-resources')).toHaveCount(0);
  await expect(page.locator('.growth-overview')).toHaveCount(0);
  for (const selector of ['.growth-trait-copy', '.growth-node-content']) {
    await expect(page.locator(selector).first()).toHaveCSS('justify-content', 'center');
  }
  await expect(page.locator('.growth-card-content')).toHaveCSS('align-items', 'center');
  const mappedSafeAreas = await page.locator('.growth-info-layout .hub-info-panel').evaluateAll(panels => panels.flatMap(panel => {
    const content = panel.querySelector<HTMLElement>('.growth-safe-content');
    if (!content) return [];
    const panelRect = panel.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    return [{
      x: contentRect.left - panelRect.left,
      y: contentRect.top - panelRect.top,
      expectedX: Number.parseFloat(getComputedStyle(panel).getPropertyValue('--hb19-content-x')),
      expectedY: Number.parseFloat(getComputedStyle(panel).getPropertyValue('--hb19-content-y')),
      width: contentRect.width,
      expectedWidth: Number.parseFloat(getComputedStyle(panel).getPropertyValue('--hb19-content-width')),
      height: contentRect.height,
      expectedHeight: Number.parseFloat(getComputedStyle(panel).getPropertyValue('--hb19-content-height')),
    }];
  }));
  expect(mappedSafeAreas.length).toBe(3);
  expect(mappedSafeAreas.every(rect => Math.abs(rect.x - rect.expectedX) < 0.1 && Math.abs(rect.y - rect.expectedY) < 0.1 && Math.abs(rect.width - rect.expectedWidth) < 0.1 && Math.abs(rect.height - rect.expectedHeight) < 0.1)).toBe(true);
  await expect(page.locator('.growth-header-identity')).toHaveCSS('justify-content', 'center');
  await expect(page.locator('.growth-portrait')).toHaveAttribute('src', /CH01\.png/);
  await expect(page.locator('.growth-portrait')).toHaveCSS('animation-name', 'ferryman-idle');
  await expect(page.locator('.growth-card')).toHaveCount(3);
  await expect(page.locator('.growth-card-name')).toHaveCount(0);
  const panelLayout = await page.locator('.growth-info-layout .hub-info-panel').evaluateAll(panels => panels.map(panel => {
    const rect = panel.getBoundingClientRect();
    const style = getComputedStyle(panel);
    return { x: rect.x, width: rect.width, height: rect.height, image: style.borderImageSource, slice: style.borderImageSlice, border: style.borderImageWidth };
  }));
  const fullWidthPanels = panelLayout.filter(panel => Math.abs(panel.width - 783) < 0.1);
  expect(fullWidthPanels).toHaveLength(1);
  expect(fullWidthPanels.every(panel => Math.abs(panel.x - 736) < 0.1)).toBe(true);
  const identityRect = await page.locator('.growth-header').evaluate(node => {
    const header = node.getBoundingClientRect();
    const name = node.querySelector('h1')!.getBoundingClientRect();
    const role = node.querySelector('span')!.getBoundingClientRect();
    return { x: header.x, width: header.width, height: header.height, textCenter: (name.left + role.right) / 2, moduleCenter: header.left + header.width / 2 };
  });
  expect(identityRect.width).toBeCloseTo(780, 0);
  expect(identityRect.height).toBeCloseTo(72, 0);
  expect(identityRect.textCenter).toBeCloseTo(identityRect.moduleCenter, 0);
  await expect(page.locator('.growth-header')).not.toHaveAttribute('data-hb19-panel');
  expect(panelLayout.every(panel => panel.image.includes('info_panel_9slice.png') && panel.slice === '190 fill' && panel.border === '24px')).toBe(true);
  expect(panelLayout.every(panel => panel.width >= 320 && panel.height >= 110)).toBe(true);
  const traitRects = await page.locator('.growth-trait').evaluateAll(panels => panels.map(panel => {
    const rect = panel.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }));
  expect(traitRects[0]!.width).toBeCloseTo(381, 0);
  expect(traitRects[1]!.width).toBeCloseTo(381, 0);
  expect(traitRects[0]!.height).toBeCloseTo(110, 0);
  expect(traitRects[1]!.height).toBeCloseTo(110, 0);
  expect(traitRects[0]!.x).toBeCloseTo(736, 0);
  expect(traitRects[1]!.x).toBeCloseTo(1138, 0);
  expect(traitRects[0]!.y).toBeCloseTo(142, 0);
  await expect(page.locator('.growth-exclusive-cards')).toHaveCSS('height', '220px');
  await expect(page.locator('.growth-exclusive-cards')).toHaveCSS('border-image-source', 'none');
  await expect(page.locator('.growth-more-cards')).toContainText('更多卡牌');
  await expect(page.locator('.growth-more-cards')).toContainText('未解锁');
  const cardAndGrowthRects = await page.evaluate(() => {
    const cards = document.querySelector('.growth-exclusive-cards')!.getBoundingClientRect();
    const growth = document.querySelector('.growth-node-panel')!.getBoundingClientRect();
    const firstCard = document.querySelector('.growth-card')!.getBoundingClientRect();
    const more = document.querySelector('.growth-more-cards')!.getBoundingClientRect();
    return { gap: growth.top - cards.bottom, growthHeight: growth.height, cardHeight: firstCard.height, cardStart: firstCard.left, sectionStart: cards.left, moreRight: more.right, sectionRight: cards.right, cardCenter: firstCard.top + firstCard.height / 2, moreCenter: more.top + more.height / 2 };
  });
  expect(cardAndGrowthRects.gap).toBeCloseTo(10, 0);
  expect(cardAndGrowthRects.growthHeight).toBeCloseTo(110, 0);
  expect(cardAndGrowthRects.cardHeight).toBeCloseTo(220, 0);
  expect(cardAndGrowthRects.cardStart).toBeCloseTo(cardAndGrowthRects.sectionStart, 0);
  expect(cardAndGrowthRects.moreRight).toBeCloseTo(cardAndGrowthRects.sectionRight, 0);
  expect(cardAndGrowthRects.cardCenter).toBeCloseTo(cardAndGrowthRects.moreCenter, 0);
  await expect(page.locator('.growth-more-cards')).toHaveCSS('text-align', 'right');
  await page.mouse.move(12, 12);
  const cardRects = await page.locator('.growth-card-face').evaluateAll(cards => cards.map(card => {
    const slot = card.parentElement!.parentElement!.getBoundingClientRect();
    const style = getComputedStyle(card);
    return { x: slot.x, y: slot.y, width: Number.parseFloat(style.width), height: Number.parseFloat(style.height) };
  }));
  expect(cardRects.every(card => Math.abs(card.width - 165) < 0.1 && Math.abs(card.height - 220) < 0.1)).toBe(true);
  expect(cardRects[0]!.x).toBeLessThan(cardRects[1]!.x);
  expect(cardRects[1]!.x).toBeLessThan(cardRects[2]!.x);
  expect(cardRects[0]!.y).toBeCloseTo(260, 0);
  expect(cardRects[0]!.y).toBeCloseTo(cardRects[1]!.y, 0);
  expect(cardRects[1]!.y).toBeCloseTo(cardRects[2]!.y, 0);
  await expect(page.locator('.growth-card-row')).toHaveCSS('overflow-x', 'auto');
  const cardScroll = await page.locator('.growth-card-row').evaluate(row => {
    const track = row.querySelector('.growth-card-track')!;
    const originalCount = track.children.length;
    for (let index = 0; index < 5; index++) track.append(track.children[0]!.cloneNode(true));
    const scrollWidth = row.scrollWidth;
    row.scrollLeft = scrollWidth;
    const canScroll = row.scrollLeft > 0 && scrollWidth > row.clientWidth;
    while (track.children.length > originalCount) track.lastElementChild!.remove();
    row.scrollLeft = 0;
    return canScroll;
  });
  expect(cardScroll).toBe(true);
  const cardsOutsideSafeArea = await page.locator('.growth-card-content').evaluate(content => {
    const safe = content.getBoundingClientRect();
    return [...content.querySelectorAll('.growth-card')].flatMap(card => {
      const rect = card.getBoundingClientRect();
      return rect.left >= safe.left && rect.right <= safe.right && rect.top >= safe.top && rect.bottom <= safe.bottom ? [] : [{ safe: { left: safe.left, right: safe.right, top: safe.top, bottom: safe.bottom }, rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom } }];
    });
  });
  expect(cardsOutsideSafeArea).toEqual([]);
  const switchRect = await page.locator('.growth-bottom-row .hub-current-ferryman').evaluate(button => {
    const rect = button.getBoundingClientRect(); const portrait = document.querySelector('.growth-portrait')!.getBoundingClientRect();
    return { centerX: rect.left + rect.width / 2, portraitCenterX: portrait.left + portrait.width / 2, width: rect.width, height: rect.height };
  });
  expect(Math.abs(switchRect.centerX - switchRect.portraitCenterX)).toBeLessThan(4);
  expect(switchRect.width / switchRect.height).toBeCloseTo(1983 / 793, 1);
  await expect(page.locator('.growth-bottom-row .ferryman-card-frame')).toHaveAttribute('src', /ferryman_card|HB11/i);
  const growthPortraitWidth = await page.locator('.growth-portrait').evaluate(portrait => Number.parseFloat(getComputedStyle(portrait).width));
  expect(growthPortraitWidth).toBeCloseTo(610, 0);
  await expect(page.locator('.growth-trait--merchant')).toContainText('善贾');
  await expect(page.locator('.growth-trait--locked')).toContainText('尚未开放');  await page.locator('.growth-bottom-row .hub-current-ferryman').click();
  await page.locator('.ferryman-drawer [data-ferryman="qinglan"]').click();
  await expect(page.locator('.hub-toast')).toHaveText('尚未解锁');
  await page.locator('.ferryman-drawer-close').click();
  await page.getByRole('button', { name: '返回' }).click();
  await expect(page.locator('.hub-screen')).toBeVisible();
});

test('旧版存档补齐驿站字段，设置和未开放功能有可操作反馈', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('night-ferry.prologue.v1', JSON.stringify({ prologue_complete: true, wooden_boat_trace_unlocked: true })));
  await page.goto('/?seed=42');
  await page.locator('.menu-start-button').click();
  await expect(page.locator('.hub-screen')).toBeVisible();
  await page.getByRole('button', { name: '设置' }).click();
  await expect(page.getByRole('dialog')).toContainText('设置功能将在后续版本开放');
  await page.getByRole('button', { name: '返回' }).click();
  await page.getByRole('button', { name: '牌录' }).click();
  await expect(page.locator('.hub-toast')).toHaveText('尚未开放');
});

test('HubSafeViewport在1600×800及其他横屏比例中适配，不改动GameStage体系', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('night-ferry.prologue.v1', JSON.stringify({ prologue_complete: true, wooden_boat_trace_unlocked: true })));
  await page.goto('/?seed=42');
  await page.locator('.menu-start-button').click();
  for (const size of [{ width: 1600, height: 800 }, { width: 1600, height: 900 }, { width: 1920, height: 1080 }, { width: 1280, height: 720 }, { width: 932, height: 430 }]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(40);
    const result = await page.evaluate(() => {
      const rect = document.querySelector<HTMLElement>('.hub-safe-viewport')!.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        bgLoaded: (document.querySelector('.viewport-background') as HTMLImageElement).naturalWidth > 0 };
    });
    const scale = Math.min(size.width / 1600, size.height / 800);
    expect(result.x).toBeCloseTo((size.width - 1600 * scale) / 2, 0);
    expect(result.y).toBeCloseTo((size.height - 800 * scale) / 2, 0);
    expect(result.width).toBeCloseTo(1600 * scale, 0);
    expect(result.height).toBeCloseTo(800 * scale, 0);
    expect(result.bgLoaded).toBe(true);
  }
});

test('点击摆渡人卡牌打开无底色预览，点击卡牌外侧关闭后仍可打开摆渡人抽屉', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('night-ferry.prologue.v1', JSON.stringify({ prologue_complete: true, wooden_boat_trace_unlocked: true })));
  await page.setViewportSize({ width: 1600, height: 800 });
  await page.goto('/?seed=42');
  await page.locator('.menu-start-button').click();
  await page.locator('.hub-character').click();
  await page.locator('.growth-card').first().click();
  const popup = page.getByRole('dialog', { name: '狐火' });
  await expect(popup).toBeVisible();
  await expect(popup.locator('.card-preview-art')).toHaveCSS('width', '300px');
  await expect(popup.locator('.hub-popup-close')).toHaveCount(0);
  await expect(popup).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(popup).toHaveCSS('border-top-width', '0px');
  await page.locator('.hub-popup-scrim').click({ position: { x: 30, y: 30 } });
  await expect(page.locator('.card-preview-popup')).toHaveCount(0);
  await page.locator('.growth-bottom-row .hub-current-ferryman').click();
  await expect(page.locator('.ferryman-drawer')).toBeVisible();
});

