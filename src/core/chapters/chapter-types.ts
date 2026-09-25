import type { BattleEncounterConfig } from '../types';
import type { ChapterProgress } from '../campaign/campaign-types';
import type { ProgressionGrant } from '../progression/grants';

export type ChapterId = string;
export type ChapterNodeId = string;
export type EncounterId = string;
export type GrantId = string;

export interface ChapterDefinition {
  id: ChapterId;
  entryNodeId: ChapterNodeId;
  nodes: Readonly<Record<ChapterNodeId, ChapterNode>>;
  encounters: Readonly<Record<EncounterId, EncounterDefinition>>;
  grants: Readonly<Record<GrantId, ProgressionGrant>>;
}

export interface EncounterDefinition {
  id: EncounterId;
  battle: BattleEncounterConfig;
  backgroundId: string;
  rewardPolicy: 'none' | 'run_card_choice';
}

export type ChapterNode = StoryNode | ChoiceNode | EncounterNode | RewardNode | ChapterEndNode;

export interface StoryNode {
  kind: 'story';
  id: ChapterNodeId;
  backgroundId: string;
  speakerId: string;
  textKey: string;
  onEnter?: readonly StoryCommand[];
  exit: { kind: 'node'; targetNodeId: ChapterNodeId };
}

export interface ChoiceNode {
  kind: 'choice';
  id: ChapterNodeId;
  promptTextKey: string;
  options: readonly {
    id: string;
    textKey: string;
    effects?: readonly StoryCommand[];
    grantId?: GrantId;
    nextNodeId: ChapterNodeId;
  }[];
}

export interface EncounterNode {
  kind: 'encounter';
  id: ChapterNodeId;
  encounterId: EncounterId;
  onVictory: { nextNodeId: ChapterNodeId; rewardId?: string };
  onDefeat: { nextNodeId?: ChapterNodeId; outcome: 'chapter_failed' | 'retry' };
}

export interface RewardNode {
  kind: 'reward';
  id: ChapterNodeId;
  policy: 'run_card_choice';
  nextNodeId: ChapterNodeId;
}

export interface ChapterEndNode {
  kind: 'chapter_end';
  id: ChapterNodeId;
  grantId: GrantId;
}

export type StoryCommand = { kind: 'setFlag'; flagId: string };

export interface ChapterSessionState {
  chapterId: ChapterId;
  currentNodeId: ChapterNodeId;
  flags: Record<string, true>;
  variables: Record<string, boolean | number | string>;
  status: 'in_progress';
}

export function createChapterProgress(chapterId: ChapterId, entryNodeId: ChapterNodeId): ChapterProgress {
  return { chapterId, currentNodeId: entryNodeId, flags: {}, variables: {}, status: 'in_progress' };
}
