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
  currentFerrymanId: FerrymanId;
  unlockedFerrymen: Partial<Record<FerrymanId, true>>;
  copper: number;
  soulFlame: number;
}

export type FerrymanId = 'feichuan' | 'moyu' | 'qinglan';

const defaultPersistentState: ProloguePersistentState = {
  prologue_complete: false,
  wooden_boat_trace_unlocked: false,
  currentFerrymanId: 'feichuan',
  unlockedFerrymen: { feichuan: true },
  copper: 0,
  soulFlame: 0,
};

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
  savePrologueProgress({ ...loadPrologueProgress(), prologue_complete: true, wooden_boat_trace_unlocked: true });
  return true;
}

export function loadPrologueProgress(): ProloguePersistentState {
  try {
    const raw = localStorage.getItem(PROLOGUE_PROGRESS_KEY);
    if (!raw) return structuredClone(defaultPersistentState);
    const value = JSON.parse(raw) as Partial<ProloguePersistentState>;
    const complete = value.prologue_complete === true;
    const unlocked: Partial<Record<FerrymanId, true>> = { feichuan: true };
    for (const id of ['moyu', 'qinglan'] as const) if (value.unlockedFerrymen?.[id] === true) unlocked[id] = true;
    const requested = value.currentFerrymanId;
    const currentFerrymanId = requested && unlocked[requested] ? requested : 'feichuan';
    const normalized: ProloguePersistentState = {
      prologue_complete: complete,
      wooden_boat_trace_unlocked: complete && value.wooden_boat_trace_unlocked === true,
      currentFerrymanId,
      unlockedFerrymen: unlocked,
      copper: Number.isSafeInteger(value.copper) && value.copper! >= 0 ? value.copper! : 0,
      soulFlame: Number.isSafeInteger(value.soulFlame) && value.soulFlame! >= 0 ? value.soulFlame! : 0,
    };
    if (value.currentFerrymanId === undefined || value.unlockedFerrymen === undefined || value.copper === undefined || value.soulFlame === undefined) {
      try { localStorage.setItem(PROLOGUE_PROGRESS_KEY, JSON.stringify(normalized)); } catch { /* Keep the normalized defaults in memory if storage is unavailable. */ }
    }
    return normalized;
  } catch {
    return structuredClone(defaultPersistentState);
  }
}

export function savePrologueProgress(progress: Partial<ProloguePersistentState>): void {
  try { localStorage.setItem(PROLOGUE_PROGRESS_KEY, JSON.stringify({ ...loadPrologueProgress(), ...progress })); }
  catch { /* Private browsing or storage limits should not prevent the ending scene. */ }
}
