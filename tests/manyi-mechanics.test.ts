import { describe, expect, it } from 'vitest';
import { Battle } from '../src/core/battle';
import { configuredStartingDeck, defaultEditableDeck, LEGACY_UNLOCKED_CARDS, validateEditableDeck } from '../src/core/deck-editor';
import { createDefaultSaveGame } from '../src/infrastructure/save/save-schema';

describe('《满溢》战斗与牌组规则', () => {
  it('旧15张局内牌组之外提供合法、独立的12张局外默认牌组', () => {
    const profile = createDefaultSaveGame().profile;
    const deck = configuredStartingDeck(profile, 'feichuan');
    expect(deck).toEqual(defaultEditableDeck('feichuan'));
    expect(deck).toHaveLength(12);
    expect(validateEditableDeck(deck, 'feichuan', new Set(LEGACY_UNLOCKED_CARDS))).toBeNull();
    expect(validateEditableDeck([...deck, 'common_001'], 'feichuan', new Set(LEGACY_UNLOCKED_CARDS))).not.toBeNull();
    expect(validateEditableDeck(['burden_003', ...deck.slice(1)], 'feichuan', new Set(LEGACY_UNLOCKED_CARDS))).toContain('浊念');
    expect(validateEditableDeck(['common_007', ...deck.slice(1)], 'feichuan', new Set(LEGACY_UNLOCKED_CARDS))).toContain('尚未永久解锁');
  });

  it('构筑边界、单卡上限与角色归属都在保存前校验', () => {
    const unlocked = new Set([...LEGACY_UNLOCKED_CARDS, 'common_007', 'common_008', 'feichuan_004']);
    const six = ['common_001', 'common_001', 'common_002', 'common_002', 'common_003', 'common_003'];
    expect(validateEditableDeck(six.slice(0, 5), 'feichuan', unlocked)).toContain('6～12');
    expect(validateEditableDeck(six, 'feichuan', unlocked)).toBeNull();
    expect(validateEditableDeck(defaultEditableDeck('feichuan'), 'feichuan', unlocked)).toBeNull();
    expect(validateEditableDeck([...six, 'common_001'], 'feichuan', unlocked)).toContain('最多配置2张');
    expect(validateEditableDeck([...six.slice(0, 5), 'feichuan_004'], 'moyu', unlocked)).toContain('其他摆渡人');
    const profile = createDefaultSaveGame().profile;
    profile.startingDecks = { feichuan: six, moyu: [...six, 'common_004'] };
    expect(configuredStartingDeck(profile, 'feichuan')).toEqual(six);
    expect(configuredStartingDeck(profile, 'moyu')).toHaveLength(7);
    const copied = configuredStartingDeck(profile, 'feichuan');
    copied.push('common_006');
    expect(profile.startingDecks.feichuan).toHaveLength(6);
  });

  it('清账只移除选中的浊念，虚账复制有上限', () => {
    const deck = ['common_008', 'burden_003', 'common_001', 'common_002', 'common_003'];
    const battle = new Battle(8, 'manyi-debt', 'feichuan', deck, {
      SoulID: 'manyi-ledger-merchant', StartingObsession: 80, MaxRounds: 12,
      InitialDraw: 5, CardsPerTurn: 5, HandSize: 100, BaseLight: 10,
      IntentPool: [{ IntentID: 'intent_account_inflation', BurdenCardID: 'burden_003' }],
    });
    const clear = battle.state.Hand.find(card => card.DefinitionID === 'common_008')!;
    const debt = battle.state.Hand.find(card => card.DefinitionID === 'burden_003')!;
    expect(battle.play(clear.InstanceID, [debt.InstanceID])).toEqual({ Ok: true });
    expect(battle.state.ExhaustPile.some(card => card.InstanceID === debt.InstanceID)).toBe(true);
    expect(battle.state.Obsession).toBe(78);
    for (let turn = 0; turn < 8 && battle.state.Status === 'playing'; turn++) expect(battle.endTurn()).toEqual({ Ok: true });
    const count = [...battle.state.DrawPile, ...battle.state.Hand, ...battle.state.DiscardPile].filter(card => card.DefinitionID === 'burden_003').length;
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(6);
  });

  it('借势与善贾联动，额外化解仅作用于下一张普通牌', () => {
    const battle = new Battle(11, 'manyi-leverage', 'feichuan', ['feichuan_004', 'common_001'], {
      SoulID: 'manyi-merchant', StartingObsession: 30, InitialDraw: 2, BaseLight: 2,
    });
    const borrow = battle.state.Hand.find(card => card.DefinitionID === 'feichuan_004')!;
    const soothe = battle.state.Hand.find(card => card.DefinitionID === 'common_001')!;
    expect(battle.play(borrow.InstanceID)).toEqual({ Ok: true });
    expect(battle.state.CombatTraitDiscountActive).toBe(true);
    expect(battle.cost(soothe)).toBe(0);
    expect(battle.play(soothe.InstanceID)).toEqual({ Ok: true });
    expect(battle.state.Obsession).toBe(24);
    expect(battle.state.PendingNormalObsessionBonus).toBe(0);
  });

  it('最终战按聚财、负债、无尽三阶段推进，单次高伤不能跳阶段', () => {
    const battle = new Battle(9, 'manyi-boss', 'feichuan', Array(8).fill('common_001'), {
      SoulID: 'manyi-chiying-full', StartingObsession: 20, PhaseThresholds: [15, 5], InitialDraw: 8, BaseLight: 20,
    });
    for (let index = 0; index < 2; index++) expect(battle.play(battle.state.Hand[0]!.InstanceID)).toEqual({ Ok: true });
    expect(battle.state.BossPhase).toBe(2);
    expect(battle.state.Obsession).toBe(15);
    for (let index = 0; index < 3; index++) expect(battle.play(battle.state.Hand[0]!.InstanceID)).toEqual({ Ok: true });
    expect(battle.state.BossPhase).toBe(3);
    expect(battle.state.Obsession).toBe(5);
    for (let index = 0; index < 2; index++) expect(battle.play(battle.state.Hand[0]!.InstanceID)).toEqual({ Ok: true });
    expect(battle.state.Status).toBe('won');
  });
});
