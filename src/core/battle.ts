import { character, getCard, soul, startingDeck } from './content';
import { drawCards, random, shuffle } from './deck';
import { applyEffect } from './effects';
import { BattleEvents } from './events';
import { BattleConfig, randomIntent, resolveIntent } from './intents';
import type { ActionResult, BattleState, CardInstance } from './types';

export function getCost(card: CardInstance, turn: number): number {
  return Math.max(0, getCard(card.DefinitionID).Cost + card.CostModifiers.filter(mod => mod.ExpiresAtTurn >= turn).reduce((sum, mod) => sum + mod.Amount, 0));
}
export function discardCount(card: CardInstance): number {
  return getCard(card.DefinitionID).Effects.filter(effect => effect.Type === 'DiscardCard').reduce((sum, effect) => sum + effect.Amount, 0);
}

export class Battle {
  readonly state: BattleState;
  readonly events = new BattleEvents();
  private busy = false;
  private nextInstanceNumber: number;

  constructor(seed: number, battleID = `battle-${seed}`) {
    this.state = {
      BattleID: battleID, Seed: seed >>> 0, RandomState: seed >>> 0,
      Turn: 1, MaxTurns: BattleConfig.maxRounds, Light: 3, BaseLight: 3, HandSize: 5,
      Obsession: soul.Obsession, MaxObsession: soul.Obsession, Status: 'playing',
      Phase: 'ROUND_START', CurrentIntent: { IntentID: 'intent_close' }, PendingLightModifier: 0, PendingCostIncrease: 0,
      CharacterID: character.CharacterID, SoulID: soul.SoulID,
      DrawPile: startingDeck.map((id, index) => ({ InstanceID: `card-${index + 1}`, DefinitionID: id, IsTemporary: false, CostModifiers: [] })),
      Hand: [], DiscardPile: [], Resolving: [], ExhaustPile: [],
      Stats: { CardsPlayed: 0, TemporaryCardsPlayed: 0 }, Log: ['抵达渡口。今夜，从一盏灯开始。'],
    };
    this.nextInstanceNumber = this.state.DrawPile.length + 1;
    shuffle(this.state.DrawPile, this.state);
    this.startTurn();
  }

  reasonUnavailable(instanceID: string): string | null {
    const state = this.state;
    if (state.Status !== 'playing') return '本场渡魂已经结束。';
    if (state.Phase !== 'PLAYER_TURN') return '当前不在玩家行动阶段。';
    if (this.busy) return '正在处理上一张牌。';
    const card = state.Hand.find(item => item.InstanceID === instanceID);
    if (!card) return '这张牌不在手中。';
    if (getCard(card.DefinitionID).PlayBehavior === 'unplayable') return '「踌躇」无法主动使用。';
    if (state.Light < getCost(card, state.Turn)) return '灯火不足，试试添灯或结束回合。';
    const discardable = state.Hand.filter(item => item.InstanceID !== instanceID && getCard(item.DefinitionID).DataType === 'normal').length;
    if (discardable < discardCount(card)) return `需要至少 ${discardCount(card)} 张可弃置的普通手牌。`;
    return null;
  }

  play(instanceID: string, selected: readonly string[] = []): ActionResult {
    const unavailable = this.reasonUnavailable(instanceID);
    if (unavailable) return { Ok: false, Message: unavailable };
    const state = this.state;
    const index = state.Hand.findIndex(card => card.InstanceID === instanceID);
    const card = state.Hand[index];
    const definition = getCard(card.DefinitionID);
    if (selected.length !== discardCount(card) || new Set(selected).size !== selected.length || selected.some(id => {
      const selectedCard = state.Hand.find(item => item.InstanceID === id);
      return id === instanceID || !selectedCard || getCard(selectedCard.DefinitionID).DataType === 'burden';
    })) {
      return { Ok: false, Message: `请选择 ${discardCount(card)} 张不同的可弃置普通手牌。` };
    }
    this.busy = true;
    state.Phase = 'RESOLVING_CARD';
    try {
      state.Light -= getCost(card, state.Turn);
      state.Hand.splice(index, 1);
      state.Resolving.push(card);
      state.Log.push(`使用「${definition.Name}」。`);
      for (const effect of definition.Effects) applyEffect(effect, state, selected, this.events);
      state.Resolving.pop();
      if (definition.PlayBehavior === 'exhaust') state.ExhaustPile.push(card);
      else state.DiscardPile.push(card);
      state.Stats.CardsPlayed++;
      if (card.IsTemporary) state.Stats.TemporaryCardsPlayed++;
      this.events.emit({ Type: 'OnCardPlayed', BattleID: state.BattleID, InstanceID: card.InstanceID, DefinitionID: card.DefinitionID });
      if (state.Obsession === 0) this.finish('won');
      else state.Phase = 'PLAYER_TURN';
      return { Ok: true };
    } finally { this.busy = false; }
  }

  endTurn(): ActionResult {
    if (this.state.Status !== 'playing' || this.state.Phase !== 'PLAYER_TURN' || this.busy) return { Ok: false, Message: '当前不能结束回合。' };
    this.busy = true;
    try {
      const state = this.state;
      state.Phase = 'TURN_END';
      const retainedBurden: CardInstance[] = [];
      for (const card of state.Hand.splice(0)) {
        if (getCard(card.DefinitionID).DataType === 'burden') retainedBurden.push(card);
        else {
          state.DiscardPile.push(card);
          this.events.emit({ Type: 'OnCardDiscarded', BattleID: state.BattleID, InstanceID: card.InstanceID, Reason: 'turn-end' });
        }
      }
      state.Hand.push(...retainedBurden);
      state.Log.push(`第 ${state.Turn} 回合结束。`);
      if (state.Obsession <= 0) { state.Obsession = 0; this.finish('won'); return { Ok: true }; }
      state.Phase = 'RESOLVING_INTENT';
      resolveIntent(state, (cardID, destination) => this.addBurden(cardID, destination));
      if (state.Obsession <= 0) { state.Obsession = 0; this.finish('won'); }
      else if (state.Turn >= state.MaxTurns) this.finish('lost');
      else { state.Turn++; this.startTurn(); }
      return { Ok: true };
    } finally { this.busy = false; }
  }

  private startTurn(): void {
    const state = this.state;
    state.Phase = 'ROUND_START';
    for (const card of [...state.DrawPile, ...state.Hand, ...state.DiscardPile]) card.CostModifiers = card.CostModifiers.filter(mod => mod.ExpiresAtTurn >= state.Turn);
    state.Light = Math.max(0, state.BaseLight + state.PendingLightModifier);
    state.PendingLightModifier = 0;
    drawCards(state, Math.max(0, state.HandSize - state.Hand.length));
    if (state.PendingCostIncrease > 0) {
      const candidates = state.Hand.filter(card => getCard(card.DefinitionID).DataType === 'normal');
      if (candidates.length) {
        const card = candidates[Math.floor(random(state) * candidates.length)];
        card.CostModifiers.push({ Source: 'intent_hesitate', Amount: state.PendingCostIncrease, ExpiresAtTurn: state.Turn });
        state.Log.push(`「${getCard(card.DefinitionID).Name}」本回合费用 +${state.PendingCostIncrease}。`);
      }
      state.PendingCostIncrease = 0;
    }
    state.CurrentIntent = randomIntent(state);
    state.Phase = 'PLAYER_TURN';
    state.Log.push(`第 ${state.Turn} 回合 · 灯火 ${state.Light}，手牌 ${state.Hand.length}。`);
    this.events.emit({ Type: 'OnTurnStart', BattleID: state.BattleID, Turn: state.Turn });
  }

  private finish(result: 'won' | 'lost'): void {
    const state = this.state;
    if (state.Status !== 'playing') return;
    state.Status = result;
    state.Phase = 'RESULT';
    state.Log.push(result === 'won' ? '执念已释，渡魂成功。' : '天色渐明，今夜暂未完成。');
    this.events.emit({ Type: 'OnBattleEnd', BattleID: state.BattleID, Result: result, Stats: Object.freeze({ ...state.Stats }) });
  }

  private addBurden(definitionID: string, destination: 'draw_random' | 'hand'): CardInstance {
    const card: CardInstance = { InstanceID: `card-${this.nextInstanceNumber++}`, DefinitionID: definitionID, IsTemporary: false, CostModifiers: [] };
    getCard(definitionID);
    if (destination === 'hand') this.state.Hand.push(card);
    else this.state.DrawPile.splice(Math.floor(random(this.state) * (this.state.DrawPile.length + 1)), 0, card);
    return card;
  }
}
