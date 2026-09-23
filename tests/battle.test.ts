import { describe, expect, it } from 'vitest';
import { Battle, endTurnDiscardCount, getCost } from '../src/core/battle';
import { getCard } from '../src/core/content';
import { CardDatabase } from '../src/core/card-database';
import cardsData from '../src/data/cards.json';
import type { CardInstance } from '../src/core/types';
import { drawCards } from '../src/core/deck';

function take(battle: Battle, definition: string): CardInstance {
  const state = battle.state;
  for (const pile of [state.Hand, state.DrawPile, state.DiscardPile]) {
    const index = pile.findIndex(card => card.DefinitionID === definition);
    if (index !== -1) {
      const [card] = pile.splice(index, 1);
      state.Hand.push(card);
      return card;
    }
  }
  throw new Error('测试缺少所需卡牌');
}
function allCards(battle: Battle): CardInstance[] {
  const s = battle.state;
  return [...s.Hand, ...s.DrawPile, ...s.DiscardPile, ...s.Resolving, ...s.ExhaustPile];
}
function finishTurn(battle: Battle) {
  const required = endTurnDiscardCount(battle.state);
  const selected = battle.state.Hand.filter(card => getCard(card.DefinitionID).DataType === 'normal').slice(0, required).map(card => card.InstanceID);
  return battle.endTurn(selected);
}

describe('对局规则', () => {
  it('绯川初始化15张牌、5手牌、3灯火、30执念与善贾特性', () => {
    const b = new Battle(123);
    expect(b.state.Hand).toHaveLength(5);
    expect(b.state.DrawPile).toHaveLength(10);
    expect(b.state.Light).toBe(3);
    expect(b.state.Obsession).toBe(30);
    expect(b.state.Turn).toBe(1);
    expect(b.state.CombatTraitID).toBe('good_merchant');
    expect(new Set(allCards(b).map(card => card.InstanceID)).size).toBe(15);
  });
  it('固定牌序可复现', () => {
    expect(new Battle(42).state).toEqual(new Battle(42).state);
    expect(new Battle(42).state.Hand).not.toEqual(new Battle(43).state.Hand);
  });
  it('弃牌堆洗回牌库时会按随机状态重新排序', () => {
    const reshuffle = (seed: number) => {
      const b = new Battle(seed);
      b.state.Hand.length = 0;
      b.state.DrawPile.length = 0;
      b.state.DiscardPile = ['common_001', 'common_002', 'common_003', 'common_004', 'common_005'].map((DefinitionID, index) => ({
        InstanceID: `reshuffle-${index}`, DefinitionID, IsTemporary: false, CostModifiers: [],
      }));
      b.state.HandSize = 5;
      b.state.CurrentIntent = { IntentID: 'intent_close' };
      finishTurn(b);
      return b.state.Hand.map(card => card.DefinitionID);
    };
    expect(reshuffle(50)).toEqual(reshuffle(50));
    expect(reshuffle(50)).not.toEqual(reshuffle(51));
  });
  it('费用不足、手牌外 ID 不改变任何状态', () => {
    const b = new Battle(2); const card = take(b, 'common_002'); b.state.Light = 0;
    const before = structuredClone(b.state);
    expect(b.play(card.InstanceID).Ok).toBe(false);
    expect(b.play('not-in-hand').Ok).toBe(false);
    expect(b.state).toEqual(before);
  });
  it('安抚扣费、减少执念并进入弃牌堆', () => {
    const b = new Battle(1); const card = take(b, 'common_001');
    expect(b.play(card.InstanceID)).toEqual({ Ok: true });
    expect(b.state.Light).toBe(2); expect(b.state.Obsession).toBe(26);
    expect(b.state.DiscardPile).toContain(card); expect(b.state.Hand).not.toContain(card);
    expect(b.state.Stats.CardsPlayed).toBe(1);
  });
  it('添灯本回合生效，下回合恢复基础值', () => {
    const b = new Battle(1); const card = take(b, 'common_003');
    b.play(card.InstanceID); expect(b.state.Light).toBe(4);
    finishTurn(b); expect(b.state.Light).toBe(3); expect(b.state.Hand).toHaveLength(7);
  });
  it('未使用手牌保留，超过5张时必须手动弃置普通牌，随后固定摸2张', () => {
    const b = new Battle(21);
    b.state.CurrentIntent = { IntentID: 'intent_close' };
    drawCards(b.state, 2);
    expect(b.state.Hand).toHaveLength(7);
    const before = structuredClone(b.state);
    expect(b.endTurn()).toEqual({ Ok: false, Message: '请先选择 2 张可弃置的普通手牌。' });
    expect(b.state).toEqual(before);
    const burden: CardInstance = { InstanceID: 'cannot-discard', DefinitionID: 'burden_001', IsTemporary: false, CostModifiers: [] };
    b.state.Hand.push(burden);
    const normals = b.state.Hand.filter(card => getCard(card.DefinitionID).DataType === 'normal');
    expect(b.endTurn([burden.InstanceID, normals[0].InstanceID, normals[1].InstanceID]).Ok).toBe(false);
    expect(b.state.Hand).toContain(burden);
    expect(b.endTurn(normals.slice(0, 3).map(card => card.InstanceID)).Ok).toBe(true);
    expect(b.state.Hand).toContain(burden);
    expect(b.state.Hand).toHaveLength(7);
    expect(b.state.DiscardPile).toHaveLength(3);
  });
  it('弃牌不足、重复、包括自身或非法选择均拒绝且无副作用', () => {
    const b = new Battle(1); const card = take(b, 'common_005');
    const other = b.state.Hand.find(c => c !== card)!;
    const before = structuredClone(b.state);
    for (const selected of [[], [other.InstanceID], [other.InstanceID, other.InstanceID], [card.InstanceID, other.InstanceID], ['bad', other.InstanceID]]) {
      expect(b.play(card.InstanceID, selected).Ok).toBe(false); expect(b.state).toEqual(before);
    }
  });
  it('弃牌选择完成后按顺序弃二抽二，保留总数', () => {
    const b = new Battle(1); const card = take(b, 'common_005');
    const selected = b.state.Hand.filter(c => c !== card).slice(0, 2);
    const handCount = b.state.Hand.length;
    const events: string[] = []; b.events.subscribe(event => events.push(event.Type));
    expect(b.play(card.InstanceID, selected.map(c => c.InstanceID)).Ok).toBe(true);
    expect(b.state.Hand).toHaveLength(handCount - 1);
    expect(b.state.DiscardPile).toEqual([...selected, card]);
    expect(events).toEqual(['OnCardDiscarded', 'OnCardDiscarded', 'OnCardPlayed']);
    expect(allCards(b)).toHaveLength(15);
  });
  it('多效果卡完整结算后再判定成功', () => {
    const b = new Battle(1); const card = take(b, 'common_006');
    b.state.Obsession = 2; const count = b.state.Hand.length;
    const events: string[] = []; b.events.subscribe(event => events.push(event.Type));
    b.play(card.InstanceID);
    expect(b.state.Obsession).toBe(0); expect(b.state.Hand).toHaveLength(count); expect(b.state.Status).toBe('won');
    expect(events).toEqual(['OnCardPlayed', 'OnBattleEnd']);
  });
  it('当前正在结算的抽牌卡不会抽到自己', () => {
    const b = new Battle(1); const card = take(b, 'common_004');
    const count = b.state.Hand.length;
    expect(b.play(card.InstanceID).Ok).toBe(true);
    expect(b.state.Hand).not.toContain(card); expect(b.state.DiscardPile).toEqual([card]);
    expect(b.state.Hand).toHaveLength(count + 1);
    expect(b.state.Resolving).toHaveLength(0);
  });
  it('第6回合仍可成功', () => {
    const b = new Battle(3); for (let i = 0; i < 5; i++) finishTurn(b);
    expect(b.state.Turn).toBe(6); expect(b.state.Status).toBe('playing');
    const card = take(b, 'common_001'); b.state.Obsession = 4;
    b.play(card.InstanceID); expect(b.state.Status).toBe('won');
  });
  it('结束第6回合并执行Intent后才失败，结束事件只发一次', () => {
    const b = new Battle(3); let ends = 0;
    b.events.subscribe(event => { if (event.Type === 'OnBattleEnd') ends++; });
    for (let i = 0; i < 6; i++) finishTurn(b);
    expect(b.state.Status).toBe('lost'); expect(b.state.Turn).toBe(6); expect(ends).toBe(1);
    const before = structuredClone(b.state);
    expect(b.endTurn().Ok).toBe(false); expect(b.play('card-1').Ok).toBe(false);
    expect(b.state).toEqual(before); expect(ends).toBe(1);
  });
  it('成功后禁止重复出牌或结束回合', () => {
    const b = new Battle(1); const card = take(b, 'common_001'); b.state.Obsession = 1;
    b.play(card.InstanceID); const before = structuredClone(b.state);
    expect(b.play(card.InstanceID).Ok).toBe(false); expect(b.endTurn().Ok).toBe(false); expect(b.state).toEqual(before);
  });
  it('重建对局不继承旧局状态或监听器', () => {
    const old = new Battle(1); finishTurn(old); finishTurn(old); finishTurn(old); finishTurn(old); old.state.Light = 100;
    const fresh = new Battle(1); expect(fresh.state).toEqual(new Battle(1).state);
    expect(fresh.events).not.toBe(old.events); expect(fresh.state.Hand).not.toBe(old.state.Hand);
    expect(fresh.state.PendingCostIncrease).toBe(0); expect(fresh.state.PendingLightModifier).toBe(0);
    expect(fresh.state.ExhaustPile).toEqual([]); expect(fresh.state.CurrentIntent).toEqual(new Battle(1).state.CurrentIntent);
  });
  it('费用修正不过期时生效，最低为0，不污染卡牌定义', () => {
    const b = new Battle(1); const card = take(b, 'common_001');
    card.CostModifiers.push({ Source: 'test', Amount: -3, ExpiresAtTurn: 1 });
    expect(getCost(card, 1)).toBe(0); expect(getCost(card, 2)).toBe(1); expect(getCard(card.DefinitionID).Cost).toBe(1);
    finishTurn(b); expect(card.CostModifiers).toHaveLength(0);
  });
  it('事件监听可移除，结算期间拒绝再次操作', () => {
    const b = new Battle(1); const card = take(b, 'common_001'); let calls = 0;
    const unsubscribe = b.events.subscribe(() => { calls++; expect(b.endTurn().Ok).toBe(false); });
    b.play(card.InstanceID); unsubscribe(); finishTurn(b); expect(calls).toBe(1);
  });
  it('多个种子和连续回合下牌数量与实例唯一性保持不变', () => {
    for (let seed = 0; seed < 30; seed++) {
      const b = new Battle(seed);
      for (let turn = 0; turn < 6 && b.state.Status === 'playing'; turn++) {
        for (const card of [...b.state.Hand]) if (card.DefinitionID !== 'common_005') b.play(card.InstanceID);
        expect(allCards(b).length).toBeGreaterThanOrEqual(12);
        expect(new Set(allCards(b).map(card => card.InstanceID)).size).toBe(allCards(b).length);
        expect(b.state.Light).toBeGreaterThanOrEqual(0);
        if (b.state.Status === 'playing') finishTurn(b);
      }
    }
  });
  it('Intent由种子随机决定且每种效果独立执行', () => {
    expect(new Battle(7).state.CurrentIntent).toEqual(new Battle(7).state.CurrentIntent);
    expect(new Set(Array.from({ length: 30 }, (_, seed) => new Battle(seed).state.CurrentIntent.IntentID)).size).toBeGreaterThan(1);
    const b = new Battle(7);
    b.state.CurrentIntent = { IntentID: 'intent_hesitation_spread', BurdenCardID: 'burden_001' };
    finishTurn(b);
    expect([...b.state.DrawPile, ...b.state.Hand].filter(card => card.DefinitionID === 'burden_001')).toHaveLength(1);
    expect(b.state.DiscardPile.some(card => card.DefinitionID === 'burden_001')).toBe(false);
    expect(allCards(b).some(card => card.DefinitionID === 'burden_002')).toBe(false);
    b.state.CurrentIntent = { IntentID: 'intent_close' };
    b.state.Obsession = 28; finishTurn(b);
    expect(b.state.Obsession).toBe(30);
    b.state.CurrentIntent = { IntentID: 'intent_burden', BurdenCardID: 'burden_002' };
    finishTurn(b);
    expect(b.state.Hand.filter(card => card.DefinitionID === 'burden_002')).toHaveLength(1);
    expect(b.state.DiscardPile.some(card => card.DefinitionID === 'burden_002')).toBe(false);
    expect(allCards(b).filter(card => card.DefinitionID === 'burden_001')).toHaveLength(1);
  });
  it('迟疑只为下一回合一张正常手牌增加1费并随后恢复', () => {
    const b = new Battle(8);
    const baseCosts = new Map(allCards(b).map(card => [card.InstanceID, getCard(card.DefinitionID).Cost]));
    b.state.CurrentIntent = { IntentID: 'intent_hesitate' };
    finishTurn(b);
    const modified = b.state.Hand.filter(card => card.CostModifiers.some(mod => mod.Source === 'intent_hesitate'));
    expect(modified).toHaveLength(1);
    expect(getCost(modified[0], 2)).toBe(baseCosts.get(modified[0].InstanceID)! + 1);
    b.state.CurrentIntent = { IntentID: 'intent_close' };
    finishTurn(b);
    expect(allCards(b).every(card => card.CostModifiers.every(mod => mod.Source !== 'intent_hesitate'))).toBe(true);
  });
  it('魂灯黯淡只让下一回合灯火减1', () => {
    const b = new Battle(9);
    b.state.CurrentIntent = { IntentID: 'intent_dim_light' };
    finishTurn(b); expect(b.state.Turn).toBe(2); expect(b.state.Light).toBe(2);
    b.state.CurrentIntent = { IntentID: 'intent_close' };
    finishTurn(b); expect(b.state.Turn).toBe(3); expect(b.state.Light).toBe(3);
  });
  it('踌躇不能使用，杂念花1灯火后进入Exhaust且不会洗回', () => {
    const b = new Battle(10);
    const hesitate: CardInstance = { InstanceID: 'burden-test-1', DefinitionID: 'burden_001', IsTemporary: false, CostModifiers: [] };
    const noise: CardInstance = { InstanceID: 'burden-test-2', DefinitionID: 'burden_002', IsTemporary: false, CostModifiers: [] };
    b.state.Hand.push(hesitate, noise);
    expect(b.play(hesitate.InstanceID).Ok).toBe(false);
    const light = b.state.Light;
    expect(b.play(noise.InstanceID)).toEqual({ Ok: true });
    expect(b.state.Light).toBe(light - 1);
    expect(b.state.ExhaustPile).toContain(noise);
    b.state.DrawPile.length = 0;
    finishTurn(b);
    expect(b.state.Hand).toContain(hesitate);
    expect(b.state.DiscardPile).not.toContain(hesitate);
    expect([...b.state.DrawPile, ...b.state.Hand, ...b.state.DiscardPile]).not.toContain(noise);
  });
  it('所有浊念不能被整理行囊弃置且回合结束持续留在手牌', () => {
    const b = new Battle(12);
    const organizer = take(b, 'common_005');
    const burden: CardInstance = { InstanceID: 'burden-retained', DefinitionID: 'burden_001', IsTemporary: false, CostModifiers: [] };
    b.state.Hand.push(burden);
    const normal = b.state.Hand.filter(card => card !== organizer && card !== burden)[0];
    const before = structuredClone(b.state);
    expect(b.play(organizer.InstanceID, [burden.InstanceID, normal.InstanceID]).Ok).toBe(false);
    expect(b.state).toEqual(before);
    b.state.CurrentIntent = { IntentID: 'intent_close' };
    finishTurn(b);
    expect(b.state.Hand).toContain(burden);
    expect(b.state.DiscardPile).not.toContain(burden);
    expect(b.state.Hand).toHaveLength(7);
  });
  it('执念归零立即成功且阻止当回合Intent', () => {
    const b = new Battle(11); const card = take(b, 'common_001'); b.state.Obsession = 1;
    b.play(card.InstanceID);
    expect(b.state.Status).toBe('won');
    expect(allCards(b).some(item => item.DefinitionID === 'burden_001' || item.DefinitionID === 'burden_002')).toBe(false);
    expect(b.endTurn().Ok).toBe(false);
  });

  it('善贾每回合只在首次实际获得灯火时激活，并由下一张普通牌消耗', () => {
    const b = new Battle(31);
    const firstLight = take(b, 'common_003');
    const events: string[] = [];
    b.events.subscribe(event => events.push(event.Type));
    expect(b.play(firstLight.InstanceID).Ok).toBe(true);
    const secondLight = take(b, 'common_003');
    const normal = take(b, 'common_002');
    expect(b.state.CombatTraitDiscountActive).toBe(true);
    expect(b.cost(normal)).toBe(1);
    expect(b.play(secondLight.InstanceID).Ok).toBe(true);
    expect(b.state.CombatTraitDiscountActive).toBe(false);
    expect(events.filter(type => type === 'OnTraitTriggered')).toHaveLength(1);
    expect(b.cost(normal)).toBe(2);
  });

  it('善贾不影响浊念，失败或取消的出牌不会消耗折扣', () => {
    const b = new Battle(32);
    b.play(take(b, 'common_003').InstanceID);
    const burden: CardInstance = { InstanceID: 'trait-burden', DefinitionID: 'burden_002', IsTemporary: false, CostModifiers: [] };
    b.state.Hand.push(burden);
    expect(b.cost(burden)).toBe(1);
    b.state.Light = 0;
    expect(b.play(burden.InstanceID).Ok).toBe(false);
    expect(b.state.CombatTraitDiscountActive).toBe(true);
    const normal = take(b, 'common_001');
    expect(b.cost(normal)).toBe(0);
    expect(b.play(normal.InstanceID).Ok).toBe(true);
    expect(b.state.CombatTraitDiscountActive).toBe(false);
  });

  it('回合结束会清除尚未使用的善贾优惠并在下一回合重新允许触发', () => {
    const b = new Battle(43);
    b.play(take(b, 'common_003').InstanceID);
    expect(b.state.CombatTraitDiscountActive).toBe(true);
    finishTurn(b);
    expect(b.state.CombatTraitDiscountActive).toBe(false);
    expect(b.state.CombatTraitTriggeredThisTurn).toBe(false);
    expect(b.state.GainedLightThisTurn).toBe(false);
  });

  it('狐火按本回合是否获得过灯火分别化解8或11点执念', () => {
    const plain = new Battle(33);
    expect(plain.play(take(plain, 'feichuan_001').InstanceID).Ok).toBe(true);
    expect(plain.state.Obsession).toBe(22);
    const boosted = new Battle(34);
    boosted.play(take(boosted, 'common_003').InstanceID);
    expect(boosted.play(take(boosted, 'feichuan_001').InstanceID).Ok).toBe(true);
    expect(boosted.state.Obsession).toBe(19);
  });

  it('借灯获得2灯火并与魂灯黯淡叠加为下一回合灯火-2', () => {
    const b = new Battle(35);
    const borrowed = take(b, 'feichuan_002');
    expect(b.play(borrowed.InstanceID).Ok).toBe(true);
    expect(b.state.Light).toBe(5);
    expect(b.state.PendingLightModifier).toBe(-1);
    b.state.CurrentIntent = { IntentID: 'intent_dim_light' };
    finishTurn(b);
    expect(b.state.Light).toBe(1);
    expect(b.state.PendingLightModifier).toBe(0);
  });

  it('讨价还价只降低所选另一张普通牌本回合费用并抽1张', () => {
    const b = new Battle(36);
    const bargain = take(b, 'feichuan_003');
    const target = take(b, 'common_002');
    const before = b.state.Hand.length;
    expect(b.play(bargain.InstanceID, [target.InstanceID]).Ok).toBe(true);
    expect(b.state.Hand).toHaveLength(before);
    expect(getCost(target, b.state.Turn)).toBe(1);
    expect(target.CostModifiers).toEqual([{ Source: 'feichuan_bargain', Amount: -1, ExpiresAtTurn: 1 }]);
    finishTurn(b);
    expect(target.CostModifiers).toEqual([]);
  });

  it('讨价还价不能选择浊念或自身且非法选择无副作用', () => {
    const b = new Battle(37);
    const bargain = take(b, 'feichuan_003');
    const burden: CardInstance = { InstanceID: 'bargain-burden', DefinitionID: 'burden_001', IsTemporary: false, CostModifiers: [] };
    b.state.Hand.push(burden);
    const before = structuredClone(b.state);
    expect(b.play(bargain.InstanceID, [burden.InstanceID]).Ok).toBe(false);
    expect(b.state).toEqual(before);
    expect(b.play(bargain.InstanceID, [bargain.InstanceID]).Ok).toBe(false);
    expect(b.state).toEqual(before);
  });

  it('借灯触发善贾后狐火费用为0且仍按获得灯火条件化解11点', () => {
    const b = new Battle(38);
    const borrowed = take(b, 'feichuan_002');
    const foxfire = take(b, 'feichuan_001');
    expect(b.play(borrowed.InstanceID).Ok).toBe(true);
    expect(b.cost(foxfire)).toBe(0);
    expect(b.play(foxfire.InstanceID).Ok).toBe(true);
    expect(b.state.Obsession).toBe(19);
    expect(b.state.CombatTraitDiscountActive).toBe(false);
  });

  it('狐火强化只依赖本回合获得过灯火，即使善贾已被其他牌消费仍为11', () => {
    const b = new Battle(39);
    b.play(take(b, 'common_003').InstanceID);
    b.play(take(b, 'common_001').InstanceID);
    expect(b.state.CombatTraitDiscountActive).toBe(false);
    b.play(take(b, 'feichuan_001').InstanceID);
    expect(b.state.Obsession).toBe(15);
  });

  it('迟疑、讨价还价和善贾可叠加在同一卡实例且最低费用为0', () => {
    const b = new Battle(40);
    const bargain = take(b, 'feichuan_003');
    const target = take(b, 'common_002');
    const source = [b.state.Hand, b.state.DrawPile, b.state.DiscardPile].find(pile => pile.some(card => card !== target && card.DefinitionID === 'common_002'))!;
    const sameIndex = source.findIndex(card => card !== target && card.DefinitionID === 'common_002');
    const [sameDefinition] = source.splice(sameIndex, 1);
    if (source !== b.state.Hand) b.state.Hand.push(sameDefinition);
    target.CostModifiers.push({ Source: 'intent_hesitate', Amount: 1, ExpiresAtTurn: 1 });
    expect(b.play(bargain.InstanceID, [target.InstanceID]).Ok).toBe(true);
    expect(getCost(target, 1)).toBe(2);
    expect(getCost(sameDefinition, 1)).toBe(2);
    b.play(take(b, 'common_003').InstanceID);
    expect(b.cost(target)).toBe(1);
    target.CostModifiers.push({ Source: 'test-floor', Amount: -5, ExpiresAtTurn: 1 });
    expect(b.cost(target)).toBe(0);
  });

  it('借灯债务可叠加、只应用一次，新对局不继承运行时状态', () => {
    const b = new Battle(41);
    const first = take(b, 'feichuan_002');
    const second: CardInstance = { InstanceID: 'second-borrow', DefinitionID: 'feichuan_002', IsTemporary: false, CostModifiers: [] };
    b.state.Hand.push(second);
    b.play(first.InstanceID);
    b.play(second.InstanceID);
    expect(b.state.PendingLightModifier).toBe(-2);
    b.state.CurrentIntent = { IntentID: 'intent_close' };
    finishTurn(b);
    expect(b.state.Light).toBe(1);
    finishTurn(b);
    expect(b.state.Light).toBe(3);
    const restarted = new Battle(41);
    expect(restarted.state.PendingLightModifier).toBe(0);
    expect(restarted.state.GainedLightThisTurn).toBe(false);
    expect(restarted.state.CombatTraitDiscountActive).toBe(false);
    expect(allCards(restarted).every(card => card.CostModifiers.length === 0)).toBe(true);
  });

  it('第6回合狐火归零立即成功且不执行预告Intent', () => {
    const b = new Battle(42);
    for (let turn = 1; turn < 6; turn++) finishTurn(b);
    const foxfire = take(b, 'feichuan_001');
    b.state.Obsession = 8;
    b.state.CurrentIntent = { IntentID: 'intent_burden', BurdenCardID: 'burden_002' };
    const burdenCount = allCards(b).filter(card => card.DefinitionID === 'burden_002').length;
    expect(b.play(foxfire.InstanceID).Ok).toBe(true);
    expect(b.state.Status).toBe('won');
    expect(allCards(b).filter(card => card.DefinitionID === 'burden_002')).toHaveLength(burdenCount);
  });
});

describe('内容校验', () => {
  it('拒绝重复 ID、负费用和未知效果', () => {
    expect(() => new CardDatabase([...cardsData, cardsData[0]])).toThrow('ID');
    expect(() => new CardDatabase([{ ...cardsData[0], cost: -1 }])).toThrow('费用');
    expect(() => new CardDatabase([{ ...cardsData[0], effect: { type: 'damage', value: 1 } }])).toThrow('效果');
  });
  it('拒绝不支持的弃牌顺序、临时牌、错误目标', () => {
    expect(() => new CardDatabase([{ ...cardsData[0], effect: [{ type: 'draw_card', value: 1 }, { type: 'discard_and_draw', discard: 1, draw: 1 }] }])).toThrow('弃牌');
    expect(() => new CardDatabase([{ ...cardsData[0], art: 'wrong.png' }])).toThrow('插图');
    expect(() => new CardDatabase([{ ...cardsData[0], target: 'Enemy' }])).toThrow('目标');
  });
});
