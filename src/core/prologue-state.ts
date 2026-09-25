import type { FerrymanId } from './profile/profile-types';

export type PrologueFlag = 'met_feichuan' | 'met_child' | 'boat_found' | 'boat_entrusted' | 'child_released' | 'wooden_boat_trace_unlocked' | 'prologue_complete' | 'battle_1_complete' | 'battle_2_complete' | 'final_battle_complete' | 'child_ready_to_release';

export const PROLOGUE_OPENING_OBSESSION = 40;

export interface PrologueState {
  chapterId: 'prologue';
  currentBeatId: string;
  storyFlags: Partial<Record<PrologueFlag, true>>;
  childObsession: number;
  chapterStatus: 'in_progress' | 'complete';
}

export interface ProloguePersistentState {
  prologue_complete: boolean;
  wooden_boat_trace_unlocked: boolean;
  currentFerrymanId: FerrymanId;
  unlockedFerrymen: Partial<Record<FerrymanId, true>>;
  copper: number;
  soulFlame: number;
}

export function createPrologueState(firstBeatId: string): PrologueState {
  return { chapterId: 'prologue', currentBeatId: firstBeatId, storyFlags: {}, childObsession: PROLOGUE_OPENING_OBSESSION, chapterStatus: 'in_progress' };
}

export function restorePrologueState(currentBeatId: string, flags: Partial<Record<PrologueFlag, true>>, childObsession: number, complete = false): PrologueState {
  return {
    chapterId: 'prologue', currentBeatId, storyFlags: structuredClone(flags),
    childObsession: Number.isFinite(childObsession) && childObsession >= 0 ? childObsession : PROLOGUE_OPENING_OBSESSION,
    chapterStatus: complete ? 'complete' : 'in_progress',
  };
}

export function enterStoryBeat(state: PrologueState, beat: { id: string; setFlags?: readonly PrologueFlag[] }): void {
  state.currentBeatId = beat.id;
  for (const flag of beat.setFlags ?? []) state.storyFlags[flag] = true;
}

export function resolveChildRelease(state: PrologueState): boolean {
  if (!state.storyFlags.boat_entrusted) return false;
  state.childObsession = 0;
  state.storyFlags.child_released = true;
  return true;
}

export function completePrologue(state: PrologueState): boolean {
  if (!state.storyFlags.child_released) return false;
  state.storyFlags.wooden_boat_trace_unlocked = true;
  state.storyFlags.prologue_complete = true;
  state.chapterStatus = 'complete';
  return true;
}
