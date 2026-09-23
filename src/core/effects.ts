import { drawCards } from './deck';
import { getCard } from './content';
import type { BattleEvents } from './events';
import type { BattleState, CardEffect } from './types';

export function applyEffect(effect: CardEffect, state: BattleState, selected: readonly string[], events: BattleEvents): void {
  switch (effect.Type) {
    case 'ReduceObsession': {
      const reduced = Math.min(state.Obsession, effect.Amount);
      state.Obsession -= reduced;
      state.Log.push(`执念减少 ${reduced} 点。`);
      break;
    }
    case 'ConditionalReduceObsession': {
      const amount = effect.Amount + (state.GainedLightThisTurn ? effect.Bonus : 0);
      const reduced = Math.min(state.Obsession, amount);
      state.Obsession -= reduced;
      state.Log.push(`执念减少 ${reduced} 点。`);
      break;
    }
    case 'GainLight':
      state.Light += effect.Amount;
      state.Log.push(`灯火增加 ${effect.Amount} 点。`);
      break;
    case 'DrawCard':
      state.Log.push(`抽取 ${drawCards(state, effect.Amount)} 张牌。`);
      break;
    case 'ModifyNextRoundLight':
      state.PendingLightModifier += effect.Amount;
      state.Log.push(`下一回合灯火 ${effect.Amount}。`);
      break;
    case 'ModifySelectedCost': {
      const card = state.Hand.find(item => item.InstanceID === selected[0]);
      if (!card || getCard(card.DefinitionID).DataType !== 'normal') throw new Error('费用调整目标无效');
      card.CostModifiers.push({ Source: 'feichuan_bargain', Amount: effect.Amount, ExpiresAtTurn: state.Turn });
      state.Log.push(`「${getCard(card.DefinitionID).Name}」本回合费用 ${effect.Amount}。`);
      break;
    }
    case 'DiscardCard':
      for (const id of selected) {
        const index = state.Hand.findIndex(card => card.InstanceID === id);
        const [card] = state.Hand.splice(index, 1);
        state.DiscardPile.push(card);
        state.Log.push(`弃置「${getCard(card.DefinitionID).Name}」。`);
        events.emit({ Type: 'OnCardDiscarded', BattleID: state.BattleID, InstanceID: id, Reason: 'effect' });
      }
      break;
    default: {
      const unsupported: never = effect;
      throw new Error(`未实现的效果：${String(unsupported)}`);
    }
  }
}
