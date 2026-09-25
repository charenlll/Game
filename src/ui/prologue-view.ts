import { createRun, generateRewards } from '../core/run';
import { cardDatabase } from '../core/card-database';
import type { BattleState } from '../core/types';
import { Assets } from '../core/asset-manifest';
import { prologueBattleEncounters, prologueBeats, prologueBeatById, type PrologueBackground, type PrologueTransition, type StoryBeat } from '../data/chapters/prologue';
import { getChapterDefinition } from '../data/chapters/chapter-catalog';
import { completePrologue, createPrologueState, resolveChildRelease, restorePrologueState, type PrologueFlag, type PrologueState } from '../core/prologue-state';
import { encounterResultNodeId, enterCommands, nextChapterNodeId } from '../core/chapters/chapter-runtime';
import sceneArt from '../data/scene-art.json';
import { textForKey } from '../data/locales/text-catalog';
import { assetURL, CardView, escapeHTML as esc, fitCardText } from './card-view';
import { BattleView } from './game-view';
import { primaryButton } from './ui-components';
import { renderFerryTraceLayer } from './ferry-traces';
import type { RunState } from '../core/run';
import type { SessionCoordinator } from '../app/session/session-coordinator';
import type { ActiveSessionSnapshot, BattleSnapshot } from '../infrastructure/save/save-schema';
import type { BattleRuntimeSnapshot } from '../core/battle';
import { CONTENT_VERSION } from '../data/content-version';

export interface PrologueActions {
  returnToMenu(): void;
  completed(): void;
}

type EncounterID = keyof typeof prologueBattleEncounters;
type PrologueScreen = 'story' | 'battle' | 'reward' | 'retry' | 'keepsake';
const backgrounds: Record<PrologueBackground, string> = Assets.prologue.backgrounds;
const prologueChapter = getChapterDefinition('prologue');
const speakerName: Record<StoryBeat['speaker'], string> = { narrator: '', player: '你', feichuan: '绯川', child: '孩子' };
const cardArtPaths = [Assets.cards.frame, Assets.cards.feichuanFrame, Assets.cards.back, ...Object.values(Assets.prologue.child), Assets.prologue.woodenBoat];

function toBattleRuntimeSnapshot(snapshot: BattleSnapshot): BattleRuntimeSnapshot {
  return { state: snapshot.state, encounterConfig: snapshot.encounterConfig, turnIndex: snapshot.turnIndex, nextInstanceNumber: snapshot.nextInstanceNumber };
}

export class PrologueController {
  readonly state: PrologueState;
  private readonly runState: RunState;
  private readonly viewport: HTMLElement | null;
  private screen: PrologueScreen = 'story';
  private battleView: BattleView | null = null;
  private currentEncounter: EncounterID | null = null;
  private battleAttempt = 0;
  private rewards: readonly string[] = [];
  private selectedReward: string | null = null;
  private typingTimer: ReturnType<typeof setInterval> | null = null;
  private visibleText = '';
  private skipConfirmation = false;
  private readonly completedBattles = new Set<EncounterID>();
  private appliedSessionEventIds = new Set<string>();

  private readonly onClick = (event: MouseEvent): void => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const actionTarget = target.closest<HTMLElement>('[data-prologue-action]');
    const action = actionTarget?.dataset.prologueAction;
    if (action === 'open-skip-confirmation') {
      this.skipConfirmation = true;
      const beat = prologueBeatById.get(this.state.currentBeatId);
      if (beat) this.renderStory(beat);
      return;
    }
    if (action === 'cancel-skip-confirmation') {
      this.skipConfirmation = false;
      const beat = prologueBeatById.get(this.state.currentBeatId);
      if (beat) this.renderStory(beat);
      return;
    }
    if (action === 'confirm-skip-story') {
      this.fastForwardStory();
      return;
    }
    if (action === 'select-reward' && actionTarget?.dataset.card) {
      this.selectedReward = actionTarget.dataset.card;
      this.renderReward();
      this.checkpoint('reward');
      return;
    }
    if (action === 'claim-reward' && this.selectedReward) {
      const card = this.selectedReward;
      this.runState.RunDeck.push(card);
      this.runState.AcquiredCards.push(card);
      this.runState.CurrentEncounter = 2;
      this.runState.Status = 'battle';
      this.selectedReward = null;
      this.rewards = [];
      const rewardNode = prologueChapter.nodes['reward-prologue-battle1'];
      const nextId = rewardNode?.kind === 'reward' ? nextChapterNodeId(prologueChapter, rewardNode.id) : null;
      if (!nextId) throw new Error('序章奖励节点缺少后续剧情。');
      this.showBeat(nextId);
      return;
    }
    if (action === 'retry-battle' && this.currentEncounter) {
      this.startBattle(this.currentEncounter, true);
      return;
    }
    if (action === 'return-menu') {
      this.actions.returnToMenu();
      return;
    }
    if (action === 'acquire-keepsake') {
      if (completePrologue(this.state)) {
        if (!this.sessions.completeChapter(prologueChapter.grants.prologue_complete!)) return;
        this.actions.completed();
        this.actions.returnToMenu();
      }
      return;
    }
    if (target.closest('.skip-confirm-backdrop')) return;
    if (target.closest('.prologue-scene') && this.screen === 'story') {
      if (this.visibleText !== this.currentText()) this.completeTyping();
      else this.advance();
    }
  };

  constructor(private readonly root: HTMLElement, seed: number, private readonly actions: PrologueActions, private readonly sessions: SessionCoordinator, resume?: ActiveSessionSnapshot) {
    const firstBeatId = prologueBeats[0]!.id;
    const chapter = sessions.snapshot.campaign.chapters.prologue;
    const resumeFlags: Partial<Record<PrologueFlag, true>> = {};
    for (const [flag, enabled] of Object.entries(chapter?.flags ?? {})) if (enabled) resumeFlags[flag as PrologueFlag] = true;
    this.state = resume?.mode === 'chapter' && resume.chapterId === 'prologue'
      ? restorePrologueState(chapter?.currentNodeId ?? firstBeatId, resumeFlags, typeof chapter?.variables.childObsession === 'number' ? chapter.variables.childObsession : 40, chapter?.status === 'complete')
      : createPrologueState(firstBeatId);
    this.runState = resume?.mode === 'chapter' && resume.chapterId === 'prologue' && resume.runState
      ? structuredClone(resume.runState)
      : createRun('feichuan', seed);
    this.currentEncounter = resume?.encounterId && resume.encounterId in prologueBattleEncounters ? resume.encounterId as EncounterID : null;
    this.battleAttempt = resume?.battleAttempt ?? 0;
    this.rewards = resume?.offeredRewardIds ?? [];
    this.selectedReward = resume?.selectedRewardId ?? null;
    this.appliedSessionEventIds = new Set(resume?.appliedSessionEventIds ?? []);
    if (!resume) sessions.startPrologue(firstBeatId, this.runState);
    this.viewport = root.closest<HTMLElement>('.game-viewport');
    this.root.addEventListener('click', this.onClick);
    if (resume?.screen === 'battle' || resume?.screen === 'battle_result') {
      if (!this.currentEncounter || !resume.battle) throw new Error('序章战斗存档缺少遭遇或战斗快照。');
      this.startBattle(this.currentEncounter, false, resume.battle);
    } else if (resume?.screen === 'reward') void this.preloadRewardImages().then(() => this.renderReward());
    else if (resume?.screen === 'retry' && this.currentEncounter) this.renderRetry(this.currentEncounter);
    else if (resume?.screen === 'keepsake') this.showKeepsake();
    else this.showBeat(this.state.currentBeatId);
  }

  destroy(): void {
    this.battleView?.destroy();
    this.battleView = null;
    this.root.removeEventListener('click', this.onClick);
    this.clearTyping();
    this.setStoryBlack(false);
  }

  debugFinishBattle(result: 'won' | 'lost'): void {
    if (!this.currentEncounter) return;
    const current = this.battleView?.state;
    const state = result === 'won' && current
      ? { ...current, Obsession: prologueBattleEncounters[this.currentEncounter].VictoryObsession ?? 0 }
      : current;
    void this.onBattleComplete(this.currentEncounter, result, state);
  }

  debugState(): unknown {
    return { screen: this.screen, story: structuredClone(this.state), run: structuredClone(this.runState), battle: this.battleView?.state ?? null };
  }

  private advance(): void {
    const beat = prologueBeatById.get(this.state.currentBeatId);
    if (!beat || this.screen !== 'story') return;
    if (beat.transition) {
      this.handleTransition(beat.transition);
      return;
    }
    if (beat.ending) {
      this.showKeepsake();
      return;
    }
    const nextId = nextChapterNodeId(prologueChapter, beat.id);
    if (nextId) this.showBeat(nextId);
  }

  private handleTransition(transition: PrologueTransition): void {
    if (transition === 'battle1') this.startBattle('battle1');
    else if (transition === 'battle2') this.startBattle('battle2');
    else if (transition === 'finalBattle') this.startBattle('finalBattle');
  }

  private showBeat(id: string): void {
    const beat = prologueBeatById.get(id);
    if (!beat) throw new Error(`缺少序章对白节点：${id}`);
    this.battleView?.destroy();
    this.battleView = null;
    this.screen = 'story';
    this.clearTyping();
    this.visibleText = '';
    this.skipConfirmation = false;
    this.setStoryBlack(true);
    this.applyStoryBeat(beat);
    this.renderStory(beat);
    this.startTyping(beat.textKey ? textForKey(beat.textKey) : '');
    this.checkpoint('story');
  }

  private startBattle(encounterID: EncounterID, retry = false, snapshot?: BattleSnapshot): void {
    if (retry) {
      this.battleAttempt++;
      this.completedBattles.delete(encounterID);
    }
    else this.battleAttempt = 0;
    this.currentEncounter = encounterID;
    this.screen = 'battle';
    this.setStoryBlack(false);
    const config = prologueBattleEncounters[encounterID];
    const encounter = { ...config };
    if (!snapshot) this.state.childObsession = encounter.StartingObsession ?? this.state.childObsession;
    const encounterNumber = encounterID === 'battle1' ? 1 : encounterID === 'battle2' ? 2 : 3;
    const seed = snapshot?.state.Seed ?? ((this.runState.Seed + Math.imul(encounterNumber, 0x6d2b79f5) + Math.imul(this.battleAttempt, 0x9e3779b9)) >>> 0);
    this.battleView?.destroy();
    this.battleView = new BattleView(this.root, {
      seed,
      battleID: `prologue-${encounterID}-${this.battleAttempt}`,
      characterID: this.runState.SelectedCharacterID,
      deck: this.runState.RunDeck,
      encounter,
      backgroundPath: backgrounds[encounterID === 'battle1' ? 'road' : 'shallows'],
      soulArtState: encounterID === 'finalBattle' ? 'hesitant' : 'normal',
      releaseOnlyVictory: true,
      ...(snapshot ? { snapshot: toBattleRuntimeSnapshot(snapshot) } : {}),
      onCheckpoint: state => this.checkpoint('battle', state),
      onComplete: result => void this.onBattleComplete(encounterID, result, this.battleView?.state),
    });
  }

  private async onBattleComplete(encounterID: EncounterID, result: 'won' | 'lost', battle?: Readonly<BattleState>): Promise<void> {
    if (this.currentEncounter !== encounterID || this.screen !== 'battle' || this.completedBattles.has(encounterID)) return;
    const eventId = `prologue-battle:${this.runState.Seed}:${encounterID}:${this.battleAttempt}:${result}`;
    if (this.appliedSessionEventIds.has(eventId)) return;
    this.completedBattles.add(encounterID);
    this.appliedSessionEventIds.add(eventId);
    this.battleView?.destroy();
    this.battleView = null;
    if (result === 'lost') {
      this.screen = 'retry';
      this.renderRetry(encounterID);
      this.checkpoint('retry');
      return;
    }
    this.state.childObsession = battle?.Obsession ?? prologueBattleEncounters[encounterID].VictoryObsession ?? 0;
    this.currentEncounter = null;
    if (encounterID === 'battle1') {
      this.state.storyFlags.battle_1_complete = true;
      this.runState.Status = 'reward';
      this.rewards = generateRewards(this.runState);
      this.selectedReward = null;
      this.checkpoint('reward');
      await this.preloadRewardImages();
      this.screen = 'reward';
      this.renderReward();
    } else if (encounterID === 'battle2') {
      this.state.storyFlags.battle_2_complete = true;
      this.runState.CurrentEncounter = 3;
      this.runState.Status = 'battle';
      this.showNextAfterTransition('battle2');
    } else {
      this.state.storyFlags.final_battle_complete = true;
      this.state.storyFlags.child_ready_to_release = true;
      this.showNextAfterTransition('finalBattle');
    }
  }

  private async preloadRewardImages(): Promise<void> {
    const paths = [...cardArtPaths, ...this.rewards.map(id => cardDatabase.get(id).art_path)];
    await Promise.all([...new Set(paths)].map(path => new Promise<void>(resolve => {
      const image = new Image();
      image.onload = image.onerror = () => resolve();
      image.src = assetURL(path);
      if (image.complete) resolve();
    })));
  }

  private renderReward(): void {
    this.setStoryBlack(false);
    const options = this.rewards.map(id => {
      const selected = this.selectedReward === id;
      return `<button class="reward-option ${selected ? 'selected' : ''}" data-prologue-action="select-reward" data-card="${esc(id)}" aria-pressed="${selected}"><span class="reward-card">${CardView.render(cardDatabase.get(id))}</span></button>`;
    }).join('');
    this.root.innerHTML = `<main class="run-screen reward-screen prologue-reward-screen"><img class="run-background" src="${assetURL(Assets.run.background)}" alt=""><header class="reward-title"><span class="reward-title-art" aria-hidden="true"></span><h1>择取一物</h1><p>为接下来的寻找添一张牌</p></header><section class="reward-options" aria-label="选择一张奖励卡牌">${options}</section>${primaryButton('收入行囊', 'claim-reward', !this.selectedReward, 'run-primary')}</main>`;
    const confirm = this.root.querySelector<HTMLButtonElement>('.run-primary');
    if (confirm) confirm.dataset.prologueAction = 'claim-reward';
    fitCardText(this.root);
  }

  private renderRetry(encounterID: EncounterID): void {
    this.setStoryBlack(false);
    const background = backgrounds[encounterID === 'battle1' ? 'road' : 'shallows'];
    const name = encounterID === 'battle1' ? '第一次安抚' : encounterID === 'battle2' ? '寻找途中' : '最后的心愿';
    this.root.innerHTML = `<main class="prologue-scene"><img class="prologue-background" src="${assetURL(background)}" alt=""><div class="prologue-darken"></div><section class="prologue-retry-layer"><div class="prologue-retry-card" role="alertdialog" aria-modal="true"><h2>${name}</h2><p>今夜还没有结束，可以只重试这一场。</p>${primaryButton('重新挑战', 'retry-battle', false, 'prologue-retry-button')}</div></section></main>`;
    const button = this.root.querySelector<HTMLButtonElement>('.prologue-retry-button');
    if (button) button.dataset.prologueAction = 'retry-battle';
  }

  private renderStory(beat: StoryBeat): void {
    const childReleased = this.state.storyFlags.child_released === true;
    const childSource = childReleased ? Assets.prologue.child.released : Assets.prologue.child.normal;
    const showChild = this.state.storyFlags.met_child === true && beat.id !== 'beat-0645';
    const showFeichuan = this.state.storyFlags.met_feichuan === true;
    const childActive = beat.speaker === 'child';
    const feichuanActive = beat.speaker === 'feichuan';
    const traceUnlocked = this.state.storyFlags.wooden_boat_trace_unlocked === true;
    const showProp = !traceUnlocked && (beat.prop === 'woodenBoat' || this.state.storyFlags.boat_found === true);
    const prop = showProp ? `<img class="story-prop" src="${assetURL(Assets.prologue.woodenBoat)}" alt="小木船" draggable="false">` : '';
    const speaker = beat.speaker === 'narrator' ? '' : `<span class="story-speaker">${speakerName[beat.speaker]}</span>`;
    const skipButton = !beat.transition && !beat.ending
      ? `<button class="story-skip-trigger" data-prologue-action="open-skip-confirmation" aria-label="跳过当前剧情">跳过剧情</button>` : '';
    const skipModal = this.skipConfirmation ? `<div class="skip-confirm-backdrop"><section class="skip-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="skip-confirm-title"><h2 id="skip-confirm-title">跳过剧情？</h2><p>将跳过接下来的对白，直到下一场战斗或章节信物页。</p><div class="skip-confirm-actions">${primaryButton('跳过', 'confirm-skip-story', false, 'skip-confirm-primary')}${primaryButton('继续观看', 'cancel-skip-confirmation', false, 'skip-confirm-secondary')}</div></section></div>` : '';
    const text = beat.textKey ? textForKey(beat.textKey) : '';
    this.root.innerHTML = `<main class="prologue-scene is-story-black" data-testid="prologue-scene" data-beat-id="${beat.id}" aria-label="序章剧情">
      ${skipButton}
      ${showChild ? `<img class="story-character story-child ${childActive ? 'is-active' : ''} ${childReleased ? 'story-released' : ''}" data-testid="story-child" src="${assetURL(childSource)}" alt="孩子" draggable="false">` : ''}
      ${showFeichuan ? `<img class="story-character story-feichuan ${feichuanActive ? 'is-active' : ''}" data-testid="story-feichuan" src="${assetURL(sceneArt.character)}" alt="绯川" draggable="false">` : ''}
      ${prop}
      ${traceUnlocked ? renderFerryTraceLayer(this.state.storyFlags) : ''}
      <section class="story-dialogue" data-testid="story-dialogue" aria-live="polite">${speaker}<p class="story-text">${esc(this.visibleText)}</p></section>
      <span class="story-continue" aria-hidden="true">${this.visibleText === text ? '点击继续' : '点击显示全文'}</span>
      ${skipModal}
    </main>`;
    for (const [selector, action] of [['.story-skip-trigger', 'open-skip-confirmation'], ['.skip-confirm-primary', 'confirm-skip-story'], ['.skip-confirm-secondary', 'cancel-skip-confirmation']] as const) {
      const button = this.root.querySelector<HTMLElement>(selector);
      if (button) button.dataset.prologueAction = action;
    }
  }

  private setStoryBlack(enabled: boolean): void {
    this.viewport?.classList.toggle('prologue-story-black', enabled);
  }

  private currentText(): string {
    const textKey = prologueBeatById.get(this.state.currentBeatId)?.textKey;
    return textKey ? textForKey(textKey) : '';
  }

  private startTyping(text: string): void {
    const chars = Array.from(text);
    if (!chars.length) return;
    let index = 0;
    this.typingTimer = setInterval(() => {
      index = Math.min(chars.length, index + 1);
      this.visibleText = chars.slice(0, index).join('');
      const node = this.root.querySelector<HTMLElement>('.story-text');
      if (node) node.textContent = this.visibleText;
      const prompt = this.root.querySelector<HTMLElement>('.story-continue');
      if (prompt && index >= chars.length) prompt.textContent = '点击继续';
      if (index >= chars.length) this.clearTyping();
    }, 28);
  }

  private completeTyping(): void {
    this.clearTyping();
    this.visibleText = this.currentText();
    const node = this.root.querySelector<HTMLElement>('.story-text');
    if (node) node.textContent = this.visibleText;
    const prompt = this.root.querySelector<HTMLElement>('.story-continue');
    if (prompt) prompt.textContent = '点击继续';
  }

  private clearTyping(): void {
    if (this.typingTimer) clearInterval(this.typingTimer);
    this.typingTimer = null;
  }

  private showNextAfterTransition(transition: PrologueTransition): void {
    const encounterId = `transition-${transition}`;
    const nextId = encounterResultNodeId(prologueChapter, encounterId, 'victory');
    if (!nextId) throw new Error(`序章缺少战斗胜利后的节点：${transition}`);
    const nextNode = prologueChapter.nodes[nextId];
    if (nextNode?.kind === 'reward') {
      this.screen = 'reward';
      this.checkpoint('reward');
      void this.preloadRewardImages().then(() => this.renderReward());
      return;
    }
    this.showBeat(nextId);
  }

  private applyStoryBeat(beat: StoryBeat): void {
    if (beat.id === 'beat-0618') resolveChildRelease(this.state);
    const node = prologueChapter.nodes[beat.id];
    const flags = Object.fromEntries(Object.entries(this.state.storyFlags).filter((entry): entry is [string, true] => entry[1] === true));
    const entered = enterCommands({
      chapterId: 'prologue', currentNodeId: beat.id, flags, variables: { childObsession: this.state.childObsession }, status: 'in_progress',
    }, node?.kind === 'story' ? node.onEnter : []);
    this.state.currentBeatId = beat.id;
    this.state.storyFlags = entered.flags as Partial<Record<PrologueFlag, true>>;
  }

  private fastForwardStory(): void {
    this.skipConfirmation = false;
    this.clearTyping();
    let cursor = this.state.currentBeatId;
    while (true) {
      const nextId = nextChapterNodeId(prologueChapter, cursor);
      if (!nextId) return;
      const node = prologueChapter.nodes[nextId];
      const beat = prologueBeatById.get(nextId);
      if (node?.kind === 'encounter') {
        if (!beat?.transition) throw new Error(`遭遇节点缺少序章转场配置：${nextId}`);
        this.applyStoryBeat(beat);
        this.handleTransition(beat.transition);
        return;
      }
      if (node?.kind === 'chapter_end') {
        if (beat) this.applyStoryBeat(beat);
        this.showKeepsake();
        return;
      }
      if (node?.kind === 'reward') {
        this.screen = 'reward';
        this.checkpoint('reward');
        void this.preloadRewardImages().then(() => this.renderReward());
        return;
      }
      if (node?.kind !== 'story' || !beat) return;
      this.applyStoryBeat(beat);
      cursor = nextId;
    }
  }

  private showKeepsake(): void {
    this.screen = 'keepsake';
    this.setStoryBlack(true);
    this.root.innerHTML = `<main class="prologue-keepsake" data-testid="prologue-keepsake"><img class="keepsake-art" src="${assetURL(Assets.prologue.woodenBoat)}" alt="小木船"><h1>小木船</h1>${primaryButton('获取信物', 'acquire-keepsake', false, 'prologue-keepsake-button')}</main>`;
    const button = this.root.querySelector<HTMLElement>('.prologue-keepsake-button');
    if (button) button.dataset.prologueAction = 'acquire-keepsake';
    this.checkpoint('keepsake');
  }

  private checkpoint(screen: PrologueScreen, battle?: BattleRuntimeSnapshot): void {
    this.screen = screen;
    const active: ActiveSessionSnapshot = {
      mode: 'chapter', chapterId: 'prologue', runState: structuredClone(this.runState), screen,
      appliedSessionEventIds: [...this.appliedSessionEventIds],
      ...(this.currentEncounter ? { encounterId: this.currentEncounter } : {}),
      ...(this.battleAttempt > 0 ? { battleAttempt: this.battleAttempt } : {}),
      ...(battle && this.currentEncounter ? {
        battle: {
          snapshotVersion: 1,
          contentVersion: CONTENT_VERSION,
          encounterId: this.currentEncounter,
          state: battle.state,
          encounterConfig: battle.encounterConfig,
          turnIndex: battle.turnIndex,
          nextInstanceNumber: battle.nextInstanceNumber,
        },
      } : {}),
      ...(screen === 'reward' ? {
        offeredRewardIds: [...this.rewards],
        ...(this.selectedReward ? { selectedRewardId: this.selectedReward } : {}),
      } : {}),
    };
    this.sessions.checkpoint(active, {
      chapterId: 'prologue', currentNodeId: this.state.currentBeatId,
      flags: Object.fromEntries(Object.entries(this.state.storyFlags).filter((entry): entry is [string, true] => entry[1] === true)),
      variables: { childObsession: this.state.childObsession }, status: 'in_progress',
    });
  }
}
