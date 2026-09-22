import type { BattleState, CardInstance } from './types';

export function random(state: Pick<BattleState, 'RandomState'>): number {
  state.RandomState = (state.RandomState + 0x6D2B79F5) >>> 0;
  let value = state.RandomState;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

export function shuffle(cards: CardInstance[], state: Pick<BattleState, 'RandomState'>): void {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(random(state) * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
}

export function drawCards(state: BattleState, count: number): number {
  let drawn = 0;
  const allowed = Math.max(0, Math.min(count, state.HandSize - state.Hand.length));
  for (let i = 0; i < allowed; i++) {
    if (state.DrawPile.length === 0 && state.DiscardPile.length > 0) {
      state.DrawPile.push(...state.DiscardPile.splice(0));
      shuffle(state.DrawPile, state);
      state.Log.push('将弃牌重新洗入牌库。');
    }
    const card = state.DrawPile.pop();
    if (!card) break;
    state.Hand.push(card);
    drawn++;
  }
  return drawn;
}
