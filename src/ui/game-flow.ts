import { RunController } from './run-view';
import { MainMenu } from './main-menu';
import { PrologueController } from './prologue-view';
import { loadPrologueProgress } from '../core/prologue-state';
import { HubController } from './hub-view';

export class GameFlow {
  private prologueCompleted = false;
  private prologue: PrologueController | null = null;
  private mainMenu: MainMenu | null = null;
  private run: RunController | null = null;
  private hub: HubController | null = null;

  constructor(private readonly stage: HTMLElement, private readonly seed: number, showMainMenu = true) {
    this.prologueCompleted = loadPrologueProgress().prologue_complete;
    if (showMainMenu) this.showMainMenu();
    else this.startRun();
  }

  debugFinishBattle(result: 'won' | 'lost'): void {
    if (this.prologue) this.prologue.debugFinishBattle(result);
    else this.run?.debugFinishBattle(result);
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
      this.startPrologue();
      return;
    }
    this.showHub();
  }

  private startPrologue(): void {
    this.run?.destroy();
    this.run = null;
    this.hub?.destroy();
    this.hub = null;
    this.mainMenu?.destroy();
    this.mainMenu = null;
    this.prologue?.destroy();
    this.prologue = new PrologueController(this.stage, this.seed, {
      returnToMenu: () => this.prologueCompleted ? this.showHub() : this.showMainMenu(),
      completed: () => { this.prologueCompleted = true; },
    });
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
      startPrologue: () => this.startPrologue(),
      returnToMenu: () => this.showMainMenu(),
    });
  }

  private startRun(): void {
    this.run?.destroy();
    const seed = this.run ? crypto.getRandomValues(new Uint32Array(1))[0] : this.seed;
    this.run = new RunController(this.stage, seed, 'feichuan', this.prologueCompleted ? () => this.showHub() : undefined);
  }
}
