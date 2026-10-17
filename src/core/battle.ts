import { buildStartingDeck, character, getCard, getCharacter, getSoul, soul } from './content';
import { drawCards, random, shuffle } from './deck';
import { applyEffect } from './effects';
import { BattleEvents } from './events';
import { BattleConfig, randomIntent, resolveIntent } from './intents';
import { getTrait, onLightGained, resetTurnTraitState } from './traits';
import type { ActionResult, BattleEncounterConfig, BattleState, CardInstance } from './types';

export interface BattleRuntimeSnapshot {
  state: BattleState;
  encounterConfig: BattleEncounterConfig;
  turnIndex: number;
  nextInstanceNumber: number;
}

export function getCost(card: CardInstance, turn: number, runtimeModifier = 0): number {
  return Math.max(0, getCard(card.DefinitionID).Cost + runtimeModifier + card.CostModifiers.filter(mod => mod.ExpiresAtTurn >= turn).reduce((sum, mod) => sum + mod.Amount, 0));
}
export function discardCount(card: CardInstance): number {
  return getCard(card.DefinitionID).Effects.filter(effect => effect.Type === 'DiscardCard').reduce((sum, effect) => sum + effect.Amount, 0);
}
export function selectionCount(card: CardInstance): number {
  const definition = getCard(card.DefinitionID);
  return definition.Effects.reduce((total, effect) => total + (effect.Type === 'DiscardCard' || effect.Type === 'ModifySelectedCost' || effect.Type === 'ExhaustSelectedBurden' ? effect.Amount > 0 ? effect.Amount : 1 : 0), 0);
}
export function selectsBurden(card: CardInstance): boolean { return getCard(card.DefinitionID).Effects.some(effect => effect.Type === 'ExhaustSelectedBurden'); }
export function endTurnDiscardCount(state: Pick<BattleState, 'Hand' | 'HandSize'>): number {
  const excess = Math.max(0, state.Hand.length - state.HandSize);
  const discardable = state.Hand.filter(card => getCard(card.DefinitionID).DataType === 'normal').length;
  return Math.min(excess, discardable);
}

export class Battle {
  readonly state: BattleState;
  readonly events = new BattleEvents();
  private busy = false;
  private nextInstanceNumber: number;
  private turnIndex = 0;
  private readonly encounter: Required<Pick<BattleEncounterConfig, 'SoulID' | 'StartingObsession' | 'VictoryObsession' | 'MaxRounds' | 'InitialDraw' | 'CardsPerTurn' | 'HandSize' | 'BaseLight'>> & BattleEncounterConfig;

  constructor(seed: number, battleID = `battle-${seed}`, characterID = character.CharacterID, deckOverride?: readonly string[], encounter: BattleEncounterConfig = {}, snapshot?: BattleRuntimeSnapshot) {
    const selectedCharacter = getCharacter(characterID);
    const selectedSoul = getSoul(encounter.SoulID ?? soul.SoulID);
    const startingObsession = encounter.StartingObsession ?? selectedSoul.Obsession;
    const victoryObsession = encounter.VictoryObsession ?? 0;
    if (!Number.isInteger(startingObsession) || startingObsession <= 0 || !Number.isInteger(victoryObsession) || victoryObsession < 0 || victoryObsession >= startingObsession) throw new Error('战斗执念配置无效');
    this.encounter = {
      ...encounter,
      SoulID: selectedSoul.SoulID,
      StartingObsession: startingObsession,
      VictoryObsession: victoryObsession,
      MaxRounds: encounter.MaxRounds ?? BattleConfig.maxRounds,
      InitialDraw: encounter.InitialDraw ?? BattleConfig.initialDraw,
      CardsPerTurn: encounter.CardsPerTurn ?? BattleConfig.cardsPerTurn,
      HandSize: encounter.HandSize ?? BattleConfig.retainedHandLimit,
      BaseLight: encounter.BaseLight ?? 3,
    };
    if (!Number.isInteger(this.encounter.MaxRounds) || this.encounter.MaxRounds < 1) throw new Error('战斗回合配置无效');
    if (this.encounter.IntentPool && !this.encounter.IntentPool.length) throw new Error('Intent池不能为空');
    if (snapshot) {
      if (snapshot.state.BattleID !== battleID || snapshot.state.CharacterID !== selectedCharacter.CharacterID || snapshot.state.SoulID !== selectedSoul.SoulID) throw new Error('战斗快照与遭遇配置不匹配');
      if (!Number.isSafeInteger(snapshot.turnIndex) || snapshot.turnIndex < 0 || !Number.isSafeInteger(snapshot.nextInstanceNumber) || snapshot.nextInstanceNumber < 1) throw new Error('战斗快照游标无效');
      this.state = structuredClone(snapshot.state);
      this.state.PendingNormalObsessionBonus ??= 0;
      this.state.BossPhase ??= 1;
      this.turnIndex = snapshot.turnIndex;
      this.nextInstanceNumber = snapshot.nextInstanceNumber;
      return;
    }
    const selectedDeck = deckOverride ? [...deckOverride] : [...buildStartingDeck(selectedCharacter)];
    if (!selectedDeck.length) throw new Error('战斗牌组不能为空');
    selectedDeck.forEach(getCard);
    if (selectedCharacter.CombatTrait) getTrait(selectedCharacter.CombatTrait);
    this.state = {
      BattleID: battleID, Seed: seed >>> 0, RandomState: seed >>> 0,
      Turn: 1, MaxTurns: this.encounter.MaxRounds, Light: this.encounter.BaseLight, BaseLight: this.encounter.BaseLight, HandSize: this.encounter.HandSize,
      Obsession: this.encounter.StartingObsession, MaxObsession: this.encounter.StartingObsession, Status: 'playing',
      Phase: 'ROUND_START', CurrentIntent: { IntentID: 'intent_close' }, PendingLightModifier: 0, PendingCostIncrease: 0,
      CombatTraitID: selectedCharacter.CombatTrait, GainedLightThisTurn: false, CombatTraitTriggeredThisTurn: false, CombatTraitDiscountActive: false,
      PendingNormalObsessionBonus: 0, BossPhase: 1,
      CharacterID: selectedCharacter.CharacterID, SoulID: selectedSoul.SoulID,
      DrawPile: selectedDeck.map((id, index) => ({ InstanceID: `card-${index + 1}`, DefinitionID: id, IsTemporary: false, CostModifiers: [] })),
      Hand: [], DiscardPile: [], Resolving: [], ExhaustPile: [],
      Stats: { CardsPlayed: 0, TemporaryCardsPlayed: 0 }, Log: ['抵达渡口。今夜，从一盏灯开始。'],
    };
    this.nextInstanceNumber = this.state.DrawPile.length + 1;
    shuffle(this.state.DrawPile, this.state);
    this.startTurn();
  }

  static restore(snapshot: BattleRuntimeSnapshot): Battle {
    return new Battle(snapshot.state.Seed, snapshot.state.BattleID, snapshot.state.CharacterID, [], snapshot.encounterConfig, snapshot);
  }

  createSnapshot(): BattleRuntimeSnapshot {
    if (this.busy || (this.state.Phase !== 'PLAYER_TURN' && this.state.Phase !== 'RESULT')) throw new Error('只能在完整规则动作提交后保存战斗快照');
    return {
      state: structuredClone(this.state),
      encounterConfig: structuredClone(this.encounter),
      turnIndex: this.turnIndex,
      nextInstanceNumber: this.nextInstanceNumber,
    };
  }

  cost(card: CardInstance): number {
    const traitDiscount = this.state.CombatTraitID === 'good_merchant' && this.state.CombatTraitDiscountActive && getCard(card.DefinitionID).DataType === 'normal' ? -1 : 0;
    return getCost(card, this.state.Turn, traitDiscount);
  }

  reasonUnavailable(instanceID: string): string | null {
    const state = this.state;
    if (state.Status !== 'playing') return '本场渡魂已经结束。';
    if (state.Phase !== 'PLAYER_TURN') return '当前不在玩家行动阶段。';
    if (this.busy) return '正在处理上一张牌。';
    const card = state.Hand.find(item => item.InstanceID === instanceID);
    if (!card) return '这张牌不在手中。';
    if (getCard(card.DefinitionID).PlayBehavior === 'unplayable') return '这张浊念无法主动使用。';
    if (state.Light < this.cost(card)) return '灯火不足，试试添灯或结束回合。';
    const needed = selectionCount(card);
    const candidates = state.Hand.filter(item => item.InstanceID !== instanceID && (selectsBurden(card) ? getCard(item.DefinitionID).DataType === 'burden' : getCard(item.DefinitionID).DataType === 'normal')).length;
    if (candidates < needed) return selectsBurden(card) ? '手牌中没有可清除的浊念。' : `需要至少 ${needed} 张其他普通手牌。`;
    return null;
  }

  play(instanceID: string, selected: readonly string[] = []): ActionResult {
    const unavailable = this.reasonUnavailable(instanceID);
    if (unavailable) return { Ok: false, Message: unavailable };
    const state = this.state;
    const index = state.Hand.findIndex(card => card.InstanceID === instanceID);
    const card = state.Hand[index];
    const definition = getCard(card.DefinitionID);
    if (selected.length !== selectionCount(card) || new Set(selected).size !== selected.length || selected.some(id => {
      const selectedCard = state.Hand.find(item => item.InstanceID === id);
      return id === instanceID || !selectedCard || (selectsBurden(card) ? getCard(selectedCard.DefinitionID).DataType !== 'burden' : getCard(selectedCard.DefinitionID).DataType === 'burden');
    })) {
      return { Ok: false, Message: `请选择 ${selectionCount(card)} 张有效目标。` };
    }
    this.busy = true;
    state.Phase = 'RESOLVING_CARD';
    try {
      const consumesTraitDiscount = state.CombatTraitID === 'good_merchant' && state.CombatTraitDiscountActive && definition.DataType === 'normal';
      state.Light -= this.cost(card);
      if (consumesTraitDiscount) state.CombatTraitDiscountActive = false;
      state.Hand.splice(index, 1);
      state.Resolving.push(card);
      state.Log.push(`使用「${definition.Name}」。`);
      for (const effect of definition.Effects) {
        const lightBefore = state.Light;
        applyEffect(effect, state, selected, this.events);
        if (state.Light > lightBefore && onLightGained(state)) this.events.emit({ Type: 'OnTraitTriggered', BattleID: state.BattleID, TraitID: state.CombatTraitID! });
      }
      if (definition.DataType === 'normal' && !definition.Effects.some(effect => effect.Type === 'ReduceObsession' || effect.Type === 'ConditionalReduceObsession') && (state.PendingNormalObsessionBonus ?? 0) > 0 && !definition.Effects.some(effect => effect.Type === 'ModifyNextNormalObsession')) {
        const reduced = Math.min(state.Obsession, state.PendingNormalObsessionBonus!);
        state.Obsession -= reduced;
        state.PendingNormalObsessionBonus = 0;
        state.Log.push(`借势额外化解 ${reduced} 点执念。`);
      }
      this.advanceBossPhase();
      state.Resolving.pop();
      if (definition.PlayBehavior === 'exhaust') state.ExhaustPile.push(card);
      else state.DiscardPile.push(card);
      state.Stats.CardsPlayed++;
      if (card.IsTemporary) state.Stats.TemporaryCardsPlayed++;
      this.events.emit({ Type: 'OnCardPlayed', BattleID: state.BattleID, InstanceID: card.InstanceID, DefinitionID: card.DefinitionID });
      if (state.Obsession <= this.encounter.VictoryObsession) {
        state.Obsession = this.encounter.VictoryObsession;
        this.finish('won');
      }
      else state.Phase = 'PLAYER_TURN';
      return { Ok: true };
    } finally { this.busy = false; }
  }

  endTurn(selected: readonly string[] = []): ActionResult {
    if (this.state.Status !== 'playing' || this.state.Phase !== 'PLAYER_TURN' || this.busy) return { Ok: false, Message: '当前不能结束回合。' };
    const required = endTurnDiscardCount(this.state);
    if (selected.length !== required || new Set(selected).size !== selected.length || selected.some(id => {
      const card = this.state.Hand.find(item => item.InstanceID === id);
      return !card || getCard(card.DefinitionID).DataType === 'burden';
    })) return { Ok: false, Message: required ? `请先选择 ${required} 张可弃置的普通手牌。` : '当前不需要弃牌。' };
    this.busy = true;
    try {
      const state = this.state;
      state.Phase = 'TURN_END';
      resetTurnTraitState(state);
      for (const id of selected) {
        const index = state.Hand.findIndex(card => card.InstanceID === id);
        const [card] = state.Hand.splice(index, 1);
        state.DiscardPile.push(card);
        state.Log.push(`回合结束时弃置「${getCard(card.DefinitionID).Name}」。`);
        this.events.emit({ Type: 'OnCardDiscarded', BattleID: state.BattleID, InstanceID: card.InstanceID, Reason: 'turn-end' });
      }
      state.Log.push(`第 ${state.Turn} 回合结束。`);
      const virtualDebts = state.Hand.filter(card => card.DefinitionID === 'burden_003');
      for (const _card of virtualDebts) this.addBurden('burden_003', 'discard');
      state.PendingNormalObsessionBonus = 0;
      state.Phase = 'RESOLVING_INTENT';
      resolveIntent(state, (cardID, destination) => this.addBurden(cardID, destination));
      if (state.Obsession <= this.encounter.VictoryObsession) {
        state.Obsession = this.encounter.VictoryObsession;
        this.finish('won');
      }
      else if (state.Turn >= state.MaxTurns) this.finish('lost');
      else { state.Turn++; this.startTurn(); }
      return { Ok: true };
    } finally { this.busy = false; }
  }

  private startTurn(): void {
    const state = this.state;
    state.Phase = 'ROUND_START';
    resetTurnTraitState(state);
    for (const card of [...state.DrawPile, ...state.Hand, ...state.DiscardPile]) card.CostModifiers = card.CostModifiers.filter(mod => mod.ExpiresAtTurn >= state.Turn);
    state.Light = Math.max(0, state.BaseLight + state.PendingLightModifier);
    state.PendingLightModifier = 0;
    drawCards(state, state.Turn === 1 ? this.encounter.InitialDraw : this.encounter.CardsPerTurn);
    if (state.PendingCostIncrease > 0) {
      const candidates = state.Hand.filter(card => getCard(card.DefinitionID).DataType === 'normal');
      if (candidates.length) {
        const card = candidates[Math.floor(random(state) * candidates.length)];
        card.CostModifiers.push({ Source: 'intent_hesitate', Amount: state.PendingCostIncrease, ExpiresAtTurn: state.Turn });
        state.Log.push(`「${getCard(card.DefinitionID).Name}」本回合费用 +${state.PendingCostIncrease}。`);
      }
      state.PendingCostIncrease = 0;
    }
    const scheduled = this.encounter.IntentSequence?.[this.turnIndex];
    state.CurrentIntent = randomIntent(state, scheduled ? [scheduled] : this.encounter.IntentPool ?? BattleConfig.intentPool);
    this.turnIndex++;
    state.Phase = 'PLAYER_TURN';
    state.Log.push(`第 ${state.Turn} 回合 · 灯火 ${state.Light}，手牌 ${state.Hand.length}。`);
    this.events.emit({ Type: 'OnTurnStart', BattleID: state.BattleID, Turn: state.Turn });
  }

  private finish(result: 'won' | 'lost'): void {
    const state = this.state;
    if (state.Status !== 'playing') return;
    state.Status = result;
    state.Phase = 'RESULT';
    state.Log.push(result === 'won' ? this.encounter.CompletionLog ?? '执念已释，渡魂成功。' : '天色渐明，今夜暂未完成。');
    this.events.emit({ Type: 'OnBattleEnd', BattleID: state.BattleID, Result: result, Stats: Object.freeze({ ...state.Stats }) });
  }

  private advanceBossPhase(): void {
    const thresholds = this.encounter.PhaseThresholds;
    if (!thresholds?.length) return;
    const phase = this.state.BossPhase ?? 1;
    const threshold = thresholds[phase - 1];
    if (threshold === undefined || this.state.Obsession > threshold) return;
    this.state.Obsession = threshold;
    this.state.BossPhase = phase + 1;
    this.state.Log.push(`满溢进入第 ${phase + 1} 阶段。`);
  }

  private addBurden(definitionID: string, destination: 'draw_random' | 'hand' | 'discard'): CardInstance | null {
    if (definitionID === 'burden_003' && [...this.state.DrawPile, ...this.state.Hand, ...this.state.DiscardPile, ...this.state.Resolving].filter(card => card.DefinitionID === 'burden_003').length >= 6) {
      this.state.Log.push('虚账已达本场上限，未再复制。');
      return null;
    }
    const card: CardInstance = { InstanceID: `card-${this.nextInstanceNumber++}`, DefinitionID: definitionID, IsTemporary: false, CostModifiers: [] };
    getCard(definitionID);
    if (destination === 'hand') this.state.Hand.push(card);
    else if (destination === 'discard') this.state.DiscardPile.push(card);
    else this.state.DrawPile.splice(Math.floor(random(this.state) * (this.state.DrawPile.length + 1)), 0, card);
    return card;
  }
}
