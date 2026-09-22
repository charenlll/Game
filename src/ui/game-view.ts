import { Battle, discardCount, getCost } from '../core/battle';
import { character, getCard, soul } from '../core/content';
import { cardDatabase } from '../core/card-database';
import { Assets } from '../core/asset-manifest';
import type { CardInstance } from '../core/types';
import sceneArt from '../data/scene-art.json';
import { CardView, assetURL, escapeHTML as esc, fitCardText } from './card-view';
import { BattleLayout, DragConfig, FeedbackConfig, HandLayout } from './layout-config';
import { getIntentDisplay } from '../core/intents';
import { BattleFeedback, type FlowSource } from './battle-feedback';
import type { IntentInstance } from '../core/types';

const freshSeed = (): number => crypto.getRandomValues(new Uint32Array(1))[0];
type Panel = 'menu' | 'help' | 'deck' | 'log' | 'intent' | null;
interface DragState {
  pointerId: number; cardId: string; element: HTMLButtonElement;
  startX: number; startY: number; offsetX: number; offsetY: number; dragging: boolean; valid: boolean; previewing: boolean;
  previewElement: HTMLButtonElement | null;
}

export class BattleView {
  private battle: Battle;
  private pending: { card: string; selected: Set<string> } | null = null;
  private notice = '按住手牌向上拖入战斗区域，松手使用。';
  private panel: Panel = null;
  private showResult = true;
  private page = 0;
  private drag: DragState | null = null;
  private pressTimer: ReturnType<typeof setTimeout> | null = null;
  private intentResolving = false;
  private resolving = false;
  private endTurnLocked = false;
  private flowLocked = true;
  private resultStage: 'none' | 'releasing' | 'released' | 'failed' = 'none';
  private obsessionVisualFrom: number | null = null;
  private readonly feedback: BattleFeedback;
  private readonly resizeObserver: ResizeObserver;

  constructor(private readonly root: HTMLElement) {
    const param = new URLSearchParams(location.search).get('seed');
    const seed = param === null ? NaN : Number(param);
    this.battle = new Battle(Number.isInteger(seed) && seed >= 0 && seed <= 0xFFFFFFFF ? seed : freshSeed());
    this.feedback = new BattleFeedback(root);
    root.addEventListener('click', this.onClick);
    root.addEventListener('pointerdown', this.onPointerDown);
    root.addEventListener('pointermove', this.onPointerMove);
    root.addEventListener('pointerup', this.onPointerUp);
    root.addEventListener('pointercancel', this.onPointerCancel);
    root.addEventListener('keydown', this.onKeyDown);
    this.resizeObserver = new ResizeObserver(() => fitCardText(root));
    this.resizeObserver.observe(root);
    this.render();
    void this.runInitialDraw();
  }

  destroy(): void {
    this.root.removeEventListener('click', this.onClick);
    this.root.removeEventListener('pointerdown', this.onPointerDown);
    this.root.removeEventListener('pointermove', this.onPointerMove);
    this.root.removeEventListener('pointerup', this.onPointerUp);
    this.root.removeEventListener('pointercancel', this.onPointerCancel);
    this.root.removeEventListener('keydown', this.onKeyDown);
    this.resizeObserver.disconnect();
    this.feedback.cancel();
    if (this.drag) {
      this.drag.element.classList.remove('pressed', 'dragging', 'valid-target', 'invalid-target', 'previewing');
      this.drag.previewElement?.remove();
    }
    if (this.pressTimer) clearTimeout(this.pressTimer);
    this.drag = null;
  }

  private readonly onClick = (event: MouseEvent): void => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
    if (!button || button.disabled) return;
    const action = button.dataset.action!;
    // 普通卡牌的click只用于查看/弃牌选择，从不执行卡牌效果。
    if (action === 'card') {
      if (!this.pending || !button.dataset.id) return;
      const id = button.dataset.id;
      if (id === this.pending.card) return;
      const selectedCard = this.battle.state.Hand.find(card => card.InstanceID === id);
      if (selectedCard && getCard(selectedCard.DefinitionID).DataType === 'burden') {
        this.notice = '浊念牌不能被弃置。';
        this.render();
        return;
      }
      if (this.pending.selected.has(id)) this.pending.selected.delete(id);
      else if (this.pending.selected.size < this.requiredDiscard()) this.pending.selected.add(id);
      else this.notice = '已选满，可再次点击取消已选牌。';
      this.render();
      return;
    }
    void this.handle(action);
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    const card = (event.target as HTMLElement).closest<HTMLButtonElement>('.card[data-id]');
    if (!card || card.disabled || this.pending || this.resolving || this.endTurnLocked || this.intentResolving || this.flowLocked || this.drag || event.button !== 0) return;
    const id = card.dataset.id!;
    const rect = card.getBoundingClientRect();
    this.drag = { pointerId: event.pointerId, cardId: id, element: card, startX: event.clientX, startY: event.clientY,
      offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, dragging: false, valid: false, previewing: false, previewElement: null };
    try { card.setPointerCapture(event.pointerId); } catch { /* Synthetic tests may not own native pointer capture. */ }
    card.classList.add('pressed');
    this.pressTimer = setTimeout(() => {
      if (!this.drag || this.drag.element !== card || this.drag.dragging) return;
      this.drag.previewing = true;
      card.classList.remove('pressed');
      card.classList.add('previewing');
      const preview = card.cloneNode(true) as HTMLButtonElement;
      preview.className = 'card card-preview';
      preview.removeAttribute('data-action');
      preview.removeAttribute('data-id');
      preview.removeAttribute('style');
      preview.disabled = true;
      this.drag.previewElement = preview;
      this.root.querySelector('.game')?.append(preview);
    }, 420);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.previewing) { event.preventDefault(); return; }
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (!drag.dragging && distance < DragConfig.thresholdPx) return;
    if (!drag.dragging) {
      if (this.pressTimer) { clearTimeout(this.pressTimer); this.pressTimer = null; }
      drag.dragging = true;
      drag.element.classList.remove('pressed');
      drag.element.classList.add('dragging');
    }
    event.preventDefault();
    drag.element.style.left = `${event.clientX - drag.offsetX}px`;
    drag.element.style.top = `${event.clientY - drag.offsetY}px`;
    drag.element.style.bottom = 'auto';
    const zone = DragConfig.playZone;
    const inZone = event.clientX >= innerWidth * zone.leftRatio && event.clientX <= innerWidth * zone.rightRatio
      && event.clientY >= innerHeight * zone.topRatio && event.clientY <= innerHeight * zone.bottomRatio;
    drag.valid = inZone && this.battle.reasonUnavailable(drag.cardId) === null;
    drag.element.classList.toggle('valid-target', drag.valid);
    drag.element.classList.toggle('invalid-target', !drag.valid);
    this.root.querySelector('.play-zone')?.classList.toggle('active', inZone);
    this.root.querySelector('.play-zone')?.classList.toggle('valid', drag.valid);
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (this.pressTimer) { clearTimeout(this.pressTimer); this.pressTimer = null; }
    this.drag = null;
    if (drag.previewing) {
      drag.previewElement?.remove();
      drag.element.classList.remove('previewing');
      this.notice = '按住并向上拖动卡牌使用。';
      return;
    }
    this.root.querySelector('.play-zone')?.classList.remove('active', 'valid');
    if (!drag.dragging || !drag.valid) {
      this.cancelDraggedCard(drag);
      return;
    }
    const card = this.battle.state.Hand.find(item => item.InstanceID === drag.cardId);
    if (!card || this.battle.reasonUnavailable(drag.cardId)) { this.cancelDraggedCard(drag); return; }
    if (discardCount(card)) {
      this.pending = { card: drag.cardId, selected: new Set() };
      this.notice = `选择 ${discardCount(card)} 张其他手牌，然后确认换牌。`;
      this.render();
      return;
    }
    void this.resolveDraggedCard(drag);
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (!this.drag || this.drag.pointerId !== event.pointerId) return;
    if (this.pressTimer) { clearTimeout(this.pressTimer); this.pressTimer = null; }
    const drag = this.drag; this.drag = null; this.cancelDraggedCard(drag);
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    if (this.drag) { const drag = this.drag; this.drag = null; this.cancelDraggedCard(drag); return; }
    this.panel = null; this.showResult = false; this.pending = null; this.render();
    this.root.querySelector<HTMLButtonElement>('[data-action="menu"]')?.focus();
  };

  private cancelDraggedCard(drag: DragState): void {
    drag.previewElement?.remove();
    drag.element.classList.remove('pressed', 'dragging', 'valid-target', 'invalid-target', 'previewing');
    drag.element.removeAttribute('style');
    this.notice = drag.dragging ? '已取消出牌，灯火与手牌未改变。' : '按住并向上拖动卡牌使用。';
    this.render();
  }

  private async resolveDraggedCard(drag: DragState): Promise<void> {
    if (this.resolving) { this.cancelDraggedCard(drag); return; }
    this.resolving = true;
    drag.element.classList.remove('dragging', 'valid-target');
    drag.element.classList.add('resolving');
    drag.element.style.left = `${innerWidth / 2 - drag.offsetX}px`;
    drag.element.style.top = `${innerHeight * 0.28 - drag.offsetY}px`;
    await new Promise(resolve => setTimeout(resolve, DragConfig.resolveDurationMs / 2));
    const source = this.captureElement(drag.element);
    await this.commit(drag.cardId, [], source ? [source] : []);
    this.resolving = false;
    this.render();
  }

  private requiredDiscard(): number {
    const card = this.battle.state.Hand.find(c => c.InstanceID === this.pending?.card);
    return card ? discardCount(card) : 0;
  }

  private async runInitialDraw(): Promise<void> {
    const token = this.feedback.token();
    await this.feedback.draw(this.battle.state.Hand.map(card => card.InstanceID), token);
    if (!this.feedback.active(token)) return;
    this.flowLocked = false;
    this.render();
  }

  private captureElement(element: Element | null): FlowSource | null {
    if (!(element instanceof HTMLElement)) return null;
    return { html: element.outerHTML, rect: element.getBoundingClientRect() };
  }

  private captureCards(ids: readonly string[]): FlowSource[] {
    return ids.map(id => this.captureElement(this.root.querySelector(`.card[data-id="${CSS.escape(id)}"]`))).filter(Boolean) as FlowSource[];
  }

  private async commit(id: string, discards: string[] = [], captured: FlowSource[] = []): Promise<void> {
    const card = this.battle.state.Hand.find(c => c.InstanceID === id);
    if (!card) return;
    const token = this.feedback.token();
    const beforeObsession = this.battle.state.Obsession;
    const beforeLight = this.battle.state.Light;
    const beforeHand = new Set(this.battle.state.Hand.map(item => item.InstanceID));
    const sources = captured.length ? captured : this.captureCards([id, ...discards]);
    const definition = getCard(card.DefinitionID);
    const result = this.battle.play(id, discards);
    if (!result.Ok) { this.notice = result.Message; return; }
    const reduction = beforeObsession - this.battle.state.Obsession;
    const lightDelta = this.battle.state.Light - beforeLight;
    const removedFromHand = new Set([id, ...discards]);
    const drawn = this.battle.state.Hand.filter(item => !beforeHand.has(item.InstanceID) || removedFromHand.has(item.InstanceID)).map(item => item.InstanceID);
    this.notice = `已使用「${definition.Name}」。`;
    this.pending = null;
    this.flowLocked = true;
    if (this.battle.state.Status === 'won') { this.showResult = false; this.resultStage = 'none'; }
    if (reduction > 0) this.obsessionVisualFrom = beforeObsession;
    this.render();
    if (reduction > 0) {
      this.feedback.float('.soul-feedback-anchor', `${definition.Name} · 执念 −${reduction}`, 'soul', token);
      this.feedback.pulse('.soul-unresolved', undefined, token);
      this.feedback.soulFlames(undefined, token);
    }
    if (lightDelta !== 0) {
      this.feedback.float('.light-orb', `${lightDelta > 0 ? '+' : ''}${lightDelta} 灯火`, 'light', token);
      this.feedback.pulse('.light-orb', undefined, token);
    }
    const destination = definition.PlayBehavior === 'exhaust' ? '.exhaust-pile' : '.discard-pile';
    await Promise.all([
      this.feedback.move(sources, destination, definition.PlayBehavior === 'exhaust' ? 'exhaust' : 'discard', token),
      this.feedback.draw(drawn, token),
    ]);
    if (!this.feedback.active(token)) return;
    if (this.battle.state.Status === 'won') await this.runSuccess(token);
    else { this.flowLocked = false; this.render(); }
  }

  private async resolveEndTurn(): Promise<void> {
    const token = this.feedback.token();
    const state = this.battle.state;
    const intent: IntentInstance = { ...state.CurrentIntent };
    const beforeHand = new Set(state.Hand.map(card => card.InstanceID));
    const normalIDs = state.Hand.filter(card => getCard(card.DefinitionID).DataType === 'normal').map(card => card.InstanceID);
    const discardSources = this.captureCards(normalIDs);
    const beforeObsession = state.Obsession;
    const beforeLight = state.Light;
    this.endTurnLocked = true; this.intentResolving = true; this.flowLocked = true;
    const result = this.battle.endTurn();
    if (!result.Ok) { this.endTurnLocked = false; this.intentResolving = false; this.flowLocked = false; return; }
    const retained = new Set([...beforeHand].filter(id => !normalIDs.includes(id)));
    const added = state.Hand.filter(card => !retained.has(card.InstanceID));
    const intentBurden = intent.IntentID === 'intent_burden' ? added.filter(card => card.DefinitionID === 'burden_002').map(card => card.InstanceID) : [];
    const drawn = added.filter(card => !intentBurden.includes(card.InstanceID)).map(card => card.InstanceID);
    const obsessionDelta = state.Obsession - beforeObsession;
    const lightDelta = state.Light - beforeLight;
    this.page = 0;
    if (state.Status === 'lost') { this.showResult = false; this.resultStage = 'none'; }
    if (obsessionDelta !== 0) this.obsessionVisualFrom = beforeObsession;
    this.render();
    this.feedback.pulse('.intent-card', FeedbackConfig.pulseMs, token);
    this.feedback.float('.intent-card', getIntentDisplay(intent).name, 'intent', token);
    if (intent.IntentID === 'intent_hesitation_spread') {
      this.feedback.pulse('.draw-pile', FeedbackConfig.pulseMs, token);
      this.feedback.float('.draw-pile', '+1 踌躇', 'intent', token);
    }
    if (obsessionDelta > 0) {
      this.feedback.float('.obsession-track', `执念 +${obsessionDelta}`, 'intent', token);
      this.feedback.pulse('.soul-unresolved', FeedbackConfig.pulseMs, token);
    }
    if (lightDelta !== 0) {
      this.feedback.float('.light-orb', `${lightDelta > 0 ? '+' : ''}${lightDelta} 灯火`, 'light', token);
      this.feedback.pulse('.light-orb', FeedbackConfig.pulseMs, token);
    }
    await Promise.all([
      this.feedback.move(discardSources, '.discard-pile', 'discard', token),
      this.feedback.draw(drawn, token),
      this.feedback.draw(intentBurden, token, '.intent-card'),
    ]);
    if (!this.feedback.active(token)) return;
    this.intentResolving = false;
    this.notice = state.Status === 'lost' ? '夜尽，亡魂的执念仍未化解。'
      : state.Turn === state.MaxTurns ? '最后一夜，灯火尚在。' : '灯火已恢复，新的手牌已就绪。';
    if (state.Status === 'lost') await this.runFailure(token);
    else { this.endTurnLocked = false; this.flowLocked = false; this.render(); }
  }

  private async runSuccess(token: number): Promise<void> {
    if (!await this.feedback.delay(FeedbackConfig.releasePauseMs, token)) return;
    this.resultStage = 'releasing';
    this.render();
    this.feedback.soulFlames(FeedbackConfig.soulFlameCount, token);
    this.feedback.pulse('.release-glow', FeedbackConfig.releaseMs, token);
    if (!await this.feedback.delay(FeedbackConfig.releaseMs, token)) return;
    this.resultStage = 'released';
    this.render();
    if (!await this.feedback.delay(FeedbackConfig.resultDelayMs, token)) return;
    this.showResult = true; this.flowLocked = true;
    this.render();
    if (!await this.feedback.delay(FeedbackConfig.resultDisplayMs, token)) return;
    this.showResult = false;
    this.render();
  }

  private async runFailure(token: number): Promise<void> {
    this.resultStage = 'failed';
    this.render();
    if (!await this.feedback.delay(FeedbackConfig.failureDelayMs, token)) return;
    this.showResult = true; this.endTurnLocked = false;
    this.render();
    if (!await this.feedback.delay(FeedbackConfig.resultDisplayMs, token)) return;
    this.showResult = false;
    this.render();
  }

  private async handle(action: string): Promise<void> {
    switch (action) {
      case 'confirm':
        if (this.pending && this.pending.selected.size === this.requiredDiscard()) {
          const ids = [this.pending.card, ...this.pending.selected];
          await this.commit(this.pending.card, [...this.pending.selected], this.captureCards(ids));
        }
        break;
      case 'cancel': this.pending = null; this.notice = '已取消，手牌与灯火未改变。'; break;
      case 'end':
        if (this.pending || this.resolving || this.endTurnLocked || this.flowLocked) return;
        await this.resolveEndTurn();
        break;
      case 'restart': case 'replay': {
        this.feedback.cancel();
        if (this.pressTimer) clearTimeout(this.pressTimer);
        this.pressTimer = null; this.intentResolving = false; this.endTurnLocked = false; this.flowLocked = true;
        const seed = action === 'replay' ? this.battle.state.Seed : freshSeed();
        this.battle = new Battle(seed, `battle-${seed}-${Date.now()}`);
        this.page = 0; this.pending = null; this.panel = null; this.showResult = true; this.resultStage = 'none';
        this.notice = '按住手牌向上拖入战斗区域，松手使用。';
        this.render();
        void this.runInitialDraw();
        return;
        break;
      }
      case 'next': this.page++; break;
      case 'previous': this.page--; break;
      case 'menu': case 'help': case 'deck': case 'log': case 'intent': this.panel = action; break;
      case 'close': this.panel = null; break;
      case 'dismiss-result': this.showResult = false; this.panel = 'log'; break;
    }
    this.render();
  }

  private cardMarkup(card: CardInstance, index: number, count: number): string {
    const data = cardDatabase.get(card.DefinitionID);
    const position = index - (count - 1) / 2;
    const pending = this.pending?.card === card.InstanceID;
    const chosen = this.pending?.selected.has(card.InstanceID) ?? false;
    const unavailable = this.battle.reasonUnavailable(card.InstanceID);
    const intentCostUp = card.CostModifiers.some(mod => mod.Source === 'intent_hesitate' && mod.ExpiresAtTurn >= this.battle.state.Turn);
    return `<button class="card ${data.card_type === 'burden' ? 'burden-card' : ''} ${intentCostUp ? 'intent-cost-up' : ''} ${chosen ? 'chosen' : ''} ${pending ? 'pending' : ''} ${unavailable ? 'unavailable' : ''}"
      style="--offset:${position};--angle:0deg;--arc:0px;--order:${index + 1}"
      data-action="card" data-id="${esc(card.InstanceID)}" data-card="${esc(data.id)}"
      aria-label="${esc(data.name)}，${getCost(card, this.battle.state.Turn)}灯火，${esc(data.description)}" aria-pressed="${chosen}"
      ${pending || this.battle.state.Status !== 'playing' || this.resolving || this.endTurnLocked || this.intentResolving || this.flowLocked ? 'disabled' : ''}>${CardView.render(data, getCost(card, this.battle.state.Turn))}</button>`;
  }

  private modalContent(): string {
    const s = this.battle.state;
    if (this.panel === 'menu') return `<h2 id="dialog-title">夜渡</h2><p class="modal-subtitle">无名渡口 · 单场渡魂</p><div class="menu-grid"><button data-action="help">玩法说明</button><button data-action="deck">牌组一览</button><button data-action="log">渡魂手记</button><button data-action="replay">重试相同牌序</button><button data-action="restart">重新开始</button></div><p class="seed">牌序编号 ${s.Seed}</p>`;
    if (this.panel === 'help') return `<h2 id="dialog-title">玩法说明</h2><div class="rules"><p><b>出牌</b>按住手牌，向上拖进中央战斗区，松手使用；拖回底部或取消手势不会消耗灯火。</p><p><b>目标</b>6夜内将亡魂执念降至0。</p><p><b>回合</b>每回合恢复灯火并补充到5张手牌；普通牌在回合结束时弃置，浊念会持续留在手中。</p><p><b>浊念</b>踌躇不能使用；杂念可支付1灯火移出本局。所有浊念都不能被弃置。</p><p><b>换牌</b>拖出整理行囊后，再选择2张其他普通手牌并确认。</p></div>`;
    if (this.panel === 'deck') {
      const piles = [...s.Hand, ...s.DrawPile, ...s.DiscardPile, ...s.Resolving, ...s.ExhaustPile];
      const entries = cardDatabase.all().map(data => ({ data, count: piles.filter(card => card.DefinitionID === data.id).length })).filter(entry => entry.count > 0);
      return `<h2 id="dialog-title">牌组一览</h2><p class="modal-subtitle">左右滑动查看本局全部卡牌</p><div class="deck-carousel">${entries.map(({ data, count }) => `<article><div class="deck-card">${CardView.render(data)}</div><b class="deck-count">${count} 张</b></article>`).join('')}</div>`;
    }
    if (this.panel === 'intent') {
      const intent = getIntentDisplay(s.CurrentIntent);
      return `<h2 id="dialog-title">${esc(intent.name)}</h2><p class="intent-modal-short">${esc(intent.shortDescription)}</p><p class="intent-modal-detail">${esc(intent.longDescription)}</p>`;
    }
    if (this.panel === 'log') return `<h2 id="dialog-title">渡魂手记</h2><ol class="event-log">${s.Log.map(line => `<li>${esc(line)}</li>`).join('')}</ol>`;
    const won = s.Status === 'won';
    return `<div class="result-symbol">${won ? '渡' : '待'}</div><h2 id="dialog-title">${won ? '渡魂完成' : '渡魂未竟'}</h2><p class="modal-subtitle">${won ? '心事已释，灯火照归途。' : `晨光将至，仍有${s.Obsession}点执念未解。`}</p><div class="result-stats"><span><b>${s.Turn}</b>经历回合</span><span><b>${s.Stats.CardsPlayed}</b>使用卡牌</span><span><b>${s.Obsession}</b>剩余执念</span></div><div class="result-actions"><button class="primary" data-action="restart">再渡一程</button><button data-action="dismiss-result">查看本场记录</button></div>`;
  }

  private render(): void {
    const s = this.battle.state, finished = s.Status !== 'playing';
    const intent = getIntentDisplay(s.CurrentIntent);
    const visible = s.Hand;
    const spacingVw = visible.length <= 1 ? 0 : Math.min(HandLayout.spacingVw, HandLayout.maxSpreadVw / (visible.length - 1));
    const modal = this.panel !== null;
    const variables = `--ferryman-right:${BattleLayout.ferrymanAnchor.rightPercent}%;--ferryman-bottom:${BattleLayout.ferrymanAnchor.bottomPercent}%;--ferryman-scale:${BattleLayout.ferrymanScale};--soul-x:${BattleLayout.soulAnchor.xPercent}%;--soul-y:${BattleLayout.soulAnchor.yPercent}%;--end-x:${BattleLayout.endTurnAnchor.xPercent}%;--end-bottom:${BattleLayout.endTurnAnchor.bottomPx}px;--intent-gap:${BattleLayout.intent.gapPx}px;--intent-width:${BattleLayout.intent.widthPercent}%;--intent-height:${BattleLayout.intent.heightPx}px;--intent-scale:${BattleLayout.intent.scale};--hand-center:${HandLayout.centerPercent}%;--drag-scale:${DragConfig.dragScale};--step:${spacingVw}vw`;
    this.root.innerHTML = `<main class="game ${this.resultStage === 'failed' ? 'battle-unresolved' : ''}" style="${variables}" aria-label="夜渡对局" ${modal ? 'inert' : ''}>
      <img class="scene-background" src="${assetURL(sceneArt.background)}" alt=""><div class="scene-vignette"></div><div class="play-zone" aria-hidden="true"></div>
      <header class="hud"><div class="location"><div><h1>无名渡口</h1><span>第一夜 · 子时</span></div></div><div class="turn-badge"><span>第</span><strong data-testid="turn">${String(s.Turn).padStart(2, '0')}</strong><span>/ ${s.MaxTurns} 夜</span></div><button class="icon-button" data-action="menu" aria-label="打开菜单">☰</button></header>
      <section class="soul-target ${this.resultStage === 'releasing' ? 'releasing' : ''} ${this.resultStage === 'released' ? 'released' : ''}" aria-label="亡魂"><div class="soul-hud"><div class="soul-title-row"><button class="intent-card ${this.intentResolving ? 'resolving' : ''}" data-testid="intent" data-action="intent" aria-label="查看亡魂意图：${esc(intent.name)}"><img src="${assetURL(Assets.battle.intent)}" alt=""><span><b>${esc(intent.name)}</b></span></button><h2>${esc(soul.Name)}</h2></div><div class="soul-status-line"><div class="obsession-track"><span style="width:${(this.obsessionVisualFrom ?? s.Obsession) / s.MaxObsession * 100}%"></span><strong data-testid="obsession">执念 ${s.Obsession} / ${s.MaxObsession}</strong></div></div></div><span class="soul-feedback-anchor" aria-hidden="true"></span><img class="release-glow" src="${assetURL(Assets.effects.release_glow)}" alt=""><img class="soul-image soul-unresolved" src="${assetURL(Assets.souls.unresolved)}" alt=""><img class="soul-image soul-released" src="${assetURL(Assets.souls.released)}" alt=""></section>
      <aside class="character" aria-label="绯川"><img class="character-image" src="${assetURL(sceneArt.character)}" alt=""></aside>
      <div class="character-name" aria-hidden="true"><b>${esc(character.Name)}</b><span>赤狐 · 摆渡人</span></div>
      <section class="resource-cluster" aria-label="对局资源">
        <div class="light-orb" role="img" aria-label="灯火 ${s.Light}"><img src="${assetURL(Assets.icons.IC01)}" alt=""><strong class="light-value" data-testid="light">${s.Light}</strong></div>
        <button class="pile discard-pile" data-action="log" aria-label="查看弃牌与记录，共 ${s.DiscardPile.length} 张"><img src="${assetURL(Assets.piles.UC02)}" alt=""><strong class="resource-value">${s.DiscardPile.length}</strong></button>
        <button class="pile exhaust-pile" data-action="log" aria-label="查看消耗牌与记录，共 ${s.ExhaustPile.length} 张"><img src="${assetURL(Assets.piles.UC03)}" alt=""><strong class="resource-value" data-testid="exhaust-count">${s.ExhaustPile.length}</strong></button>
      </section>
      <button class="pile draw-pile" data-action="deck" aria-label="查看牌库，本轮剩余 ${s.DrawPile.length} 张"><span class="deck-stack" aria-hidden="true"><img src="${assetURL(Assets.cards.back)}" alt=""><img src="${assetURL(Assets.cards.back)}" alt=""><img src="${assetURL(Assets.cards.back)}" alt=""></span><strong class="draw-count" data-testid="draw-count">${s.DrawPile.length}</strong></button>
      ${this.pending ? `<div class="selection-control"><p>弃置手牌 ${this.pending.selected.size} / ${this.requiredDiscard()}</p><button class="primary" data-action="confirm" ${this.pending.selected.size === this.requiredDiscard() ? '' : 'disabled'}>确认换牌</button><button class="quiet-button" data-action="cancel">取消</button></div>` : ''}
      <button class="end-button" data-action="end" ${finished || this.pending || this.resolving || this.endTurnLocked || this.flowLocked ? 'disabled' : ''}><span>结束回合</span><small>恢复灯火 · 重新抽牌</small></button>
      <section class="hand-layer" aria-label="手牌区"><div class="hand" data-testid="hand">${visible.map((card, i) => this.cardMarkup(card, i, visible.length)).join('') || '<p class="empty-hand">手牌已用尽</p>'}</div></section>
      <p class="notice" role="status">${esc(this.notice)}</p>
      ${finished && this.showResult ? `<div class="result-banner ${s.Status === 'won' ? 'success' : 'failure'}" role="status"><img src="${assetURL(s.Status === 'won' ? Assets.results.success : Assets.results.failure)}" alt=""><strong>${s.Status === 'won' ? '渡魂完成' : '渡魂未竟'}</strong></div>` : ''}
    </main>${modal ? `<div class="modal-backdrop"><section class="modal ${this.panel ?? 'result'}" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><button class="modal-close" aria-label="关闭弹层" data-action="${this.panel ? 'close' : 'dismiss-result'}">×</button>${this.modalContent()}</section></div>` : ''}<div class="rotate-screen"><span class="rotate-icon">▯</span><h2>横过来，开始今夜的摆渡</h2></div>`;
    const animateObsession = this.obsessionVisualFrom !== null;
    const renderedBattleID = s.BattleID;
    this.obsessionVisualFrom = null;
    requestAnimationFrame(() => {
      if (this.battle.state.BattleID !== renderedBattleID) return;
      fitCardText(this.root);
      if (animateObsession) this.root.querySelector<HTMLElement>('.obsession-track>span')?.style.setProperty('width', `${s.Obsession / s.MaxObsession * 100}%`);
    });
  }
}
