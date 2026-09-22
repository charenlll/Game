import { test, expect, type Locator, type Page } from '@playwright/test';

test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

async function drag(page: Page, card: Locator, x: number, y: number): Promise<void> {
  await expect(card).toBeEnabled();
  const box = (await card.boundingBox())!;
  const startX = box.x + Math.min(20, box.width * .2), startY = box.y + 12;
  await card.dispatchEvent('pointerdown', { pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, clientX: startX, clientY: startY });
  await page.locator('#app').dispatchEvent('pointermove', { pointerId: 7, pointerType: 'touch', isPrimary: true, buttons: 1, clientX: x, clientY: y });
  await page.locator('#app').dispatchEvent('pointerup', { pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, clientX: x, clientY: y });
}
const handIds = (page: Page) => page.locator('.hand > .card').evaluateAll(cards => cards.map(card => card.getAttribute('data-id')));

test('CardTestScene动态组合6张卡，统一卡框并按ID绑定插图', async ({ page }) => {
  const failed: string[] = [];
  page.on('requestfailed', request => failed.push(request.url()));
  await page.goto('/?card-test');
  await expect(page.locator('.test-card')).toHaveCount(8);
  await expect(page.locator('.card-frame')).toHaveCount(8);
  await expect(page.locator('.card-art-image')).toHaveCount(8);
  await expect(page.locator('[data-card-id="common_001"] .card-title')).toHaveText('温言');
  await expect(page.locator('[data-card-id="common_006"] .card-description-text')).toContainText('抽 1 张牌');
  const bindings = await page.locator('.card-face').evaluateAll(faces => faces.map(face => ({ id: face.getAttribute('data-card-id'), art: face.querySelector('img.card-art-image')?.getAttribute('src'), frame: face.querySelector('img.card-frame')?.getAttribute('src') })));
  expect(bindings.map(x => x.id)).toEqual(['common_001','common_002','common_003','common_004','common_005','common_006','burden_001','burden_002']);
  expect(bindings.map(x => x.art)).toEqual(['/assets/cards/common/CA01.png','/assets/cards/common/CA02.png','/assets/cards/common/CA03.png','/assets/cards/common/CA04.png','/assets/cards/common/CA05.png','/assets/cards/common/CA06.png','/assets/cards/burden/ZN01.png','/assets/cards/burden/ZN02.png']);
  expect(new Set(bindings.map(x => x.frame))).toEqual(new Set(['/assets/cards/frames/UI01.png']));
  expect(await page.locator('.card-art-image').first().evaluate(image => ({ fit: getComputedStyle(image).objectFit, overflow: getComputedStyle(image.parentElement!).overflow }))).toEqual({ fit: 'cover', overflow: 'hidden' });
  expect(failed).toEqual([]);
});

test('拖回手牌取消：保留指针偏移，不扣灯火、不移牌', async ({ page }) => {
  await page.goto('/?seed=42');
  const before = await handIds(page);
  const card = page.locator('.card').first();
  await expect(card).toBeEnabled();
  const box = (await card.boundingBox())!;
  await card.dispatchEvent('pointerdown', { pointerId: 9, pointerType: 'touch', isPrimary: true, button: 0, clientX: box.x + 8, clientY: box.y + 8 });
  await page.locator('#app').dispatchEvent('pointermove', { pointerId: 9, pointerType: 'touch', isPrimary: true, buttons: 1, clientX: box.x + 75, clientY: box.y - 20 });
  expect(await card.evaluate(element => parseFloat((element as HTMLElement).style.left))).toBeCloseTo(box.x + 67, 0);
  await page.locator('#app').dispatchEvent('pointermove', { pointerId: 9, pointerType: 'touch', isPrimary: true, buttons: 1, clientX: box.x + 8, clientY: 365 });
  await page.locator('#app').dispatchEvent('pointerup', { pointerId: 9, pointerType: 'touch', isPrimary: true, button: 0, clientX: box.x + 8, clientY: 365 });
  await expect(page.getByTestId('light')).toHaveText('3');
  expect(await handIds(page)).toEqual(before);
  await expect(page.getByRole('status')).toContainText('取消出牌');
});

test('有效区松手只执行一次，Hand进入DiscardPile并补位', async ({ page }) => {
  await page.goto('/?seed=42');
  const before = await handIds(page);
  const obsession = Number((await page.getByTestId('obsession').innerText()).match(/\d+/)![0]);
  const card = page.locator('[data-card="common_001"]').first();
  const instance = await card.getAttribute('data-id');
  await drag(page, card, 370, 150);
  await expect(page.getByTestId('light')).toHaveText('2');
  await expect(page.getByTestId('obsession')).toContainText(String(obsession - 4));
  expect(await handIds(page)).not.toContain(instance);
  expect(await page.locator('.discard-pile strong').innerText()).toBe('1');
  expect((await handIds(page)).length).toBe(before.length - 1);
  await page.mouse.up();
  await expect(page.getByTestId('light')).toHaveText('2');
  expect(await page.locator('.discard-pile strong').innerText()).toBe('1');
});

test('桌面鼠标可原生拖出最上层手牌', async ({ page }) => {
  await page.goto('/?seed=42');
  const card = page.locator('.card').last();
  await expect(card).toBeEnabled();
  const box = (await card.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 15);
  await page.mouse.down();
  await page.mouse.move(430, 150, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.card')).toHaveCount(4);
});

test('抽牌效果保持五张手牌上限且不侵占左侧资源区', async ({ page }) => {
  await page.goto('/?seed=42');
  await drag(page, page.locator('[data-card="common_004"]'), 370, 150);
  await expect(page.locator('.card')).toHaveCount(5);
  const boxes = await page.locator('.card').evaluateAll(cards => cards.map(card => {
    const box = card.getBoundingClientRect();
    return { left: box.left, right: box.right };
  }));
  expect(Math.min(...boxes.map(box => box.left))).toBeGreaterThanOrEqual(0);
  expect(Math.max(...boxes.map(box => box.right))).toBeLessThanOrEqual(844);
  const resourceRight = await page.locator('.resource-cluster').evaluate(element => element.getBoundingClientRect().right);
  expect(Math.min(...boxes.map(box => box.left))).toBeGreaterThan(resourceRight);
  const groupCenter = (Math.min(...boxes.map(box => box.left)) + Math.max(...boxes.map(box => box.right))) / 2;
  expect(groupCenter).toBeCloseTo(844 / 2, 0);
});

test('长按卡牌在中央放大，松手后关闭且不出牌', async ({ page }) => {
  await page.goto('/?seed=42');
  const card = page.locator('.card').first();
  await expect(card).toBeEnabled();
  const id = await card.getAttribute('data-id');
  const box = (await card.boundingBox())!;
  await card.dispatchEvent('pointerdown', { pointerId: 12, pointerType: 'touch', isPrimary: true, button: 0, clientX: box.x + 10, clientY: box.y + 10 });
  await page.waitForTimeout(460);
  await expect(card).toHaveClass(/previewing/);
  const previewCard = page.locator('.card-preview');
  await expect(previewCard).toBeVisible();
  const preview = (await previewCard.boundingBox())!;
  expect(preview.x + preview.width / 2).toBeCloseTo(844 / 2, 0);
  expect(preview.y + preview.height / 2).toBeCloseTo(390 / 2, 0);
  await card.dispatchEvent('pointerup', { pointerId: 12, pointerType: 'touch', isPrimary: true, button: 0, clientX: box.x + 10, clientY: box.y + 10 });
  await expect(card).not.toHaveClass(/previewing/);
  await expect(previewCard).toHaveCount(0);
  expect(await handIds(page)).toContain(id);
  await expect(page.getByTestId('light')).toHaveText('3');
});

test('灯火不足拖入有效区仍取消', async ({ page }) => {
  await page.goto('/?seed=42');
  await drag(page, page.locator('[data-card="common_002"]'), 370, 150);
  await expect(page.getByTestId('light')).toHaveText('1');
  await drag(page, page.locator('[data-card="common_004"]'), 370, 150);
  await expect(page.getByTestId('light')).toHaveText('0');
  const target = page.locator('[data-card="common_001"]').first();
  const id = await target.getAttribute('data-id');
  const discard = await page.locator('.discard-pile strong').innerText();
  await drag(page, target, 370, 150);
  await expect(page.getByTestId('light')).toHaveText('0');
  expect(await handIds(page)).toContain(id);
  expect(await page.locator('.discard-pile strong').innerText()).toBe(discard);
});

test('整理行囊拖出后选择弃牌，取消零副作用，确认正确结算', async ({ page }) => {
  await page.goto('/?seed=3');
  const before = await handIds(page);
  await drag(page, page.locator('[data-card="common_005"]'), 370, 150);
  await expect(page.getByRole('button', { name: '确认换牌' })).toBeDisabled();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  expect(await handIds(page)).toEqual(before);
  await expect(page.getByTestId('light')).toHaveText('3');
  await drag(page, page.locator('[data-card="common_005"]'), 370, 150);
  const others = page.locator('.card:not([data-card="common_005"])');
  await others.nth(0).click(); await others.nth(1).click();
  await page.getByRole('button', { name: '确认换牌' }).click();
  await expect(page.locator('.card')).toHaveCount(4);
  await expect(page.getByTestId('light')).toHaveText('3');
});

test('结束回合位于底部中央且连点只前进一回合', async ({ page }) => {
  await page.goto('/?seed=42');
  const button = page.getByRole('button', { name: /结束回合/ });
  const box = (await button.boundingBox())!;
  expect(box.x + box.width / 2).toBeCloseTo(844 / 2, 0);
  const cards = await page.locator('.card').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().top));
  expect(box.y + box.height).toBeLessThanOrEqual(Math.min(...cards));
  await button.dblclick();
  await expect(page.getByTestId('turn')).toHaveText('02');
});

test('绯川从右下越界放大，姓名覆盖其上，亡魂与PlayZone保留中央空间', async ({ page }) => {
  await page.goto('/?seed=42');
  const layout = await page.evaluate(() => {
    const character = document.querySelector('.character')!.getBoundingClientRect();
    const name = document.querySelector('.character-name')!.getBoundingClientRect();
    const soul = document.querySelector('.soul-target')!.getBoundingClientRect();
    const zone = document.querySelector('.play-zone')!.getBoundingClientRect();
    const nameStyle = getComputedStyle(document.querySelector('.character-name')!);
    const nameTextStyle = getComputedStyle(document.querySelector('.character-name b')!);
    return { character, name, soul, zone, nameShadow: nameStyle.textShadow,
      titleWeight: Number(nameTextStyle.fontWeight),
      scale: getComputedStyle(document.querySelector('.game')!).getPropertyValue('--ferryman-scale').trim() };
  });
  expect(layout.character.x + layout.character.width / 2).toBeGreaterThan(844 * .7);
  expect(layout.character.right > 844 || layout.character.bottom > 390).toBeTruthy();
  expect(layout.name.x + layout.name.width / 2).toBeGreaterThan(844 * .75);
  expect(layout.titleWeight).toBeGreaterThanOrEqual(700);
  expect(layout.nameShadow).not.toBe('none');
  expect(layout.soul.x + layout.soul.width / 2).toBeLessThan(844 * .55);
  expect(layout.zone.width).toBeGreaterThan(844 * .6);
  expect(Number(layout.scale)).toBeGreaterThan(1.5);
});

test('左下资源整合成一组且卡牌没有投影', async ({ page }) => {
  await page.goto('/?seed=42');
  const result = await page.evaluate(() => {
    const cluster = document.querySelector('.resource-cluster')!.getBoundingClientRect();
    const cardStyle = getComputedStyle(document.querySelector('.card')!);
    return {
      cluster: { left: cluster.left, bottom: cluster.bottom, width: cluster.width },
      resources: document.querySelectorAll('.resource-cluster .light-orb, .resource-cluster .pile').length,
      cardShadow: cardStyle.boxShadow,
    };
  });
  expect(result.resources).toBe(3);
  expect(result.cluster.left).toBeLessThan(30);
  expect(result.cluster.bottom).toBeGreaterThan(350);
  expect(result.cluster.width).toBeLessThan(210);
  expect(result.cardShadow).toBe('none');
});

test('牌库UI、核心图标与灵魂特效使用正式路径且无旧编号', async ({ page }) => {
  await page.goto('/?seed=42');
  await expect(page.locator('.draw-pile .deck-stack img')).toHaveCount(3);
  await expect(page.locator('.draw-pile .deck-stack img').first()).toHaveAttribute('src', '/assets/cards/frames/UI02.png');
  await expect(page.locator('.discard-pile img')).toHaveAttribute('src', '/assets/ui/card/UC02.png');
  await expect(page.locator('.exhaust-pile img')).toHaveAttribute('src', '/assets/ui/card/UC03.png');
  await expect(page.locator('.release-glow')).toHaveAttribute('src', '/assets/effects/soul/FX02.png');
  await expect(page.locator('.intent-card img')).toHaveAttribute('src', '/assets/ui/battle/UI03.png');
  const source = await page.locator('html').evaluate(() => document.documentElement.innerHTML);
  expect(source).not.toMatch(/IC08|IC09|IC10|FX04/);
});

test('Intent提前显示并位于居中亡魂名称左侧', async ({ page }) => {
  for (const viewport of [{ width: 2560, height: 1440 }, { width: 1920, height: 1080 }, { width: 1654, height: 800 }, { width: 1600, height: 900 }, { width: 1366, height: 768 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/?seed=42');
    await expect(page.getByTestId('intent').locator('b')).not.toHaveText('');
    const layout = await page.evaluate(() => {
      const soul = document.querySelector('.soul-target')!.getBoundingClientRect();
      const name = document.querySelector('.soul-title-row h2')!.getBoundingClientRect();
      const intent = document.querySelector('.intent-card')!.getBoundingClientRect();
      return { soulCenter: soul.left + soul.width / 2, nameCenter: name.left + name.width / 2, nameLeft: name.left, intentRight: intent.right, intentWidth: intent.width };
    });
    expect(layout.intentRight).toBeLessThanOrEqual(layout.nameLeft);
    expect(layout.nameCenter).toBeCloseTo(layout.soulCenter, 0);
    expect(layout.intentWidth).toBeGreaterThan(0);
  }
});

test('点击Intent使用统一弹窗显示完整说明且文字加粗', async ({ page }) => {
  await page.goto('/?seed=42');
  await expect(page.locator('.card').first()).toBeEnabled();
  const intentName = await page.getByTestId('intent').locator('b').innerText();
  await page.getByTestId('intent').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: intentName })).toBeVisible();
  await expect(dialog.locator('.intent-modal-detail')).not.toHaveText('');
  expect(Number(await dialog.locator('h2').evaluate(element => getComputedStyle(element).fontWeight))).toBeGreaterThanOrEqual(700);
});

test('牌组弹窗使用实体卡牌横向滑动并在卡牌下方显示数量', async ({ page }) => {
  await page.goto('/?seed=42');
  await page.locator('.draw-pile').click();
  const carousel = page.locator('.deck-carousel');
  await expect(carousel).toBeVisible();
  await expect(carousel.locator('.deck-card')).toHaveCount(6);
  await expect(carousel.locator('.card-frame')).toHaveCount(6);
  await expect(carousel.locator('.deck-count')).toHaveCount(6);
  const counts = await carousel.locator('.deck-count').allTextContents();
  expect(counts.reduce((sum, text) => sum + Number(text.match(/\d+/)?.[0] ?? 0), 0)).toBe(12);
  expect(await carousel.evaluate(element => element.scrollWidth)).toBeGreaterThan(await carousel.evaluate(element => element.clientWidth));
});

test('结束回合执行预告Intent且双击不重复结算', async ({ page }) => {
  await page.goto('/?seed=42');
  const button = page.getByRole('button', { name: /结束回合/ });
  await button.dblclick();
  await expect(page.getByTestId('turn')).toHaveText('02');
  await expect(page.getByTestId('intent').locator('b')).not.toHaveText('');
});

test('迟疑临时加费只让左上角费用数字变红', async ({ page }) => {
  let found = false;
  for (let seed = 0; seed < 40; seed++) {
    await page.goto(`/?seed=${seed}`);
    if ((await page.getByTestId('intent').innerText()).includes('迟疑')) { found = true; break; }
  }
  expect(found).toBe(true);
  await page.getByRole('button', { name: /结束回合/ }).click();
  await expect(page.getByTestId('turn')).toHaveText('02');
  const affected = page.locator('.card.intent-cost-up');
  await expect(affected).toHaveCount(1);
  const styles = await affected.evaluate(card => ({ outline: getComputedStyle(card).outlineStyle, color: getComputedStyle(card.querySelector('.card-cost')!).color }));
  expect(styles.outline).toBe('none');
  expect(styles.color).toBe('rgb(229, 75, 75)');
});

test('竖屏提示横屏，旋转后对局保持', async ({ page }) => {
  await page.goto('/?seed=42');
  await page.getByRole('button', { name: /结束回合/ }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: '横过来，开始今夜的摆渡' })).toBeVisible();
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.getByTestId('turn')).toHaveText('02');
});

test('开局统一抽牌流使用UI02并在稳定后恢复手牌输入', async ({ page }) => {
  await page.goto('/?seed=42', { waitUntil: 'commit' });
  await page.locator('.flow-card-back').first().waitFor({ state: 'attached' });
  await expect(page.locator('.flow-card-back').first()).toHaveAttribute('src', '/assets/cards/frames/UI02.png');
  expect(await page.locator('.flow-card-back').first().evaluate(element => parseFloat((element as HTMLElement).style.left))).toBeGreaterThan(700);
  await expect(page.locator('.hand > .card').first()).toBeDisabled();
  await expect(page.locator('.flow-card-back')).toHaveCount(0);
  await expect(page.locator('.hand > .card').first()).toBeEnabled();
});

test('杂念从Intent进入手牌并支付1灯火进入消耗牌堆', async ({ page }) => {
  let found = false;
  for (let seed = 0; seed < 40; seed++) {
    await page.goto(`/?seed=${seed}`);
    await expect(page.locator('.hand > .card').first()).toBeEnabled();
    if ((await page.getByTestId('intent').innerText()).includes('杂念滋生')) { found = true; break; }
  }
  expect(found).toBe(true);
  await page.getByRole('button', { name: /结束回合/ }).click();
  const burden = page.locator('[data-card="burden_002"]');
  await expect(burden).toBeEnabled();
  const light = Number(await page.getByTestId('light').innerText());
  await drag(page, burden, 370, 150);
  await expect(page.getByTestId('exhaust-count')).toHaveText('1');
  await expect(page.getByTestId('light')).toHaveText(String(light - 1));
  await expect(page.locator('.hand > [data-card="burden_002"]')).toHaveCount(0);
});

test('第六夜未化解时延迟显示渡魂未竟并保留未释然亡魂', async ({ page }) => {
  await page.goto('/?seed=42');
  for (let turn = 2; turn <= 6; turn++) {
    await page.getByRole('button', { name: /结束回合/ }).click();
    await expect(page.getByTestId('turn')).toHaveText(String(turn).padStart(2, '0'));
  }
  await page.getByRole('button', { name: /结束回合/ }).click();
  const result = page.locator('.result-banner.failure');
  await expect(result.locator('strong')).toHaveText('渡魂未竟');
  await expect(result.locator('img')).toHaveAttribute('src', '/assets/ui/results/RT02.png');
  await expect(page.locator('.soul-unresolved')).toHaveCSS('opacity', '1');
  await expect(page.locator('.soul-released')).toHaveCSS('opacity', '0');
  await expect(result).toHaveCount(0, { timeout: 3000 });
});

test('抽牌动画中重新开始会清除旧队列并恢复新对局输入', async ({ page }) => {
  await page.goto('/?seed=42');
  await page.getByRole('button', { name: '打开菜单' }).click();
  await page.getByRole('button', { name: '重试相同牌序' }).click();
  await expect(page.locator('.flow-card-back')).toHaveCount(0);
  await expect(page.locator('.hand > .card')).toHaveCount(5);
  await expect(page.locator('.hand > .card').first()).toBeEnabled();
  await expect(page.getByTestId('turn')).toHaveText('01');
});





