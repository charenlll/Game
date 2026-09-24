import { prologueOpeningObsession, type PrologueFlag, type StoryBeat } from '../data/chapters/prologue';

export const PROLOGUE_PROGRESS_KEY = 'night-ferry.prologue.v1';

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
}

export function createPrologueState(firstBeatId: string): PrologueState {
  return { chapterId: 'prologue', currentBeatId: firstBeatId, storyFlags: {}, childObsession: prologueOpeningObsession, chapterStatus: 'in_progress' };
}

export function enterStoryBeat(state: PrologueState, beat: StoryBeat): void {
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
  savePrologueProgress({ prologue_complete: true, wooden_boat_trace_unlocked: true });
  return true;
}

export function loadPrologueProgress(): ProloguePersistentState {
  const empty = { prologue_complete: false, wooden_boat_trace_unlocked: false };
  try {
    const raw = localStorage.getItem(PROLOGUE_PROGRESS_KEY);
    if (!raw) return empty;
    const value = JSON.parse(raw) as Partial<ProloguePersistentState>;
    const complete = value.prologue_complete === true;
    return { prologue_complete: complete, wooden_boat_trace_unlocked: complete && value.wooden_boat_trace_unlocked === true };
  } catch {
    return empty;
  }
}

export function savePrologueProgress(progress: ProloguePersistentState): void {
  try { localStorage.setItem(PROLOGUE_PROGRESS_KEY, JSON.stringify(progress)); }
  catch { /* Private browsing or storage limits should not prevent the ending scene. */ }
}
