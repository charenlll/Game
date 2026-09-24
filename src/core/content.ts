import charactersData from '../data/characters.json';
import soulsData from '../data/souls.json';
import deckData from '../data/deck.json';
import { cardDatabase, toBattleDefinition } from './card-database';
import type { CardDefinition, CharacterDefinition, SoulDefinition } from './types';
export const cards: readonly CardDefinition[] = cardDatabase.all().map(toBattleDefinition);
export const cardMap = new Map(cards.map(card => [card.CardID, card]));
// JSON 与类型双重约束：人物和亡魂内容在启动时校验关键规则。
export const characters = new Map((charactersData as CharacterDefinition[]).map(entry => [entry.CharacterID, entry]));
export const character = charactersData[0] as CharacterDefinition;
export const souls = new Map((soulsData as SoulDefinition[]).map(entry => [entry.SoulID, entry]));
export const soul = soulsData[0] as SoulDefinition;
if (!character || character.Gender !== 'Male' || !character.CharacterID || !character.CombatTrait || character.ResourceTrait !== null) throw new Error('Phase 2B人物定义无效');
if (!soul || !soul.SoulID || !Number.isInteger(soul.Obsession) || soul.Obsession <= 0) throw new Error('亡魂定义无效');
export function getSoul(id: string): SoulDefinition {
  const result = souls.get(id);
  if (!result) throw new Error(`未知亡魂：${id}`);
  return result;
}
export function getCharacter(id: string): CharacterDefinition {
  const result = characters.get(id);
  if (!result) throw new Error(`未知角色：${id}`);
  return result;
}
export function buildStartingDeck(selected: CharacterDefinition): readonly string[] {
  const result = [...deckData];
  for (const id of selected.StartingDeckModifier.Remove) {
    const index = result.indexOf(id);
    if (index === -1) throw new Error(`${selected.CharacterID}无法从基础牌组移除${id}`);
    result.splice(index, 1);
  }
  result.push(...selected.StartingDeckModifier.Add);
  if (result.some(id => !cardMap.has(id))) throw new Error(`${selected.CharacterID}起始牌组含未知卡牌`);
  if (selected.ExclusiveCards.some(id => getCard(id).OwnerCharacterID !== selected.CharacterID)) throw new Error(`${selected.CharacterID}专属牌归属无效`);
  return Object.freeze(result);
}
export const startingDeck: readonly string[] = buildStartingDeck(character);

export function getCard(id: string): CardDefinition {
  const card = cardMap.get(id);
  if (!card) throw new Error(`未知卡牌：${id}`);
  return card;
}
