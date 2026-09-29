import type { ChapterProgress } from '../../core/campaign/campaign-types';
import type { FerrymanId } from '../../core/profile/profile-types';
import type { RunState } from '../../core/run';
import { applyGrant, type ProgressionGrant } from '../../core/progression/grants';
import { createDefaultSaveGame, type ActiveSessionSnapshot, type ChapterEntrySource, type SaveGameV1, type UserSettings } from '../../infrastructure/save/save-schema';
import { LocalSaveRepository } from '../../infrastructure/save/local-save-repository';
import { cardDatabase } from '../../core/card-database';
import { startingDeck } from '../../core/content';
import { projectSoulArchive, type SoulArchiveEntry } from '../../core/archive/soul-archive';

export interface ChapterCheckpoint {
  chapterId: string;
  currentNodeId?: string;
  flags: Record<string, true>;
  variables: Record<string, boolean | number | string>;
  status: ChapterProgress['status'];
}

export class SessionCoordinator {
  private save: SaveGameV1;
  private readonly writesAllowed: boolean;
  private diagnostic: string | null;

  private constructor(private readonly repository: LocalSaveRepository, save: SaveGameV1, writesAllowed: boolean, diagnostic: string | null) {
    this.save = save;
    this.writesAllowed = writesAllowed;
    this.diagnostic = diagnostic;
    if (diagnostic) console.error(diagnostic);
  }

  static open(repository: LocalSaveRepository): SessionCoordinator {
    const loaded = repository.load();
    if (loaded.status === 'corrupt') return new SessionCoordinator(repository, createDefaultSaveGame(), false, loaded.diagnostic);
    return new SessionCoordinator(repository, loaded.save, true, loaded.diagnostic ?? null);
  }

  get snapshot(): SaveGameV1 { return structuredClone(this.save); }
  get lastSaveDiagnostic(): string | null { return this.diagnostic; }

  get settings(): UserSettings { return structuredClone(this.save.settings); }

  setReducedMotion(enabled: boolean): boolean {
    return this.commit(next => { next.settings.reducedMotion = enabled; });
  }

  discoveredCardIds(): readonly string[] {
    const ids = new Set(this.save.profile.discoveredCardIds ?? []);
    // Existing completed saves predate the catalogue; their starting deck was already played.
    if (this.save.campaign.chapters.prologue?.status === 'complete' || this.save.profile.mementoIds.includes('prologue_wooden_boat')) {
      for (const id of startingDeck) ids.add(id);
    }
    return [...ids];
  }

  soulArchive(): readonly SoulArchiveEntry[] {
    return projectSoulArchive(this.save.profile, this.save.campaign);
  }

  ferrymanProgress(): { currentFerrymanId: FerrymanId; unlockedFerrymen: Partial<Record<FerrymanId, true>>; copper: number; soulFlame: number; prologue_complete: boolean; wooden_boat_trace_unlocked: boolean } {
    const chapter = this.save.campaign.chapters.prologue;
    const prologueCompleted = chapter?.status === 'complete' || this.save.profile.mementoIds.includes('prologue_wooden_boat');
    const unlockedFerrymen: Partial<Record<FerrymanId, true>> = {};
    for (const id of this.save.profile.ferrymen.unlockedIds) unlockedFerrymen[id] = true;
    return {
      currentFerrymanId: this.save.profile.ferrymen.currentId,
      unlockedFerrymen,
      copper: this.save.profile.currencies.copper,
      soulFlame: this.save.profile.currencies.soulFlame,
      prologue_complete: prologueCompleted,
      wooden_boat_trace_unlocked: this.save.profile.mementoIds.includes('prologue_wooden_boat'),
    };
  }

  setCurrentFerryman(id: FerrymanId): boolean {
    if (!this.save.profile.ferrymen.unlockedIds.includes(id)) return false;
    return this.commit(next => { next.profile.ferrymen.currentId = id; });
  }

  checkpoint(activeSession: ActiveSessionSnapshot, chapter?: ChapterCheckpoint): boolean {
    return this.commit(next => {
      const discovered = new Set(next.profile.discoveredCardIds ?? []);
      const known = new Set(cardDatabase.all().map(card => card.id));
      for (const id of activeSession.runState?.RunDeck ?? []) if (known.has(id)) discovered.add(id);
      if (activeSession.battle) {
        const state = activeSession.battle.state;
        for (const card of [...state.DrawPile, ...state.Hand, ...state.DiscardPile, ...state.Resolving, ...state.ExhaustPile]) {
          if (known.has(card.DefinitionID)) discovered.add(card.DefinitionID);
        }
      }
      next.profile.discoveredCardIds = [...discovered];
      next.activeSession = structuredClone(activeSession);
      delete next.launchDestination;
      if (chapter) {
        next.campaign.chapters[chapter.chapterId] = {
          chapterId: chapter.chapterId,
          currentNodeId: chapter.currentNodeId,
          flags: structuredClone(chapter.flags),
          variables: structuredClone(chapter.variables),
          status: chapter.status,
        };
        next.campaign.activeChapterId = chapter.status === 'in_progress' ? chapter.chapterId : undefined;
      }
    });
  }

  startPrologue(firstNodeId: string, runState: RunState, entrySource: ChapterEntrySource): void {
    const current = this.save.campaign.chapters.prologue;
    const previouslyComplete = current?.status === 'complete' || this.save.profile.mementoIds.includes('prologue_wooden_boat');
    const chapter: ChapterCheckpoint = {
      chapterId: 'prologue', currentNodeId: firstNodeId,
      flags: previouslyComplete ? {} : structuredClone(current?.flags ?? {}),
      variables: { childObsession: 40 }, status: previouslyComplete ? 'complete' : 'in_progress',
    };
    this.checkpoint({ mode: 'chapter', chapterId: 'prologue', entrySource, runState: structuredClone(runState), screen: 'story', appliedSessionEventIds: [] }, chapter);
  }

  completeChapter(grant: ProgressionGrant): boolean {
    const result = applyGrant({
      profile: this.save.profile,
      campaign: this.save.campaign,
      appliedGrantIds: this.save.appliedGrantIds,
    }, grant);
    if (result.status === 'invalid') return false;
    return this.commit(next => {
      next.profile = structuredClone(result.state.profile);
      next.campaign = structuredClone(result.state.campaign);
      next.appliedGrantIds = [...result.state.appliedGrantIds];
      next.activeSession = null;
      delete next.launchDestination;
      next.campaign.activeChapterId = undefined;
    });
  }

  clearSession(): boolean {
    return this.commit(next => { next.activeSession = null; next.campaign.activeChapterId = undefined; delete next.launchDestination; });
  }

  setLaunchDestination(destination: 'main_menu' | 'hub'): boolean {
    return this.commit(next => { next.launchDestination = destination; });
  }

  private commit(change: (save: SaveGameV1) => void): boolean {
    const next = structuredClone(this.save);
    change(next);
    next.updatedAt = new Date().toISOString();
    this.save = next;
    if (!this.writesAllowed) return false;
    const result = this.repository.write(next);
    this.diagnostic = result.ok ? null : result.diagnostic;
    if (!result.ok) console.error(result.diagnostic);
    return result.ok;
  }
}
