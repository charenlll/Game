import type { BattleEncounterConfig, BattleState } from '../../core/types';
import type { RunState } from '../../core/run';
import type { CampaignState } from '../../core/campaign/campaign-types';
import type { FerrymanId, ProfileState } from '../../core/profile/profile-types';
import { CONTENT_VERSION } from '../../data/content-version';

export const SAVE_KEY = 'night-ferry.save';
export const LEGACY_PROLOGUE_KEY = 'night-ferry.prologue.v1';

export interface BattleSnapshot {
  snapshotVersion: 1;
  contentVersion: string;
  encounterId: string;
  state: BattleState;
  encounterConfig: BattleEncounterConfig;
  turnIndex: number;
  nextInstanceNumber: number;
}

export interface ActiveSessionSnapshot {
  mode: 'chapter' | 'free_run';
  chapterId?: string;
  runState?: RunState;
  screen: 'story' | 'battle' | 'battle_result' | 'reward' | 'result' | 'keepsake' | 'retry';
  battle?: BattleSnapshot;
  encounterId?: string;
  battleAttempt?: number;
  appliedSessionEventIds: string[];
  offeredRewardIds?: string[];
  selectedRewardId?: string;
}

export interface UserSettings {
  language: string;
  reducedMotion: boolean;
  masterVolume: number;
}

export interface SaveGameV1 {
  schemaVersion: 1;
  contentVersion: string;
  updatedAt: string;
  profile: ProfileState;
  campaign: CampaignState;
  activeSession: ActiveSessionSnapshot | null;
  settings: UserSettings;
  appliedGrantIds: string[];
}

export interface LegacyPrologueSave {
  prologue_complete: boolean;
  wooden_boat_trace_unlocked: boolean;
  currentFerrymanId: FerrymanId;
  unlockedFerrymen: Partial<Record<FerrymanId, true>>;
  copper: number;
  soulFlame: number;
}

export function createDefaultSaveGame(now = new Date().toISOString()): SaveGameV1 {
  return {
    schemaVersion: 1,
    contentVersion: CONTENT_VERSION,
    updatedAt: now,
    profile: {
      currencies: { copper: 0, soulFlame: 0 },
      ferrymen: { currentId: 'feichuan', unlockedIds: ['feichuan'] },
      mementoIds: [],
      characterProgress: {},
    },
    campaign: { chapters: { prologue: { chapterId: 'prologue', flags: {}, status: 'available', variables: {} } } },
    activeSession: null,
    settings: { language: 'zh-CN', reducedMotion: false, masterVolume: 1 },
    appliedGrantIds: [],
  };
}

export function migrateLegacyPrologueSave(value: unknown, now = new Date().toISOString()): SaveGameV1 {
  const source = isRecord(value) ? value : {};
  const complete = source.prologue_complete === true;
  const known: FerrymanId[] = ['feichuan'];
  const unlockedRaw = isRecord(source.unlockedFerrymen) ? source.unlockedFerrymen : {};
  for (const id of ['moyu', 'qinglan'] as const) if (unlockedRaw[id] === true) known.push(id);
  const requested = source.currentFerrymanId;
  const currentId = isFerrymanId(requested) && known.includes(requested) ? requested : 'feichuan';
  const save = createDefaultSaveGame(now);
  save.profile.currencies.copper = nonNegativeInteger(source.copper);
  save.profile.currencies.soulFlame = nonNegativeInteger(source.soulFlame);
  save.profile.ferrymen = { currentId, unlockedIds: known };
  if (complete && source.wooden_boat_trace_unlocked === true) save.profile.mementoIds.push('prologue_wooden_boat');
  save.campaign.chapters.prologue = {
    chapterId: 'prologue', flags: {}, status: complete ? 'complete' : 'available', variables: {},
  };
  return save;
}

export function isSaveGameV1(value: unknown): value is SaveGameV1 {
  if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.contentVersion !== 'string' || typeof value.updatedAt !== 'string') return false;
  if (!isRecord(value.profile) || !isRecord(value.profile.currencies) || !isRecord(value.profile.ferrymen) || !Array.isArray(value.profile.ferrymen.unlockedIds)) return false;
  if (!isNonNegativeInteger(value.profile.currencies.copper) || !isNonNegativeInteger(value.profile.currencies.soulFlame)) return false;
  if (!isFerrymanId(value.profile.ferrymen.currentId) || !value.profile.ferrymen.unlockedIds.every(isFerrymanId) || !value.profile.ferrymen.unlockedIds.includes(value.profile.ferrymen.currentId)) return false;
  if (!isStringArray(value.profile.mementoIds) || !isRecord(value.profile.characterProgress)) return false;
  if (!isRecord(value.campaign) || !isRecord(value.campaign.chapters)) return false;
  for (const [id, chapter] of Object.entries(value.campaign.chapters)) if (!isChapterProgress(chapter, id)) return false;
  if (value.campaign.activeChapterId !== undefined && typeof value.campaign.activeChapterId !== 'string') return false;
  if (value.activeSession !== null && !isActiveSession(value.activeSession)) return false;
  if (!isRecord(value.settings) || typeof value.settings.language !== 'string' || typeof value.settings.reducedMotion !== 'boolean' || typeof value.settings.masterVolume !== 'number' || value.settings.masterVolume < 0 || value.settings.masterVolume > 1) return false;
  return isStringArray(value.appliedGrantIds);
}

export function isActiveSession(value: unknown): value is ActiveSessionSnapshot {
  if (!isRecord(value) || !['chapter', 'free_run'].includes(String(value.mode))) return false;
  if (!['story', 'battle', 'battle_result', 'reward', 'result', 'keepsake', 'retry'].includes(String(value.screen))) return false;
  if (!isStringArray(value.appliedSessionEventIds)) return false;
  if (value.chapterId !== undefined && typeof value.chapterId !== 'string') return false;
  if (value.runState !== undefined && !isRunState(value.runState)) return false;
  if (value.battle !== undefined && !isBattleSnapshot(value.battle)) return false;
  if (value.encounterId !== undefined && typeof value.encounterId !== 'string') return false;
  if (value.battleAttempt !== undefined && !isNonNegativeInteger(value.battleAttempt)) return false;
  if (value.offeredRewardIds !== undefined && !isStringArray(value.offeredRewardIds)) return false;
  if (value.selectedRewardId !== undefined && typeof value.selectedRewardId !== 'string') return false;
  if (value.mode === 'chapter' && (typeof value.chapterId !== 'string' || !value.runState)) return false;
  if (value.mode === 'free_run' && !value.runState) return false;
  if ((value.screen === 'battle' || value.screen === 'battle_result') && !value.battle) return false;
  if (value.battle && value.mode === 'chapter' && (typeof value.encounterId !== 'string' || value.battle.encounterId !== value.encounterId)) return false;
  if (value.screen === 'reward' && !Array.isArray(value.offeredRewardIds)) return false;
  return true;
}

export function isBattleSnapshot(value: unknown): value is BattleSnapshot {
  if (!isRecord(value) || value.snapshotVersion !== 1 || typeof value.contentVersion !== 'string' || typeof value.encounterId !== 'string') return false;
  if (!isEncounterConfig(value.encounterConfig) || !isBattleState(value.state)) return false;
  return isNonNegativeInteger(value.turnIndex) && isNonNegativeInteger(value.nextInstanceNumber);
}

function isBattleState(value: unknown): value is BattleState {
  if (!isRecord(value)) return false;
  const arrays = ['DrawPile', 'Hand', 'DiscardPile', 'Resolving', 'ExhaustPile'];
  if (arrays.some(key => !Array.isArray(value[key]) || !(value[key] as unknown[]).every(isCardInstance))) return false;
  if (!isRecord(value.Stats) || !isNonNegativeInteger(value.Stats.CardsPlayed) || !isNonNegativeInteger(value.Stats.TemporaryCardsPlayed)) return false;
  if (!isIntent(value.CurrentIntent) || !isStringArray(value.Log)) return false;
  return typeof value.BattleID === 'string' && isNonNegativeInteger(value.Seed) && isNonNegativeInteger(value.RandomState)
    && isNonNegativeInteger(value.Turn) && isNonNegativeInteger(value.MaxTurns) && isNonNegativeInteger(value.Light)
    && isNonNegativeInteger(value.BaseLight) && isNonNegativeInteger(value.HandSize) && isNonNegativeInteger(value.Obsession)
    && isNonNegativeInteger(value.MaxObsession) && ['playing', 'won', 'lost'].includes(String(value.Status))
    && ['ROUND_START', 'PLAYER_TURN', 'RESOLVING_CARD', 'TURN_END', 'RESOLVING_INTENT', 'RESULT'].includes(String(value.Phase))
    && isSafeInteger(value.PendingLightModifier) && isNonNegativeInteger(value.PendingCostIncrease)
    && (value.CombatTraitID === null || typeof value.CombatTraitID === 'string')
    && typeof value.GainedLightThisTurn === 'boolean' && typeof value.CombatTraitTriggeredThisTurn === 'boolean'
    && typeof value.CombatTraitDiscountActive === 'boolean'
    && typeof value.CharacterID === 'string' && typeof value.SoulID === 'string';
}

function isCardInstance(value: unknown): boolean {
  return isRecord(value) && typeof value.InstanceID === 'string' && typeof value.DefinitionID === 'string'
    && typeof value.IsTemporary === 'boolean' && Array.isArray(value.CostModifiers)
    && value.CostModifiers.every((modifier: unknown) => isRecord(modifier) && typeof modifier.Source === 'string' && isSafeInteger(modifier.Amount) && isNonNegativeInteger(modifier.ExpiresAtTurn));
}

function isEncounterConfig(value: unknown): value is BattleEncounterConfig {
  if (!isRecord(value)) return false;
  for (const key of ['SoulID', 'CompletionLog']) if (value[key] !== undefined && typeof value[key] !== 'string') return false;
  for (const key of ['StartingObsession', 'VictoryObsession', 'MaxRounds', 'InitialDraw', 'CardsPerTurn', 'HandSize', 'BaseLight']) {
    if (value[key] !== undefined && !isNonNegativeInteger(value[key])) return false;
  }
  for (const key of ['IntentPool', 'IntentSequence']) {
    if (value[key] !== undefined && (!Array.isArray(value[key]) || !value[key].every(isIntent))) return false;
  }
  return true;
}

function isIntent(value: unknown): boolean {
  if (!isRecord(value) || !['intent_close', 'intent_hesitate', 'intent_hesitation_spread', 'intent_burden', 'intent_dim_light'].includes(String(value.IntentID))) return false;
  return value.BurdenCardID === undefined || value.BurdenCardID === 'burden_001' || value.BurdenCardID === 'burden_002';
}

function isRunState(value: unknown): value is RunState {
  return isRecord(value) && isNonNegativeInteger(value.Seed) && isNonNegativeInteger(value.RandomState)
    && typeof value.SelectedCharacterID === 'string' && isNonNegativeInteger(value.CurrentEncounter)
    && isNonNegativeInteger(value.MaxEncounters) && isNonNegativeInteger(value.CompletedEncounters)
    && isStringArray(value.RunDeck) && isStringArray(value.AcquiredCards)
    && ['battle', 'reward', 'completed', 'failed'].includes(String(value.Status));
}

function isChapterProgress(value: unknown, id: string): boolean {
  if (!isRecord(value) || value.chapterId !== id || !['available', 'in_progress', 'complete', 'failed'].includes(String(value.status))) return false;
  if (value.currentNodeId !== undefined && typeof value.currentNodeId !== 'string') return false;
  if (!isRecord(value.flags) || !Object.values(value.flags).every(flag => flag === true)) return false;
  if (!isRecord(value.variables)) return false;
  return Object.values(value.variables).every(item => typeof item === 'string' || typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item)));
}

function isFerrymanId(value: unknown): value is FerrymanId { return value === 'feichuan' || value === 'moyu' || value === 'qinglan'; }
function isNonNegativeInteger(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) >= 0; }
function isSafeInteger(value: unknown): value is number { return Number.isSafeInteger(value); }
function nonNegativeInteger(value: unknown): number { return isNonNegativeInteger(value) ? value : 0; }
function isStringArray(value: unknown): value is string[] { return Array.isArray(value) && value.every(item => typeof item === 'string'); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
