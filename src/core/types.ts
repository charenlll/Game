export type CardType = '安抚' | '引魂' | '净化' | '洞察' | '灵术';
export type CardEffect =
  | { Type: 'ReduceObsession' | 'GainLight' | 'DrawCard' | 'DiscardCard' | 'ModifyNextRoundLight' | 'ModifySelectedCost'; Amount: number }
  | { Type: 'ConditionalReduceObsession'; Amount: number; Bonus: number };
export interface CardDefinition {
  CardID: string;
  Name: string;
  Description: string;
  Cost: number;
  CardType: CardType;
  Rarity: 'Common';
  Tags: string[];
  TargetType: 'Soul' | 'Self';
  Effects: CardEffect[];
  IsTemporary: boolean;
  OwnerCharacterID: string | null;
  ArtReference: string | null;
  DataType: 'normal' | 'burden';
  PlayBehavior: 'normal' | 'unplayable' | 'exhaust';
  FrameStyle: 'common' | 'feichuan';
}
export interface CharacterDefinition {
  CharacterID: string;
  Name: string;
  AnimalType: string;
  Gender: 'Male';
  AgeGroup: string;
  Occupation: string;
  Personality: string[];
  VisualKeywords: string[];
  CombatTrait: string | null;
  ResourceTrait: string | null;
  ExclusiveCards: string[];
  TraitUpgrades: string[];
  StartingDeckModifier: { Add: string[]; Remove: string[] };
  StoryID: string | null;
  ArtReference: string | null;
}
export interface SoulDefinition {
  SoulID: string;
  Name: string;
  Obsession: number;
  Story: string;
  ArtReference: string | null;
  HesitantArtReference?: string | null;
  ReleasedArtReference?: string | null;
}
export interface CardInstance {
  InstanceID: string;
  DefinitionID: string;
  IsTemporary: boolean;
  CostModifiers: { Source: string; Amount: number; ExpiresAtTurn: number }[];
}
export type BattlePhase = 'ROUND_START' | 'PLAYER_TURN' | 'RESOLVING_CARD' | 'TURN_END' | 'RESOLVING_INTENT' | 'RESULT';
export type IntentID = 'intent_close' | 'intent_hesitate' | 'intent_hesitation_spread' | 'intent_burden' | 'intent_dim_light';
export interface IntentInstance { IntentID: IntentID; BurdenCardID?: 'burden_001' | 'burden_002' }
export interface BattleEncounterConfig {
  SoulID?: string;
  StartingObsession?: number;
  VictoryObsession?: number;
  MaxRounds?: number;
  InitialDraw?: number;
  CardsPerTurn?: number;
  HandSize?: number;
  BaseLight?: number;
  IntentPool?: readonly IntentInstance[];
  IntentSequence?: readonly IntentInstance[];
  CompletionLog?: string;
}
export type BattleStatus = 'playing' | 'won' | 'lost';
export interface BattleState {
  BattleID: string;
  Seed: number;
  RandomState: number;
  Turn: number;
  MaxTurns: number;
  Light: number;
  BaseLight: number;
  HandSize: number;
  Obsession: number;
  MaxObsession: number;
  Status: BattleStatus;
  Phase: BattlePhase;
  CurrentIntent: IntentInstance;
  PendingLightModifier: number;
  PendingCostIncrease: number;
  CombatTraitID: string | null;
  GainedLightThisTurn: boolean;
  CombatTraitTriggeredThisTurn: boolean;
  CombatTraitDiscountActive: boolean;
  CharacterID: string;
  SoulID: string;
  DrawPile: CardInstance[];
  Hand: CardInstance[];
  DiscardPile: CardInstance[];
  Resolving: CardInstance[];
  ExhaustPile: CardInstance[];
  Stats: { CardsPlayed: number; TemporaryCardsPlayed: number };
  Log: string[];
}
export type BattleEvent =
  | { Type: 'OnTurnStart'; BattleID: string; Turn: number }
  | { Type: 'OnCardPlayed'; BattleID: string; InstanceID: string; DefinitionID: string }
  | { Type: 'OnCardDiscarded'; BattleID: string; InstanceID: string; Reason: 'effect' | 'turn-end' }
  | { Type: 'OnTraitTriggered'; BattleID: string; TraitID: string }
  | { Type: 'OnBattleEnd'; BattleID: string; Result: 'won' | 'lost'; Stats: Readonly<BattleState['Stats']> };
export type ActionResult = { Ok: true } | { Ok: false; Message: string };
