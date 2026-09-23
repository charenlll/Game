import { buildStartingDeck, cards, getCharacter } from './content';

export type RunStatus = 'battle' | 'reward' | 'completed' | 'failed';

export interface RunState {
  Seed: number;
  RandomState: number;
  SelectedCharacterID: string;
  CurrentEncounter: number;
  MaxEncounters: number;
  CompletedEncounters: number;
  RunDeck: string[];
  AcquiredCards: string[];
  Status: RunStatus;
}

function random(state: RunState): number {
  state.RandomState = (Math.imul(state.RandomState, 1664525) + 1013904223) >>> 0;
  return state.RandomState / 0x100000000;
}

export function createRun(characterID: string, seed: number): RunState {
  const character = getCharacter(characterID);
  return {
    Seed: seed >>> 0,
    RandomState: (seed ^ 0x9e3779b9) >>> 0,
    SelectedCharacterID: characterID,
    CurrentEncounter: 1,
    MaxEncounters: 3,
    CompletedEncounters: 0,
    RunDeck: [...buildStartingDeck(character)],
    AcquiredCards: [],
    Status: 'battle',
  };
}

export function battleSeed(state: RunState): number {
  return state.CurrentEncounter === 1 ? state.Seed : (state.Seed + Math.imul(state.CurrentEncounter - 1, 0x6d2b79f5)) >>> 0;
}

export function finishEncounter(state: RunState, result: 'won' | 'lost'): void {
  if (state.Status !== 'battle') throw new Error('当前不在战斗阶段');
  if (result === 'lost') { state.Status = 'failed'; return; }
  state.CompletedEncounters++;
  state.Status = state.CompletedEncounters >= state.MaxEncounters ? 'completed' : 'reward';
}

export function generateRewards(state: RunState): readonly string[] {
  if (state.Status !== 'reward') throw new Error('当前没有可领取的奖励');
  const pool = cards.filter(card => card.DataType === 'normal' && (card.OwnerCharacterID === null || card.OwnerCharacterID === state.SelectedCharacterID)).map(card => card.CardID);
  if (pool.length < 3) throw new Error('奖励池不足3张');
  const candidates = [...pool];
  for (let index = candidates.length - 1; index > 0; index--) {
    const target = Math.floor(random(state) * (index + 1));
    [candidates[index], candidates[target]] = [candidates[target], candidates[index]];
  }
  return Object.freeze(candidates.slice(0, 3));
}

export function claimReward(state: RunState, cardID: string, offered: readonly string[]): void {
  if (state.Status !== 'reward' || !offered.includes(cardID)) throw new Error('奖励选择无效');
  state.RunDeck.push(cardID);
  state.AcquiredCards.push(cardID);
  state.CurrentEncounter++;
  state.Status = 'battle';
}
