import charactersData from '../data/characters.json';
import soulsData from '../data/souls.json';
import deckData from '../data/deck.json';
import { cardDatabase, toBattleDefinition } from './card-database';
import type { CardDefinition, CharacterDefinition, SoulDefinition } from './types';
export const cards: readonly CardDefinition[] = cardDatabase.all().map(toBattleDefinition);
export const cardMap = new Map(cards.map(card => [card.CardID, card]));
// JSON 与类型双重约束：人物和亡魂内容在启动时校验关键规则。
export const character = charactersData[0] as CharacterDefinition;
export const soul = soulsData[0] as SoulDefinition;
if (!character || character.Gender !== 'Male' || !character.CharacterID || character.CombatTrait !== null || character.ResourceTrait !== null) throw new Error('Phase 1 人物定义无效');
if (!soul || !soul.SoulID || !Number.isInteger(soul.Obsession) || soul.Obsession <= 0) throw new Error('亡魂定义无效');
export const startingDeck: readonly string[] = deckData;
if (startingDeck.length !== 12 || startingDeck.some(id => !cardMap.has(id))) throw new Error('起始牌组必须为 12 张有效卡牌');

export function getCard(id: string): CardDefinition {
  const card = cardMap.get(id);
  if (!card) throw new Error(`未知卡牌：${id}`);
  return card;
}
