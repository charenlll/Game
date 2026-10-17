import { cardDatabase } from './card-database';
import type { FerrymanId, ProfileState } from './profile/profile-types';

// Legacy starter cards were already available to every existing player.
export const LEGACY_UNLOCKED_CARDS = Object.freeze([
  'common_001', 'common_002', 'common_003', 'common_004', 'common_005', 'common_006',
  'feichuan_001', 'feichuan_002', 'feichuan_003',
]);
export const DEFAULT_EDITABLE_DECK: readonly string[] = Object.freeze([
  'common_001', 'common_001', 'common_002', 'common_002', 'common_003', 'common_003',
  'common_004', 'common_005', 'common_006',
  'feichuan_001', 'feichuan_002', 'feichuan_003',
]);

export function unlockedCards(profile: ProfileState): ReadonlySet<string> {
  return new Set([...LEGACY_UNLOCKED_CARDS, ...(profile.unlockedCardIds ?? []),
    ...Object.values(profile.characterProgress).flatMap(progress => progress.unlockedCardIds)]);
}

export function validateEditableDeck(deck: readonly string[], ferrymanId: FerrymanId, unlocked: ReadonlySet<string>): string | null {
  if (deck.length < 6 || deck.length > 12) return '初始牌组须为6～12张。';
  const counts = new Map<string, number>();
  for (const id of deck) {
    let card;
    try { card = cardDatabase.get(id); } catch { return `未知卡牌：${id}`; }
    if (card.card_type === 'burden') return '浊念不能加入初始牌组。';
    if (card.owner_character_id && card.owner_character_id !== ferrymanId) return '不能使用其他摆渡人的专属牌。';
    if (!unlocked.has(id)) return `卡牌「${card.name}」尚未永久解锁。`;
    const count = (counts.get(id) ?? 0) + 1;
    if (count > 2) return `「${card.name}」最多配置2张。`;
    counts.set(id, count);
  }
  return null;
}

export function defaultEditableDeck(ferrymanId: FerrymanId): string[] {
  if (ferrymanId === 'feichuan') return [...DEFAULT_EDITABLE_DECK];
  return [...DEFAULT_EDITABLE_DECK.filter(id => id.startsWith('common_'))];
}

export function configuredStartingDeck(profile: ProfileState, ferrymanId: FerrymanId): string[] {
  const unlocked = unlockedCards(profile);
  const configured = profile.startingDecks?.[ferrymanId];
  return configured && !validateEditableDeck(configured, ferrymanId, unlocked) ? [...configured] : defaultEditableDeck(ferrymanId);
}
