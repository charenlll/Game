export type FerrymanId = 'feichuan' | 'moyu' | 'qinglan';

export interface CharacterProgress {
  affinity: number;
  relationshipFlags: string[];
  unlockedTraitIds: string[];
  unlockedCardIds: string[];
  unlockedOutfitIds: string[];
  equippedOutfitId?: string;
}

export interface ProfileState {
  currencies: { copper: number; soulFlame: number };
  ferrymen: { currentId: FerrymanId; unlockedIds: FerrymanId[] };
  mementoIds: string[];
  characterProgress: Record<string, CharacterProgress>;
}
