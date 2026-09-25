import { describe, expect, it } from 'vitest';
import { Battle } from '../src/core/battle';
import { endTurnDiscardCount } from '../src/core/battle';

describe('战斗快照恢复', () => {
  it('从中途快照恢复后，相同出牌与结束回合产生完全一致的牌堆和随机状态', () => {
    const encounter = {
      StartingObsession: 80, VictoryObsession: 0, BaseLight: 10,
      InitialDraw: 5, CardsPerTurn: 5, HandSize: 5, MaxRounds: 8,
      IntentSequence: [{ IntentID: 'intent_burden' as const, BurdenCardID: 'burden_002' as const }, { IntentID: 'intent_dim_light' as const }],
      IntentPool: [{ IntentID: 'intent_hesitate' as const }],
    };
    const original = new Battle(7821, 'snapshot-test', 'feichuan', Array(18).fill('common_002'), encounter);
    const firstCard = original.state.Hand.find(card => original.reasonUnavailable(card.InstanceID) === null);
    expect(firstCard).toBeDefined();
    expect(original.play(firstCard!.InstanceID).Ok).toBe(true);

    const snapshot = original.createSnapshot();
    const restored = Battle.restore(snapshot);
    expect(restored.createSnapshot()).toEqual(snapshot);
    const nextCardID = original.state.Hand.find(card => original.reasonUnavailable(card.InstanceID) === null)?.InstanceID;
    if (nextCardID) {
      expect(original.play(nextCardID).Ok).toBe(restored.play(nextCardID).Ok);
      expect(restored.createSnapshot()).toEqual(original.createSnapshot());
    }

    const originalDiscards = original.state.Hand.filter(card => card.DefinitionID === 'common_002').slice(0, endTurnDiscardCount(original.state)).map(card => card.InstanceID);
    const restoredDiscards = [...originalDiscards];
    expect(original.endTurn(originalDiscards).Ok).toBe(restored.endTurn(restoredDiscards).Ok);
    expect(restored.createSnapshot()).toEqual(original.createSnapshot());
    expect(restored.state.CurrentIntent.IntentID).toBe(original.state.CurrentIntent.IntentID);
  });
});
