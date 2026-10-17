import { BattleView } from './game-view';
import { cardDatabase } from '../core/card-database';
import { createRun, generateRewards, type RunState } from '../core/run';
import { getChapterDefinition } from '../data/chapters/chapter-catalog';
import { manyiBeatById, manyiEncounterNames, manyiEncounters, type ManyiSceneId } from '../data/chapters/manyi';
import { manyiBossPhaseArts, manyiSceneAssets, manyiStoryPortrait, manyiVoucherArt } from '../data/chapters/manyi-assets';
import { textForKey } from '../data/locales/text-catalog';
import { enterCommands } from '../core/chapters/chapter-runtime';
import { Assets } from '../core/asset-manifest';
import { CONTENT_VERSION } from '../data/content-version';
import type { BattleRuntimeSnapshot } from '../core/battle';
import type { ChapterNode } from '../core/chapters/chapter-types';
import type { SessionCoordinator } from '../app/session/session-coordinator';
import type { ActiveSessionSnapshot, BattleSnapshot } from '../infrastructure/save/save-schema';
import type { FerrymanId } from '../core/profile/profile-types';
import { assetURL, CardView, escapeHTML as esc, fitCardText } from './card-view';
import { primaryButton } from './ui-components';
import { hb19PanelStyle, applyHubInfoPanelContentRects } from './hub-components';

const chapter = getChapterDefinition('manyi');
const names: Record<string, string> = {
  narrator: '', feichuan: '绯川', chiying: '持盈', achou: '阿筹', awei: '阿桅',
  merchant_voice: '商人声音', other_merchant: '另一商人', worker_voice: '船工声音',
  family_voice: '家属声音', achou_memory: '阿筹的记忆声音',
};
const sectionNames: Record<string, string> = {
  opening: '序幕 · 一枚不肯停下的铜钱', battle1: '第一幕 · 有钱难花',
  battle2: '第一幕 · 越败越富', optionalA: '第一幕 · 未完货路',
  battle3: '第二幕 · 日落之铃', optionalB: '第二幕 · 空泊之位',
  battle4: '第二幕 · 归潮未归', optionalC: '第三幕 · 未结之账',
  battle5: '第三幕 · 最后一航', battle6: '第四幕 · 满溢',
  ending: '终幕 · 今日歇业', epilogue: '尾声 · 无名渡口',
};
const fixedRewards: Readonly<Record<string, string>> = {
  'manyi-battle-1': 'common_007', 'manyi-battle-2': 'common_008', 'manyi-battle-3': 'feichuan_004',
};

function restoreBattle(snapshot: BattleSnapshot): BattleRuntimeSnapshot {
  return { state: snapshot.state, encounterConfig: snapshot.encounterConfig, turnIndex: snapshot.turnIndex, nextInstanceNumber: snapshot.nextInstanceNumber };
}
function sceneForChoice(id: string): ManyiSceneId { return id === 'manyi-choice-a' ? 'ledger' : id === 'manyi-choice-c' ? 'ledger' : 'dock'; }
function hashId(value: string): number { return [...value].reduce((result, char) => (Math.imul(result, 31) + char.charCodeAt(0)) >>> 0, 0); }

export class ManyiController {
  private run: RunState;
  private nodeId = chapter.entryNodeId;
  private battle: BattleView | null = null;
  private encounterId: string | null = null;
  private attempt = 0;
  private rewards: readonly string[] = [];
  private selectedReward: string | null = null;
  private fixedReward = false;
  private screen: ActiveSessionSnapshot['screen'] = 'story';
  private scene: ManyiSceneId = 'ferry';
  private visibleText = '';
  private typingTimer: ReturnType<typeof setInterval> | null = null;
  private skipConfirmation = false;
  private appliedSessionEventIds = new Set<string>();

  private readonly onClick = (event: MouseEvent): void => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const button = target.closest<HTMLElement>('[data-manyi-action]');
    const action = button?.dataset.manyiAction;
    if (action === 'skip-open') { this.skipConfirmation = true; this.renderCurrentStory(); return; }
    if (action === 'skip-cancel') { this.skipConfirmation = false; this.renderCurrentStory(); return; }
    if (action === 'skip-confirm') { this.skipStory(); return; }
    if (action === 'choose' && button?.dataset.option) { this.choose(button.dataset.option); return; }
    if (action === 'reward-select' && button?.dataset.card) { this.selectedReward = button.dataset.card; this.renderReward(); this.checkpoint('reward'); return; }
    if (action === 'reward-claim') { this.claimReward(); return; }
    if (action === 'retry') { this.startBattle(true); return; }
    if (action === 'keepsake-claim') { this.completeChapter(); return; }
    if (action === 'return-hub') { this.actions.returnToHub(); return; }
    if (button) return;
    if (this.skipConfirmation && target.closest('.skip-confirm-backdrop')) return;
    if (this.screen === 'story' && target.closest('.manyi-scene')) {
      if (this.visibleText !== this.currentText()) this.completeTyping();
      else this.advance();
    }
  };

  constructor(private readonly root: HTMLElement, seed: number, private readonly sessions: SessionCoordinator, private readonly actions: { returnToHub(): void }, resume?: ActiveSessionSnapshot) {
    const progress = sessions.snapshot.campaign.chapters.manyi;
    const preferred = sessions.snapshot.profile.ferrymen.currentId;
    const characterId: FerrymanId = preferred;
    this.run = resume?.mode === 'chapter' && resume.chapterId === 'manyi' && resume.runState
      ? structuredClone(resume.runState)
      : createRun(characterId, seed, sessions.startingDeckFor(characterId));
    this.run.MaxEncounters = 9;
    this.nodeId = resume?.mode === 'chapter' && resume.chapterId === 'manyi' ? progress?.currentNodeId ?? chapter.entryNodeId : chapter.entryNodeId;
    this.encounterId = resume?.encounterId ?? null;
    this.attempt = resume?.battleAttempt ?? 0;
    this.rewards = resume?.offeredRewardIds ?? [];
    this.selectedReward = resume?.selectedRewardId ?? null;
    this.appliedSessionEventIds = new Set(resume?.appliedSessionEventIds ?? []);
    this.root.addEventListener('click', this.onClick);
    if (resume?.screen === 'battle' || resume?.screen === 'battle_result') {
      if (!resume.battle || !this.encounterId) throw new Error('《满溢》战斗快照缺失。');
      this.startBattle(false, resume.battle);
    } else if (resume?.screen === 'reward') {
      this.fixedReward = this.rewards.length === 1;
      this.renderReward();
    } else if (resume?.screen === 'retry') this.renderRetry();
    else if (resume?.screen === 'keepsake') this.renderKeepsake();
    else this.showNode(this.nodeId);
  }

  destroy(): void {
    this.battle?.destroy();
    this.root.removeEventListener('click', this.onClick);
    this.clearTyping();
  }

  debugFinishBattle(result: 'won' | 'lost'): void { if (this.encounterId) this.onBattleComplete(this.encounterId, result); }
  debugState(): unknown { return { screen: this.screen, nodeId: this.nodeId, encounterId: this.encounterId, run: structuredClone(this.run), battle: this.battle?.state ?? null }; }

  private showNode(id: string): void {
    const node = chapter.nodes[id];
    if (!node) throw new Error(`《满溢》缺少节点：${id}`);
    this.nodeId = id;
    this.battle?.destroy();
    this.battle = null;
    this.clearTyping();
    this.skipConfirmation = false;
    if (node.kind === 'story') {
      if (node.onEnter?.length) {
        const progress = this.sessions.snapshot.campaign.chapters.manyi;
        const entered = enterCommands({ chapterId: 'manyi', currentNodeId: id, flags: progress?.flags ?? {}, variables: progress?.variables ?? {}, status: 'in_progress' }, node.onEnter);
        this.choiceFlags = entered.flags;
      }
      this.screen = 'story';
      this.scene = node.backgroundId as ManyiSceneId;
      this.visibleText = '';
      this.renderCurrentStory();
      this.startTyping(textForKey(node.textKey));
      this.checkpoint('story');
    } else if (node.kind === 'choice') {
      this.screen = 'story';
      this.scene = sceneForChoice(id);
      this.renderChoice(node);
      this.checkpoint('story');
    } else if (node.kind === 'encounter') {
      this.encounterId = node.encounterId;
      this.attempt = 0;
      this.startBattle();
    } else if (node.kind === 'reward') {
      this.screen = 'reward';
      this.renderReward();
      this.checkpoint('reward');
    } else this.renderKeepsake();
  }

  private currentText(): string {
    const node = chapter.nodes[this.nodeId];
    return node?.kind === 'story' ? textForKey(node.textKey) : '';
  }
  private advance(): void {
    const node = chapter.nodes[this.nodeId];
    if (node?.kind === 'story') this.showNode(node.exit.targetNodeId);
  }
  private choose(optionId: string): void {
    const node = chapter.nodes[this.nodeId];
    if (node?.kind !== 'choice') return;
    const option = node.options.find(item => item.id === optionId);
    if (!option) return;
    const progress = this.sessions.snapshot.campaign.chapters.manyi;
    const entered = enterCommands({ chapterId: 'manyi', currentNodeId: this.nodeId, flags: progress?.flags ?? {}, variables: progress?.variables ?? {}, status: 'in_progress' }, option.effects);
    this.choiceFlags = entered.flags;
    this.showNode(option.nextNodeId);
  }
  private choiceFlags: Record<string, true> | null = null;

  private skipStory(): void {
    this.skipConfirmation = false;
    let cursor = this.nodeId;
    const progress = this.sessions.snapshot.campaign.chapters.manyi;
    let flags = this.choiceFlags ?? progress?.flags ?? {};
    while (chapter.nodes[cursor]?.kind === 'story') {
      const node = chapter.nodes[cursor] as Extract<ChapterNode, { kind: 'story' }>;
      // Skipping presentation still commits encounters/discoveries in the
      // traversed story, just as reading those lines would.
      flags = enterCommands({ chapterId: 'manyi', currentNodeId: cursor, flags, variables: progress?.variables ?? {}, status: 'in_progress' }, node.onEnter).flags;
      cursor = node.exit.targetNodeId;
    }
    this.choiceFlags = flags;
    this.showNode(cursor);
  }

  private startBattle(retry = false, saved?: BattleSnapshot): void {
    if (!this.encounterId) throw new Error('战斗缺少遭遇 ID');
    if (retry) this.attempt++;
    const id = this.encounterId;
    const definition = manyiEncounters[id];
    if (!definition) throw new Error(`未知《满溢》遭遇：${id}`);
    this.screen = 'battle';
    this.run.Status = 'battle';
    this.battle?.destroy();
    this.battle = new BattleView(this.root, {
      seed: saved?.state.Seed ?? ((this.run.Seed + hashId(id) + Math.imul(this.attempt, 0x9e3779b9)) >>> 0),
      battleID: saved?.state.BattleID ?? `manyi-${this.run.Seed}-${id}-${this.attempt}`,
      characterID: this.run.SelectedCharacterID,
      deck: this.run.RunDeck,
      encounter: definition.battle,
      backgroundPath: manyiSceneAssets[definition.backgroundId as ManyiSceneId],
      soulPortraitTopPx: 140,
      locationName: definition.backgroundId === 'ledger' ? '商号账房' : definition.backgroundId === 'street' ? '商埠长街' : '归潮码头',
      timeLabel: `世｜满溢 · ${manyiEncounterNames[id]}`,
      ...(id === 'manyi-battle-6' ? { phaseNames: ['聚财', '负债', '无尽'], phaseSoulArts: manyiBossPhaseArts } : {}),
      releaseOnlyVictory: true,
      onReturnToMenu: () => this.actions.returnToHub(),
      ...(saved ? { snapshot: restoreBattle(saved) } : {}),
      onCheckpoint: snapshot => this.checkpoint('battle', snapshot),
      onComplete: result => this.onBattleComplete(id, result),
    });
  }

  private onBattleComplete(id: string, result: 'won' | 'lost'): void {
    if (this.screen !== 'battle' || this.encounterId !== id) return;
    const eventId = `manyi-battle:${this.run.Seed}:${id}:${this.attempt}:${result}`;
    if (this.appliedSessionEventIds.has(eventId)) return;
    this.appliedSessionEventIds.add(eventId);
    this.battle?.destroy();
    this.battle = null;
    if (result === 'lost') { this.renderRetry(); this.checkpoint('retry'); return; }
    this.run.CompletedEncounters++;
    this.run.CurrentEncounter = this.run.CompletedEncounters + 1;
    this.run.Status = 'reward';
    const rewardNodeId = `reward-${id}`;
    if (chapter.nodes[rewardNodeId]?.kind !== 'reward') throw new Error(`缺少战后奖励：${id}`);
    this.nodeId = rewardNodeId;
    const fixed = fixedRewards[id];
    this.fixedReward = !!fixed && (id !== 'manyi-battle-3' || this.run.SelectedCharacterID === 'feichuan') && !this.sessions.unlockedCardIds().includes(fixed);
    this.rewards = this.fixedReward ? [fixed] : generateRewards(this.run, new Set(this.sessions.unlockedCardIds()));
    this.selectedReward = this.fixedReward ? this.rewards[0]! : null;
    this.encounterId = null;
    this.screen = 'reward';
    this.checkpoint('reward');
    this.renderReward();
  }

  private claimReward(): void {
    if (this.screen !== 'reward' || !this.selectedReward || !this.rewards.includes(this.selectedReward)) return;
    const rewardNode = chapter.nodes[this.nodeId];
    if (rewardNode?.kind !== 'reward') return;
    const cardId = this.selectedReward;
    if (this.fixedReward && !this.sessions.claimChapterCard(cardId, `manyi-fixed:${this.nodeId}`)) return;
    this.run.RunDeck.push(cardId);
    this.run.AcquiredCards.push(cardId);
    this.run.Status = 'battle';
    this.rewards = [];
    this.selectedReward = null;
    this.showNode(rewardNode.nextNodeId);
  }

  private completeChapter(): void {
    const ending = chapter.nodes['manyi-chapter-end'];
    if (ending?.kind !== 'chapter_end') return;
    if (this.sessions.completeChapter(chapter.grants[ending.grantId]!)) this.actions.returnToHub();
  }

  private renderCurrentStory(): void {
    const node = chapter.nodes[this.nodeId];
    if (node?.kind !== 'story') return;
    const speaker = node.speakerId;
    const voice = speaker.endsWith('_voice') || speaker.endsWith('_memory');
    const beat = manyiBeatById.get(this.nodeId);
    const cast = Object.keys(names).filter(id => ['feichuan', 'chiying', 'achou', 'awei'].includes(id) && beat?.cast?.split('；')[0]?.includes(names[id]!));
    const otherSpeaker = !voice && speaker !== 'narrator' && speaker !== 'feichuan' ? speaker : cast.find(id => id !== 'feichuan');
    const groupId = this.nodeId.split('-')[1] ?? '';
    const portraitArt = otherSpeaker ? manyiStoryPortrait(otherSpeaker, groupId, beat?.afterBattle) : null;
    const portrait = portraitArt ? `<img class="manyi-portrait is-guest ${speaker !== otherSpeaker ? 'is-companion' : ''}" src="${assetURL(portraitArt)}" alt="${esc(names[otherSpeaker!] ?? otherSpeaker!)}" draggable="false">` : '';
    const companion = cast.includes('feichuan') || speaker === 'feichuan' ? `<img class="manyi-portrait is-feichuan ${speaker !== 'feichuan' ? 'is-companion' : ''}" src="${assetURL(Assets.ferrymen.feichuan.portrait)}" alt="绯川" draggable="false">` : '';
    const sectionLabel = sectionNames[groupId] ? `<span class="manyi-section-label">${esc(sectionNames[groupId]!)}</span>` : '';
    const skip = `<button class="story-skip-trigger" data-manyi-action="skip-open">跳过剧情</button>`;
    const modal = this.skipConfirmation ? `<div class="skip-confirm-backdrop"><section class="skip-confirm-dialog" role="alertdialog" aria-modal="true"><h2>跳过剧情？</h2><p>将跳到下一个战斗或剧情选择。</p><div class="skip-confirm-actions"><button data-manyi-action="skip-confirm">跳过</button><button data-manyi-action="skip-cancel">继续观看</button></div></section></div>` : '';
    this.root.innerHTML = `<main class="manyi-scene manyi-time-${this.timeClass()} ${this.currentText().includes('画面骤暗') ? 'manyi-flash-dark' : ''}" data-testid="manyi-story" data-node-id="${esc(this.nodeId)}"><img class="manyi-background" src="${assetURL(manyiSceneAssets[this.scene])}" alt=""><div class="manyi-scene-filter"></div>${sectionLabel}${skip}${companion}${portrait}<section class="manyi-dialogue" aria-live="polite">${speaker !== 'narrator' ? `<span class="manyi-speaker">${esc(names[speaker] ?? speaker)}</span>` : ''}<p class="manyi-text">${esc(this.visibleText)}</p></section><span class="manyi-continue">${this.visibleText === this.currentText() ? '点击继续' : '点击显示全文'}</span>${modal}</main>`;
  }

  private timeClass(): string {
    if (/battle3|battle6|optionalB/.test(this.nodeId)) return 'dusk';
    if (/battle4|battle5|optionalC/.test(this.nodeId)) return 'night';
    if (/ending/.test(this.nodeId)) return 'dawn';
    return 'day';
  }

  private renderChoice(node: Extract<ChapterNode, { kind: 'choice' }>): void {
    const options = node.options.map(option => `<button type="button" class="manyi-choice-button" data-manyi-action="choose" data-option="${esc(option.id)}">${esc(textForKey(option.textKey))}</button>`).join('');
    this.root.innerHTML = `<main class="manyi-scene manyi-time-day" data-testid="manyi-choice"><img class="manyi-background" src="${assetURL(manyiSceneAssets[this.scene])}" alt=""><div class="manyi-scene-filter"></div><section class="manyi-choice-panel" style="${hb19PanelStyle()}" data-hb19-panel><div class="manyi-choice-content"><h1>${esc(textForKey(node.promptTextKey))}</h1><div>${options}</div></div></section></main>`;
    applyHubInfoPanelContentRects(this.root);
  }

  private renderReward(): void {
    this.screen = 'reward';
    const cards = this.rewards.map(id => `<button class="reward-option ${this.selectedReward === id ? 'selected' : ''}" data-manyi-action="reward-select" data-card="${esc(id)}" aria-pressed="${this.selectedReward === id}"><span class="reward-card">${CardView.render(cardDatabase.get(id))}</span></button>`).join('');
    this.root.innerHTML = `<main class="run-screen reward-screen manyi-reward-screen"><img class="run-background" src="${assetURL(Assets.run.background)}" alt=""><header class="reward-title"><span class="reward-title-art" aria-hidden="true"></span><h1>${this.fixedReward ? '新牌解锁' : '择取一物'}</h1><p>${this.fixedReward ? '首次完成此战，领取专属奖励' : '为接下来的渡魂添一张牌'}</p></header><section class="reward-options" aria-label="选择奖励卡牌">${cards}</section>${primaryButton('收入行囊', 'reward-claim', !this.selectedReward, 'run-primary')}</main>`;
    this.root.querySelector<HTMLElement>('.run-primary')!.dataset.manyiAction = 'reward-claim';
    fitCardText(this.root);
  }

  private renderRetry(): void {
    this.screen = 'retry';
    const id = this.encounterId ?? '';
    const background = manyiSceneAssets[manyiEncounters[id]?.backgroundId as ManyiSceneId ?? 'ferry'];
    this.root.innerHTML = `<main class="manyi-scene"><img class="manyi-background" src="${assetURL(background)}" alt=""><div class="prologue-retry-layer"><div class="prologue-retry-card" role="alertdialog" aria-modal="true"><h2>${esc(manyiEncounterNames[id] ?? '再试一次')}</h2><p>本场渡魂尚未完成，可以重试这一场。</p><button class="manyi-choice-button" data-manyi-action="retry">重新挑战</button><button class="manyi-choice-button is-secondary" data-manyi-action="return-hub">返回驿站</button></div></div></main>`;
  }

  private renderKeepsake(): void {
    this.screen = 'keepsake';
    this.nodeId = 'manyi-chapter-end';
    this.root.innerHTML = `<main class="prologue-keepsake manyi-keepsake" data-testid="manyi-keepsake"><img class="keepsake-art" src="${assetURL(manyiVoucherArt)}" alt="归潮返航凭证"><h1>归潮返航凭证</h1><p>到港日期始终空白。</p><button class="manyi-choice-button" data-manyi-action="keepsake-claim">获取信物</button></main>`;
    this.checkpoint('keepsake');
  }

  private startTyping(text: string): void {
    const chars = Array.from(text);
    let count = 0;
    this.typingTimer = setInterval(() => {
      count = Math.min(chars.length, count + 1);
      this.visibleText = chars.slice(0, count).join('');
      const target = this.root.querySelector<HTMLElement>('.manyi-text');
      if (target) target.textContent = this.visibleText;
      if (count === chars.length) { this.clearTyping(); const hint = this.root.querySelector<HTMLElement>('.manyi-continue'); if (hint) hint.textContent = '点击继续'; }
    }, 25);
  }
  private clearTyping(): void { if (this.typingTimer) clearInterval(this.typingTimer); this.typingTimer = null; }
  private completeTyping(): void {
    this.clearTyping();
    this.visibleText = this.currentText();
    const target = this.root.querySelector<HTMLElement>('.manyi-text');
    if (target) target.textContent = this.visibleText;
    const hint = this.root.querySelector<HTMLElement>('.manyi-continue');
    if (hint) hint.textContent = '点击继续';
  }

  private checkpoint(screen: ActiveSessionSnapshot['screen'], battle?: BattleRuntimeSnapshot): void {
    this.screen = screen;
    const active: ActiveSessionSnapshot = {
      mode: 'chapter', chapterId: 'manyi', entrySource: 'hub', runState: structuredClone(this.run), screen,
      appliedSessionEventIds: [...this.appliedSessionEventIds],
      ...(this.encounterId ? { encounterId: this.encounterId } : {}),
      ...(this.attempt ? { battleAttempt: this.attempt } : {}),
      ...(battle && this.encounterId ? { battle: { snapshotVersion: 1, contentVersion: CONTENT_VERSION, encounterId: this.encounterId, state: battle.state, encounterConfig: battle.encounterConfig, turnIndex: battle.turnIndex, nextInstanceNumber: battle.nextInstanceNumber } } : {}),
      ...(screen === 'reward' ? { offeredRewardIds: [...this.rewards], ...(this.selectedReward ? { selectedRewardId: this.selectedReward } : {}) } : {}),
    };
    const old = this.sessions.snapshot.campaign.chapters.manyi;
    this.sessions.checkpoint(active, { chapterId: 'manyi', currentNodeId: this.nodeId, flags: this.choiceFlags ?? old?.flags ?? {}, variables: old?.variables ?? {}, status: 'in_progress' });
    this.choiceFlags = null;
  }
}
