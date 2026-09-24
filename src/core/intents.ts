import rawIntents from '../data/intents.json';
import { getCard } from './content';
import { random } from './deck';
import type { BattleState, IntentID, IntentInstance } from './types';

export const BattleConfig = Object.freeze({
  maxRounds: 6,
  initialDraw: 5,
  cardsPerTurn: 2,
  retainedHandLimit: 5,
  intentPool: [
    { IntentID: 'intent_hesitation_spread', BurdenCardID: 'burden_001' },
    { IntentID: 'intent_burden', BurdenCardID: 'burden_002' },
    { IntentID: 'intent_close' },
    { IntentID: 'intent_hesitate' },
    { IntentID: 'intent_dim_light' },
  ] as const satisfies readonly IntentInstance[],
});
export type IntentEffectType = 'restore_obsession' | 'next_cost' | 'add_burden' | 'next_light';
export interface IntentData { readonly id: IntentID; readonly name: string; readonly shortDescription: string; readonly longDescription: string; readonly effectType: IntentEffectType; readonly value: number }
const ids = new Set(BattleConfig.intentPool.map(intent => intent.IntentID));
export const intents = new Map<IntentID, IntentData>(rawIntents.map(raw => {
  if (!ids.has(raw.id as IntentID)) throw new Error(`未知Intent：${raw.id}`);
  return [raw.id as IntentID, Object.freeze(raw as IntentData)];
}));
export function getIntent(id: IntentID): IntentData { const intent = intents.get(id); if (!intent) throw new Error(`缺少Intent：${id}`); return intent; }
export function randomIntent(state: Pick<BattleState, 'RandomState'>, pool: readonly IntentInstance[] = BattleConfig.intentPool): IntentInstance {
  if (!pool.length) throw new Error('Intent池不能为空');
  return { ...pool[Math.floor(random(state) * pool.length)] };
}
export function getIntentDisplay(instance: IntentInstance): IntentData {
  const intent = getIntent(instance.IntentID);
  if (intent.effectType !== 'add_burden') return intent;
  if (!instance.BurdenCardID) throw new Error('杂念滋生缺少burdenCardId');
  const name = getCard(instance.BurdenCardID).Name;
  if (instance.IntentID === 'intent_hesitation_spread') return { ...intent, shortDescription: `牌堆加入1张「${name}」`, longDescription: `回合结束时，将1张「${name}」随机插入抽牌堆。抽入手牌后会持续占据一个位置，不能主动打出，也不能弃置。` };
  return { ...intent, shortDescription: `手牌加入1张「${name}」`, longDescription: `回合结束时，将1张「${name}」直接加入当前手牌。它不能弃置，只有支付1灯火主动处理后才会进入消耗牌堆。` };
}

export function resolveIntent(state: BattleState, addBurden: (cardID: 'burden_001' | 'burden_002', destination: 'draw_random' | 'hand') => void): void {
  const intent = getIntentDisplay(state.CurrentIntent);
  switch (intent.effectType) {
    case 'restore_obsession': state.Obsession = Math.min(state.MaxObsession, state.Obsession + intent.value); break;
    case 'next_cost': state.PendingCostIncrease += intent.value; break;
    case 'add_burden': {
      if (!state.CurrentIntent.BurdenCardID) throw new Error(`${intent.id}缺少浊念牌ID`);
      addBurden(state.CurrentIntent.BurdenCardID, state.CurrentIntent.IntentID === 'intent_hesitation_spread' ? 'draw_random' : 'hand');
      break;
    }
    case 'next_light': state.PendingLightModifier += intent.value; break;
  }
  state.Log.push(`亡魂意图「${intent.name}」生效：${intent.shortDescription}。`);
}
