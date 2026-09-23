import rawTraits from '../data/traits.json';
import type { BattleState } from './types';

export interface TraitData {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly glowColor: string;
  readonly description: string;
}

const traits = new Map<string, TraitData>(rawTraits.map(raw => {
  if (!raw.id || !raw.name || !raw.icon || !raw.glowColor || !raw.description) throw new Error('角色特性数据无效');
  return [raw.id, Object.freeze({ ...raw })];
}));

export function getTrait(id: string): TraitData {
  const trait = traits.get(id);
  if (!trait) throw new Error(`未知角色特性：${id}`);
  return trait;
}

export function onLightGained(state: BattleState): boolean {
  state.GainedLightThisTurn = true;
  if (state.CombatTraitID !== 'good_merchant' || state.CombatTraitTriggeredThisTurn) return false;
  state.CombatTraitTriggeredThisTurn = true;
  state.CombatTraitDiscountActive = true;
  return true;
}

export function resetTurnTraitState(state: BattleState): void {
  state.GainedLightThisTurn = false;
  state.CombatTraitTriggeredThisTurn = false;
  state.CombatTraitDiscountActive = false;
}
