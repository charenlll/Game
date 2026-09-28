import { RunController } from './run-view';
import { MainMenu } from './main-menu';
import { PrologueController } from './prologue-view';
import { HubController } from './hub-view';
import { SessionCoordinator } from '../app/session/session-coordinator';
import { createBrowserSaveRepository } from '../infrastructure/save/local-save-repository';
import type { ActiveSessionSnapshot, ChapterEntrySource } from '../infrastructure/save/save-schema';

export class GameFlow {
  private prologueCompleted = false;
  private prologueEntrySource: ChapterEntrySource = 'main_menu';
  private prologue: PrologueController | null = null;
  private mainMenu: MainMenu | null = null;
  private run: RunController | null = null;
  private hub: HubController | null = null;
  private readonly sessions = SessionCoordinator.open(createBrowserSaveRepository());

  constructor(private readonly stage: HTMLElement, private readonly seed: number, showMainMenu = true) {
    const save = this.sessions.snapshot;
    this.prologueCompleted = save.campaign.chapters.prologue?.status === 'complete' || save.profile.mementoIds.includes('prologue_wooden_boat');
    if (showMainMenu && this.sessions.snapshot.activeSession) this.resumeSession(this.sessions.snapshot.activeSession);
    else if (showMainMenu) this.showMainMenu();
    else this.startRun();
  }

  debugFinishBattle(result: 'won' | 'lost'): void {
    if (this.prologue) this.prologue.debugFinishBattle(result);
    else this.run?.debugFinishBattle(result);
  }

  debugReturnToMenu(): void {
    if (this.prologue) this.returnFromPrologue();
    else if (this.run && this.prologueCompleted) this.showHub();
    else this.showMainMenu();
  }

  debugState(): unknown {
    return this.prologue ? this.prologue.debugState() : this.run ? structuredClone(this.run.state) : null;
  }

  destroy(): void {
    this.mainMenu?.destroy();
    this.hub?.destroy();
    this.run?.destroy();
    this.prologue?.destroy();
  }

  private showMainMenu(): void {
    this.run?.destroy();
    this.run = null;
    this.mainMenu?.destroy();
    this.prologue?.destroy();
    this.hub?.destroy();
    this.prologue = null;
    this.hub = null;
    this.mainMenu = new MainMenu(this.stage, { startGame: () => this.startGameEntry() });
  }

  private startGameEntry(): void {
    this.mainMenu?.destroy();
    this.mainMenu = null;
    if (!this.prologueCompleted) {
      this.startPrologue('main_menu');
      return;
    }
    this.showHub();
  }

  private startPrologue(entrySource: ChapterEntrySource, resume?: ActiveSessionSnapshot): void {
    this.prologueEntrySource = entrySource;
    this.run?.destroy();
    this.run = null;
    this.hub?.destroy();
    this.hub = null;
    this.mainMenu?.destroy();
    this.mainMenu = null;
    this.prologue?.destroy();
    this.prologue = new PrologueController(this.stage, this.seed, {
      returnToMenu: () => this.prologueCompleted ? this.showHub() : this.showMainMenu(),
      returnFromBattleToMenu: () => this.returnFromPrologue(),
      completed: () => { this.prologueCompleted = true; },
    }, this.sessions, entrySource, resume);
  }

  private returnFromPrologue(): void {
    if (this.prologueEntrySource === 'hub') this.showHub();
    else this.showMainMenu();
  }

  private showHub(): void {
    this.run?.destroy();
    this.run = null;
    this.prologue?.destroy();
    this.prologue = null;
    this.mainMenu?.destroy();
    this.mainMenu = null;
    this.hub?.destroy();
    this.hub = new HubController(this.stage, {
      startPrologue: () => this.startPrologue('hub'),
      returnToMenu: () => this.showMainMenu(),
      ferrymanProgress: () => this.sessions.ferrymanProgress(),
      selectFerryman: id => this.sessions.setCurrentFerryman(id),
    });
  }

  private startRun(resume?: ActiveSessionSnapshot): void {
    this.run?.destroy();
    const seed = resume?.runState?.Seed ?? (this.run ? crypto.getRandomValues(new Uint32Array(1))[0] : this.seed);
    this.run = new RunController(this.stage, seed, resume?.runState?.SelectedCharacterID ?? this.sessions.snapshot.profile.ferrymen.currentId, this.prologueCompleted ? () => this.showHub() : undefined, this.sessions, resume);
  }

  private resumeSession(session: ActiveSessionSnapshot): void {
    if (session.mode === 'chapter' && session.chapterId === 'prologue') this.startPrologue(session.entrySource ?? (this.prologueCompleted ? 'hub' : 'main_menu'), session);
    else if (session.mode === 'free_run') this.startRun(session);
    else this.showMainMenu();
  }
}
