import { Assets } from '../core/asset-manifest';
import { battleSeed, claimReward, createRun, finishEncounter, generateRewards, type RunState } from '../core/run';
import { cardDatabase } from '../core/card-database';
import { BattleView } from './game-view';
import { assetURL, CardView, escapeHTML as esc, fitCardText } from './card-view';
import { infoPanelClass, primaryButton } from './ui-components';

const runAssetPaths = [
  Assets.run.background,
  ...Object.values(Assets.run.reward),
  ...Object.values(Assets.run.progress),
  ...Object.values(Assets.run.buttons),
  ...Object.values(Assets.run.result),
];

function preloadImages(paths: readonly string[]): Promise<void> {
  return Promise.all([...new Set(paths)].map(path => new Promise<void>(resolve => {
    const image = new Image();
    image.onload = image.onerror = () => resolve();
    image.src = assetURL(path);
    if (image.complete) resolve();
  }))).then(() => undefined);
}

export class RunController {
  readonly state: RunState;
  private battleView: BattleView | null = null;
  private rewards: readonly string[] = [];
  private selectedReward: string | null = null;
  private readonly runAssetsReady = preloadImages(runAssetPaths);
  private readonly onClick = (event: MouseEvent): void => {
    const button = (event.target as Element).closest<HTMLElement>('[data-run-action],[data-action]');
    if (!button) return;
    const action = button.dataset.runAction ?? button.dataset.action;
    if (action === 'select-reward' && button.dataset.card) {
      this.selectedReward = button.dataset.card;
      this.renderReward();
    } else if (action === 'claim-reward' && this.selectedReward) {
      claimReward(this.state, this.selectedReward, this.rewards);
      this.startBattle();
    } else if (action === 'restart-run') {
      const seed = crypto.getRandomValues(new Uint32Array(1))[0];
      Object.assign(this.state, createRun(this.state.SelectedCharacterID, seed));
      this.startBattle();
    }
  };

  constructor(private readonly root: HTMLElement, seed: number, characterID = 'feichuan') {
    this.state = createRun(characterID, seed);
    this.root.addEventListener('click', this.onClick);
    this.startBattle();
  }

  destroy(): void {
    this.battleView?.destroy();
    this.root.removeEventListener('click', this.onClick);
  }

  debugFinishBattle(result: 'won' | 'lost'): void {
    this.battleView?.destroy();
    this.battleView = null;
    void this.onBattleComplete(result);
  }

  private startBattle(): void {
    this.battleView?.destroy();
    this.selectedReward = null;
    this.battleView = new BattleView(this.root, {
      seed: battleSeed(this.state),
      battleID: `run-${this.state.Seed}-encounter-${this.state.CurrentEncounter}`,
      characterID: this.state.SelectedCharacterID,
      deck: this.state.RunDeck,
      onComplete: result => void this.onBattleComplete(result),
    });
  }

  private async onBattleComplete(result: 'won' | 'lost'): Promise<void> {
    this.battleView?.destroy();
    this.battleView = null;
    finishEncounter(this.state, result);
    if (this.state.Status === 'reward') {
      this.rewards = generateRewards(this.state);
      await Promise.all([
        this.runAssetsReady,
        preloadImages([
          Assets.cards.frame,
          Assets.cards.feichuanFrame,
          ...this.rewards.map(id => cardDatabase.get(id).art_path),
        ]),
      ]);
      this.renderReward();
    } else {
      await this.runAssetsReady;
      this.renderResult();
    }
  }

  private progressMarkup(): string {
    const nodes = Array.from({ length: this.state.MaxEncounters }, (_, index) => {
      const encounter = index + 1;
      const status = encounter <= this.state.CompletedEncounters ? 'complete' : encounter === this.state.CurrentEncounter && this.state.Status === 'battle' ? 'current' : 'pending';
      const node = Assets.run.progress[status];
      const path = index < this.state.MaxEncounters - 1
        ? `<img class="run-progress-path" src="${assetURL(index < this.state.CompletedEncounters ? Assets.run.progress.pathComplete : Assets.run.progress.pathPending)}" alt="">` : '';
      return `<span class="run-progress-step"><span class="run-progress-node run-progress-${status}" style="--node-image:url('${assetURL(node)}')" role="img" aria-label="${status}"></span>${path}</span>`;
    }).join('');
    return `<div class="run-progress" aria-label="摆渡进度">${nodes}</div>`;
  }

  private renderReward(): void {
    const options = this.rewards.map(id => {
      const card = cardDatabase.get(id);
      const selected = this.selectedReward === id;
      return `<button class="reward-option ${selected ? 'selected' : ''}" data-run-action="select-reward" data-card="${esc(id)}" aria-pressed="${selected}"><span class="reward-card">${CardView.render(card)}</span></button>`;
    }).join('');
    this.root.innerHTML = `<main class="run-screen reward-screen"><img class="run-background" src="${assetURL(Assets.run.background)}" alt=""><header class="reward-title"><span class="reward-title-art" aria-hidden="true"></span><h1>择取一物</h1><p>为下一程摆渡添一张牌</p></header><section class="reward-options" aria-label="选择一张奖励卡牌">${options}</section>${this.progressMarkup()}${primaryButton('收入行囊', 'claim-reward', !this.selectedReward, 'run-primary')}</main><div class="rotate-screen"><span class="rotate-icon">▯</span><h2>横过来，继续今夜的摆渡</h2></div>`;
    fitCardText(this.root);
  }

  private renderResult(): void {
    const completed = this.state.Status === 'completed';
    this.root.innerHTML = `<main class="run-screen run-result-screen"><img class="run-background" src="${assetURL(Assets.run.background)}" alt=""><span class="run-result-icon" role="img" aria-label="渡船"><img src="${assetURL(Assets.run.result.ferry)}" alt=""></span><h1>${completed ? '本次摆渡完成' : '本次摆渡暂止'}</h1><section class="${infoPanelClass('run-result-panel')}"><dl><div><dt>完成渡魂</dt><dd>${this.state.CompletedEncounters} / ${this.state.MaxEncounters}</dd></div><div><dt>获得卡牌</dt><dd>${this.state.AcquiredCards.length}</dd></div><div><dt>最终牌组</dt><dd>${this.state.RunDeck.length}</dd></div></dl></section>${primaryButton('重新启程', 'restart-run', false, 'run-primary')}</main><div class="rotate-screen"><span class="rotate-icon">▯</span><h2>横过来，继续今夜的摆渡</h2></div>`;
  }
}
