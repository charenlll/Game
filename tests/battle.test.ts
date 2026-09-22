import { describe, expect, it } from 'vitest';
import { Battle, getCost } from '../src/core/battle';
import { getCard } from '../src/core/content';
import { CardDatabase } from '../src/core/card-database';
import cardsData from '../src/data/cards.json';
import type { CardInstance } from '../src/core/types';

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

describe('对局规则', () => {
  it('初始化 12 张牌、5 手牌、3 灯火、30 执念', () => {
    const b = new Battle(123);
    expect(b.state.Hand).toHaveLength(5);
    expect(b.state.DrawPile).toHaveLength(7);
    expect(b.state.Light).toBe(3);
    expect(b.state.Obsession).toBe(30);
    expect(b.state.Turn).toBe(1);
    expect(new Set(allCards(b).map(card => card.InstanceID)).size).toBe(12);
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
      b.endTurn();
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
    b.endTurn(); expect(b.state.Light).toBe(3); expect(b.state.Hand).toHaveLength(5);
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
    expect(allCards(b)).toHaveLength(12);
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
    expect(b.state.Hand).toHaveLength(count);
    expect(b.state.Resolving).toHaveLength(0);
  });
  it('第6回合仍可成功', () => {
    const b = new Battle(3); for (let i = 0; i < 5; i++) b.endTurn();
    expect(b.state.Turn).toBe(6); expect(b.state.Status).toBe('playing');
    const card = take(b, 'common_001'); b.state.Obsession = 4;
    b.play(card.InstanceID); expect(b.state.Status).toBe('won');
  });
  it('结束第6回合并执行Intent后才失败，结束事件只发一次', () => {
    const b = new Battle(3); let ends = 0;
    b.events.subscribe(event => { if (event.Type === 'OnBattleEnd') ends++; });
    for (let i = 0; i < 6; i++) b.endTurn();
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
    const old = new Battle(1); old.endTurn(); old.endTurn(); old.endTurn(); old.endTurn(); old.state.Light = 100;
    const fresh = new Battle(1); expect(fresh.state).toEqual(new Battle(1).state);
    expect(fresh.events).not.toBe(old.events); expect(fresh.state.Hand).not.toBe(old.state.Hand);
    expect(fresh.state.PendingCostIncrease).toBe(0); expect(fresh.state.PendingLightModifier).toBe(0);
    expect(fresh.state.ExhaustPile).toEqual([]); expect(fresh.state.CurrentIntent).toEqual(new Battle(1).state.CurrentIntent);
  });
  it('费用修正不过期时生效，最低为0，不污染卡牌定义', () => {
    const b = new Battle(1); const card = take(b, 'common_001');
    card.CostModifiers.push({ Source: 'test', Amount: -3, ExpiresAtTurn: 1 });
    expect(getCost(card, 1)).toBe(0); expect(getCost(card, 2)).toBe(1); expect(getCard(card.DefinitionID).Cost).toBe(1);
    b.endTurn(); expect(card.CostModifiers).toHaveLength(0);
  });
  it('事件监听可移除，结算期间拒绝再次操作', () => {
    const b = new Battle(1); const card = take(b, 'common_001'); let calls = 0;
    const unsubscribe = b.events.subscribe(() => { calls++; expect(b.endTurn().Ok).toBe(false); });
    b.play(card.InstanceID); unsubscribe(); b.endTurn(); expect(calls).toBe(1);
  });
  it('多个种子和连续回合下牌数量与实例唯一性保持不变', () => {
    for (let seed = 0; seed < 30; seed++) {
      const b = new Battle(seed);
      for (let turn = 0; turn < 6 && b.state.Status === 'playing'; turn++) {
        for (const card of [...b.state.Hand]) if (card.DefinitionID !== 'common_005') b.play(card.InstanceID);
        expect(allCards(b).length).toBeGreaterThanOrEqual(12);
        expect(new Set(allCards(b).map(card => card.InstanceID)).size).toBe(allCards(b).length);
        expect(b.state.Light).toBeGreaterThanOrEqual(0);
        if (b.state.Status === 'playing') b.endTurn();
      }
    }
  });
  it('Intent由种子随机决定且每种效果独立执行', () => {
    expect(new Battle(7).state.CurrentIntent).toEqual(new Battle(7).state.CurrentIntent);
    expect(new Set(Array.from({ length: 30 }, (_, seed) => new Battle(seed).state.CurrentIntent.IntentID)).size).toBeGreaterThan(1);
    const b = new Battle(7);
    b.state.CurrentIntent = { IntentID: 'intent_hesitation_spread', BurdenCardID: 'burden_001' };
    b.endTurn();
    expect([...b.state.DrawPile, ...b.state.Hand].filter(card => card.DefinitionID === 'burden_001')).toHaveLength(1);
    expect(b.state.DiscardPile.some(card => card.DefinitionID === 'burden_001')).toBe(false);
    expect(allCards(b).some(card => card.DefinitionID === 'burden_002')).toBe(false);
    b.state.CurrentIntent = { IntentID: 'intent_close' };
    b.state.Obsession = 28; b.endTurn();
    expect(b.state.Obsession).toBe(30);
    b.state.CurrentIntent = { IntentID: 'intent_burden', BurdenCardID: 'burden_002' };
    b.endTurn();
    expect(b.state.Hand.filter(card => card.DefinitionID === 'burden_002')).toHaveLength(1);
    expect(b.state.DiscardPile.some(card => card.DefinitionID === 'burden_002')).toBe(false);
    expect(allCards(b).filter(card => card.DefinitionID === 'burden_001')).toHaveLength(1);
  });
  it('迟疑只为下一回合一张正常手牌增加1费并随后恢复', () => {
    const b = new Battle(8);
    const baseCosts = new Map(allCards(b).map(card => [card.InstanceID, getCard(card.DefinitionID).Cost]));
    b.state.CurrentIntent = { IntentID: 'intent_hesitate' };
    b.endTurn();
    const modified = b.state.Hand.filter(card => card.CostModifiers.some(mod => mod.Source === 'intent_hesitate'));
    expect(modified).toHaveLength(1);
    expect(getCost(modified[0], 2)).toBe(baseCosts.get(modified[0].InstanceID)! + 1);
    b.state.CurrentIntent = { IntentID: 'intent_close' };
    b.endTurn();
    expect(allCards(b).every(card => card.CostModifiers.every(mod => mod.Source !== 'intent_hesitate'))).toBe(true);
  });
  it('魂灯黯淡只让下一回合灯火减1', () => {
    const b = new Battle(9);
    b.state.CurrentIntent = { IntentID: 'intent_dim_light' };
    b.endTurn(); expect(b.state.Turn).toBe(2); expect(b.state.Light).toBe(2);
    b.state.CurrentIntent = { IntentID: 'intent_close' };
    b.endTurn(); expect(b.state.Turn).toBe(3); expect(b.state.Light).toBe(3);
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
    b.endTurn();
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
    b.endTurn();
    expect(b.state.Hand).toContain(burden);
    expect(b.state.DiscardPile).not.toContain(burden);
    expect(b.state.Hand).toHaveLength(5);
  });
  it('执念归零立即成功且阻止当回合Intent', () => {
    const b = new Battle(11); const card = take(b, 'common_001'); b.state.Obsession = 1;
    b.play(card.InstanceID);
    expect(b.state.Status).toBe('won');
    expect(allCards(b).some(item => item.DefinitionID === 'burden_001' || item.DefinitionID === 'burden_002')).toBe(false);
    expect(b.endTurn().Ok).toBe(false);
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
