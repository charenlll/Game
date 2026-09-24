import { Battle, discardCount, endTurnDiscardCount, selectionCount } from '../core/battle';
import { getCard, getCharacter, getSoul } from '../core/content';
import { cardDatabase } from '../core/card-database';
import { Assets } from '../core/asset-manifest';
import type { BattleState, CardInstance } from '../core/types';
import sceneArt from '../data/scene-art.json';
import { CardView, assetURL, escapeHTML as esc, fitCardText } from './card-view';
import { BattleLayout, DragConfig, FeedbackConfig, HandLayout } from './layout-config';
import { getIntentDisplay } from '../core/intents';
import { BattleFeedback, type FlowSource } from './battle-feedback';
import type { BattleEncounterConfig, IntentInstance } from '../core/types';
import { getTrait } from '../core/traits';
import { infoPanelClass, primaryButton } from './ui-components';
import { screenToGamePoint } from './viewport';

const freshSeed = (): number => crypto.getRandomValues(new Uint32Array(1))[0];
type Panel = 'menu' | 'help' | 'deck' | 'discard' | 'exhaust' | 'light' | 'soul' | 'log' | 'intent' | 'trait' | null;
export interface BattleViewOptions {
  seed?: number;
  battleID?: string;
  characterID?: string;
  deck?: readonly string[];
  encounter?: BattleEncounterConfig;
  backgroundPath?: string;
  soulArtState?: 'normal' | 'hesitant';
  skipVictoryPresentation?: boolean;
  releaseOnlyVictory?: boolean;
  onReturnToMenu?: () => void;
  onComplete?: (result: 'won' | 'lost') => void;
}
interface DragState {
  pointerId: number; cardId: string; element: HTMLButtonElement;
  startX: number; startY: number; offsetX: number; offsetY: number; dragging: boolean; valid: boolean; previewing: boolean;
  previewElement: HTMLButtonElement | null;
}
type PendingSelection =
  | { kind: 'card'; card: string; selected: Set<string> }
  | { kind: 'end'; selected: Set<string> };

export class BattleView {
  private battle: Battle;
  private pending: PendingSelection | null = null;
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
  private intentVisualOverride: IntentInstance | null = null;
  private withheldHandIDs = new Set<string>();
  private readonly feedback: BattleFeedback;
  private readonly resizeObserver: ResizeObserver;
  private readonly popupLayer: HTMLElement;
  private destroyed = false;

  constructor(private readonly root: HTMLElement, private readonly options: BattleViewOptions = {}) {
    const param = new URLSearchParams(location.search).get('seed');
    const querySeed = param === null ? NaN : Number(param);
    const seed = options.seed ?? (Number.isInteger(querySeed) && querySeed >= 0 && querySeed <= 0xFFFFFFFF ? querySeed : freshSeed());
    this.battle = new Battle(seed, options.battleID, options.characterID, options.deck, options.encounter);
    this.feedback = new BattleFeedback(root);
    this.popupLayer = root.closest('.game-viewport')?.querySelector<HTMLElement>('.viewport-overlay') ?? root;
    this.popupLayer.addEventListener('click', this.onClick);
    root.addEventListener('click', this.onClick);
    root.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove, { passive: false });
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerCancel);
    root.addEventListener('keydown', this.onKeyDown);
    this.resizeObserver = new ResizeObserver(() => fitCardText(root));
    this.resizeObserver.observe(root);
    this.render();
    void this.runInitialDraw();
  }

  get state(): Readonly<BattleState> { return this.battle.state; }

  destroy(): void {
    this.destroyed = true;
    this.root.removeEventListener('click', this.onClick);
    this.popupLayer.removeEventListener('click', this.onClick);
    if (this.popupLayer !== this.root) this.popupLayer.querySelector('.battle-popup-layer')?.remove();
    this.root.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerCancel);
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
      if (this.pending.kind === 'card' && id === this.pending.card) return;
      const selectedCard = this.battle.state.Hand.find(card => card.InstanceID === id);
      if (selectedCard && getCard(selectedCard.DefinitionID).DataType === 'burden') {
        this.notice = '浊念牌不能被选择。';
        this.render();
        return;
      }
      if (this.pending.selected.has(id)) this.pending.selected.delete(id);
      else {
        const limit = this.requiredDiscard();
        while (this.pending.selected.size >= limit) {
          const oldest = this.pending.selected.values().next().value;
          if (oldest === undefined) break;
          this.pending.selected.delete(oldest);
        }
        this.pending.selected.add(id);
        this.notice = this.pending.selected.size === limit ? '已选满，点击其他牌可直接替换。' : this.notice;
      }
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
    const point = screenToGamePoint(this.root, event.clientX, event.clientY);
    this.drag = { pointerId: event.pointerId, cardId: id, element: card, startX: event.clientX, startY: event.clientY,
      offsetX: (event.clientX - rect.left) / point.scale, offsetY: (event.clientY - rect.top) / point.scale, dragging: false, valid: false, previewing: false, previewElement: null };
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
    const point = screenToGamePoint(this.root, event.clientX, event.clientY);
    drag.element.style.left = `${point.x - drag.offsetX}px`;
    drag.element.style.top = `${point.y - drag.offsetY}px`;
    drag.element.style.bottom = 'auto';
    const zone = DragConfig.playZone;
    const inZone = point.x >= 1600 * zone.leftRatio && point.x <= 1600 * zone.rightRatio
      && point.y >= 900 * zone.topRatio && point.y <= 900 * zone.bottomRatio;
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
    if (selectionCount(card)) {
      this.pending = { kind: 'card', card: drag.cardId, selected: new Set() };
      this.notice = `选择 ${selectionCount(card)} 张其他普通手牌后确认。`;
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
    drag.element.style.left = `${800 - drag.offsetX}px`;
    drag.element.style.top = `${252 - drag.offsetY}px`;
    await new Promise(resolve => setTimeout(resolve, DragConfig.resolveDurationMs / 2));
    const source = this.captureElement(drag.element);
    await this.commit(drag.cardId, [], source ? [source] : []);
    this.resolving = false;
    this.render();
  }

  private requiredDiscard(): number {
    if (!this.pending) return 0;
    if (this.pending.kind === 'end') return endTurnDiscardCount(this.battle.state);
    const cardID = this.pending.card;
    const card = this.battle.state.Hand.find(c => c.InstanceID === cardID);
    return card ? selectionCount(card) : 0;
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

  private hideFlowCards(ids: readonly string[]): void {
    for (const id of ids) this.root.querySelector<HTMLElement>(`.card[data-id="${CSS.escape(id)}"]`)?.classList.add('flow-hidden');
  }

  private async commit(id: string, discards: string[] = [], captured: FlowSource[] = []): Promise<void> {
    const card = this.battle.state.Hand.find(c => c.InstanceID === id);
    if (!card) return;
    const token = this.feedback.token();
    const beforeObsession = this.battle.state.Obsession;
    const beforeLight = this.battle.state.Light;
    const beforeTraitActive = this.battle.state.CombatTraitDiscountActive;
    const beforeHand = new Set(this.battle.state.Hand.map(item => item.InstanceID));
    const sources = captured.length ? captured : this.captureCards([id, ...discards]);
    const definition = getCard(card.DefinitionID);
    const result = this.battle.play(id, discards);
    if (!result.Ok) { this.notice = result.Message; return; }
    const reduction = beforeObsession - this.battle.state.Obsession;
    const lightDelta = this.battle.state.Light - beforeLight;
    const selectedDiscards = discardCount(card) > 0 ? discards : [];
    const removedFromHand = new Set([id, ...selectedDiscards]);
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
    if (!beforeTraitActive && this.battle.state.CombatTraitDiscountActive) {
      this.feedback.float('.trait-badge', '下一张普通牌 −1费', 'trait', token);
      this.feedback.pulse('.trait-badge', undefined, token);
    } else if (beforeTraitActive && !this.battle.state.CombatTraitDiscountActive) this.feedback.pulse('.trait-badge', undefined, token);
    const destination = definition.PlayBehavior === 'exhaust' ? '.exhaust-pile' : '.discard-pile';
    await Promise.all([
      this.feedback.move(sources, destination, definition.PlayBehavior === 'exhaust' ? 'exhaust' : 'discard', token),
      this.feedback.draw(drawn, token),
    ]);
    if (!this.feedback.active(token)) return;
    if (this.battle.state.Status === 'won') await this.handleVictory(token);
    else { this.flowLocked = false; this.render(); }
  }

  private async resolveEndTurn(discardIDs: string[] = [], captured: FlowSource[] = []): Promise<void> {
    const token = this.feedback.token();
    const state = this.battle.state;
    const intent: IntentInstance = { ...state.CurrentIntent };
    const beforeHand = new Set(state.Hand.map(card => card.InstanceID));
    const discardSources = captured.length ? captured : this.captureCards(discardIDs);
    const beforeObsession = state.Obsession;
    const beforeLight = state.Light;
    this.endTurnLocked = true; this.intentResolving = true; this.flowLocked = true;
    const result = this.battle.endTurn(discardIDs);
    if (!result.Ok) { this.endTurnLocked = false; this.intentResolving = false; this.flowLocked = false; return; }
    const retained = new Set([...beforeHand].filter(id => !discardIDs.includes(id)));
    const added = state.Hand.filter(card => !retained.has(card.InstanceID));
    const intentBurden = intent.IntentID === 'intent_burden' ? added.filter(card => card.DefinitionID === 'burden_002').map(card => card.InstanceID) : [];
    const drawn = added.filter(card => !intentBurden.includes(card.InstanceID)).map(card => card.InstanceID);
    const obsessionDelta = state.Obsession - beforeObsession;
    const lightDelta = state.Light - beforeLight;
    const addedIDs = added.map(card => card.InstanceID);
    this.withheldHandIDs = new Set(addedIDs);
    this.page = 0;
    if (state.Status === 'lost') { this.showResult = false; this.resultStage = 'none'; }
    this.hideFlowCards(discardIDs);
    if (!await this.feedback.move(discardSources, '.discard-pile', 'discard', token)) return;
    if (!await this.feedback.delay(FeedbackConfig.turnEndPauseMs, token)) return;
    this.intentVisualOverride = intent;
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
    if (!await this.feedback.delay(FeedbackConfig.intentDisplayMs, token)) return;
    if (intentBurden.length) {
      for (const id of intentBurden) this.withheldHandIDs.delete(id);
      this.render();
      this.hideFlowCards(intentBurden);
      if (!await this.feedback.draw(intentBurden, token, '.intent-card')) return;
    }
    if (!await this.feedback.delay(FeedbackConfig.intentToDrawPauseMs, token)) return;
    this.intentVisualOverride = null;
    for (const id of drawn) this.withheldHandIDs.delete(id);
    this.render();
    this.hideFlowCards(drawn);
    if (!await this.feedback.draw(drawn, token)) return;
    this.withheldHandIDs.clear();
    this.intentResolving = false;
    this.notice = state.Status === 'lost' ? '夜尽，亡魂的执念仍未化解。'
      : state.Turn === state.MaxTurns ? '最后一夜，灯火尚在。' : '灯火已恢复，摸取2张牌。';
    if (state.Status === 'lost') await this.runFailure(token);
    else if (state.Status === 'won') await this.handleVictory(token);
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
    if (this.options.onComplete) { this.options.onComplete('won'); return; }
    this.render();
  }

  private async handleVictory(token: number): Promise<void> {
    if (this.options.skipVictoryPresentation && this.options.onComplete) {
      this.options.onComplete('won');
      return;
    }
    if (this.options.releaseOnlyVictory && this.options.onComplete) {
      await this.runReleaseOnly(token);
      return;
    }
    await this.runSuccess(token);
  }

  private async runReleaseOnly(token: number): Promise<void> {
    if (!await this.feedback.delay(FeedbackConfig.releasePauseMs, token)) return;
    this.resultStage = 'releasing';
    this.render();
    this.feedback.soulFlames(FeedbackConfig.soulFlameCount, token);
    this.feedback.pulse('.release-glow', FeedbackConfig.releaseMs, token);
    if (!await this.feedback.delay(FeedbackConfig.releaseMs, token)) return;
    this.resultStage = 'released';
    this.render();
    if (!await this.feedback.delay(FeedbackConfig.resultDelayMs, token)) return;
    this.options.onComplete?.('won');
  }

  private async runFailure(token: number): Promise<void> {
    this.resultStage = 'failed';
    this.render();
    if (!await this.feedback.delay(FeedbackConfig.failureDelayMs, token)) return;
    this.showResult = true; this.endTurnLocked = false;
    this.render();
    if (!await this.feedback.delay(FeedbackConfig.resultDisplayMs, token)) return;
    this.showResult = false;
    if (this.options.onComplete) { this.options.onComplete('lost'); return; }
    this.render();
  }

  private async handle(action: string): Promise<void> {
    switch (action) {
      case 'confirm':
        if (this.pending && this.pending.selected.size === this.requiredDiscard()) {
          if (this.pending.kind === 'end') {
            const selected = [...this.pending.selected];
            const captured = this.captureCards(selected);
            this.pending = null;
            await this.resolveEndTurn(selected, captured);
          } else {
            const pending = this.pending;
            const selected = [...pending.selected];
            const card = this.battle.state.Hand.find(item => item.InstanceID === pending.card)!;
            const ids = [pending.card, ...(discardCount(card) > 0 ? selected : [])];
            await this.commit(pending.card, selected, this.captureCards(ids));
          }
        }
        break;
      case 'cancel': this.pending = null; this.notice = '已取消，手牌与灯火未改变。'; break;
      case 'end':
        if (this.pending || this.resolving || this.endTurnLocked || this.flowLocked) return;
        if (endTurnDiscardCount(this.battle.state) > 0) {
          this.pending = { kind: 'end', selected: new Set() };
          this.notice = `手牌超过5张，请选择 ${this.requiredDiscard()} 张普通牌弃置。`;
        } else await this.resolveEndTurn();
        break;
      case 'return-menu':
        if (!this.options.onReturnToMenu) return;
        this.feedback.cancel();
        if (this.pressTimer) clearTimeout(this.pressTimer);
        this.pressTimer = null;
        this.options.onReturnToMenu();
        return;
      case 'restart': case 'replay': {
        this.feedback.cancel();
        if (this.pressTimer) clearTimeout(this.pressTimer);
        this.pressTimer = null; this.intentResolving = false; this.endTurnLocked = false; this.flowLocked = true; this.intentVisualOverride = null; this.withheldHandIDs.clear();
        const seed = action === 'replay' ? this.battle.state.Seed : freshSeed();
        this.battle = new Battle(seed, `battle-${seed}-${Date.now()}`, this.options.characterID, this.options.deck, this.options.encounter);
        this.page = 0; this.pending = null; this.panel = null; this.showResult = true; this.resultStage = 'none';
        this.notice = '按住手牌向上拖入战斗区域，松手使用。';
        this.render();
        void this.runInitialDraw();
        return;
        break;
      }
      case 'next': this.page++; break;
      case 'previous': this.page--; break;
      case 'menu': case 'help': case 'deck': case 'discard': case 'exhaust': case 'light': case 'soul': case 'log': case 'intent': case 'trait': this.panel = action; break;
      case 'close': this.panel = null; break;
      case 'dismiss-result': this.showResult = false; this.panel = 'log'; break;
    }
    this.render();
  }

  private cardMarkup(card: CardInstance, index: number, count: number): string {
    const data = cardDatabase.get(card.DefinitionID);
    const position = index - (count - 1) / 2;
    const pending = this.pending?.kind === 'card' && this.pending.card === card.InstanceID;
    const chosen = this.pending?.selected.has(card.InstanceID) ?? false;
    const unavailable = this.battle.reasonUnavailable(card.InstanceID);
    const intentCostUp = card.CostModifiers.some(mod => mod.Source === 'intent_hesitate' && mod.ExpiresAtTurn >= this.battle.state.Turn);
    const displayedCost = this.battle.cost(card);
    return `<button class="card ${data.card_type === 'burden' ? 'burden-card' : ''} ${intentCostUp ? 'intent-cost-up' : ''} ${chosen ? 'chosen' : ''} ${pending ? 'pending' : ''} ${unavailable ? 'unavailable' : ''} ${unavailable?.startsWith('灯火不足') ? 'insufficient-light' : ''}"
      style="--offset:${position};--angle:0deg;--arc:0px;--order:${index + 1}"
      data-action="card" data-id="${esc(card.InstanceID)}" data-card="${esc(data.id)}"
      data-unavailable-reason="${esc(unavailable ?? '')}"
      aria-label="${esc(data.name)}，${displayedCost}灯火，${esc(data.description)}" aria-pressed="${chosen}"
      ${pending || this.battle.state.Status !== 'playing' || this.resolving || this.endTurnLocked || this.intentResolving || this.flowLocked ? 'disabled' : ''}>${CardView.render(data, displayedCost)}</button>`;
  }

  private selectionMarkup(): string {
    const pending = this.pending;
    if (!pending) return '';
    const required = this.requiredDiscard();
    const isEnd = pending.kind === 'end';
    const source = isEnd ? null : this.battle.state.Hand.find(card => card.InstanceID === pending.card)!;
    const isDiscard = isEnd || (source !== null && discardCount(source) > 0);
    const eyebrow = isEnd ? '回合结束' : getCard(source!.DefinitionID).Name;
    const confirmLabel = isEnd ? '确认结束' : isDiscard ? '确认弃牌' : '确认选择';
    return `<div class="selection-control selection-${pending.kind}" role="group" aria-label="手牌选择"><div class="selection-heading"><span>${esc(eyebrow)}</span><strong>${isEnd ? '整理手牌' : isDiscard ? '选择弃牌' : '选择目标'}</strong></div><p>${isDiscard ? '点击要弃置的普通牌' : '点击要降低费用的普通牌'}</p><div class="selection-progress" aria-label="已选择 ${pending.selected.size} 张，共需 ${required} 张"><b>${pending.selected.size}</b><i>/</i><span>${required}</span></div><div class="selection-actions">${primaryButton('取消', 'cancel', false, 'quiet-button secondary-button')}${primaryButton(confirmLabel, 'confirm', pending.selected.size !== required)}</div></div>`;
  }

  private pileContent(title: string, pile: readonly CardInstance[]): string {
    const entries = cardDatabase.all().map(data => ({ data, count: pile.filter(card => card.DefinitionID === data.id).length })).filter(entry => entry.count > 0);
    return `<h2 id="dialog-title">${esc(title)}</h2>${entries.length ? `<p class="modal-subtitle">左右滑动查看卡牌</p><div class="deck-carousel">${entries.map(({ data, count }) => `<article><div class="deck-card">${CardView.render(data)}</div><b class="deck-count">${count} 张</b></article>`).join('')}</div>` : '<p class="empty-pile-copy">目前没有卡牌。</p>'}`;
  }

  private modalContent(): string {
    const s = this.battle.state;
    if (this.panel === 'menu') return `<h2 id="dialog-title">设置</h2><div class="battle-menu-actions">${primaryButton('重新开始', 'restart', false, 'battle-menu-restart')}${primaryButton('返回主菜单', 'return-menu', !this.options.onReturnToMenu, 'battle-menu-return')}</div>`;
    if (this.panel === 'help') return `<h2 id="dialog-title">玩法说明</h2><div class="rules"><p><b>出牌</b>按住手牌，向上拖进中央战斗区，松手使用；拖回底部或取消手势不会消耗灯火。</p><p><b>目标</b>6夜内将亡魂执念降至0。</p><p><b>回合</b>未使用的牌会保留。每回合恢复灯火并摸2张牌；结束回合时若超过5张，需手动选择普通牌弃到5张。</p><p><b>浊念</b>踌躇不能使用；杂念可支付1灯火移出本局。所有浊念都不能被弃置。</p><p><b>换牌</b>拖出整理行囊后，再选择2张其他普通手牌并确认。</p></div>`;
    if (this.panel === 'deck') {
      const piles = [...s.Hand, ...s.DrawPile, ...s.DiscardPile, ...s.Resolving, ...s.ExhaustPile];
      return this.pileContent('牌组一览', piles);
    }
    if (this.panel === 'discard') return this.pileContent('弃牌堆', s.DiscardPile);
    if (this.panel === 'exhaust') return this.pileContent('消耗牌堆', s.ExhaustPile);
    if (this.panel === 'light') return `<h2 id="dialog-title">灯火</h2><p class="intent-modal-detail">当前拥有 ${s.Light} 点灯火。使用卡牌会消耗灯火，每个新回合恢复至基础灯火，并结算下一回合修正。</p>`;
    if (this.panel === 'soul') return `<h2 id="dialog-title">${esc(getSoul(s.SoulID).Name)}</h2><p class="intent-modal-detail">当前执念 ${s.Obsession} / ${s.MaxObsession}。在第${s.MaxTurns}夜结束前将执念化解，即可完成本阶段。</p>`;
    if (this.panel === 'intent') {
      const intent = getIntentDisplay(this.intentVisualOverride ?? s.CurrentIntent);
      return `<h2 id="dialog-title">${esc(intent.name)}</h2><p class="intent-modal-short">${esc(intent.shortDescription)}</p><p class="intent-modal-detail">${esc(intent.longDescription)}</p>`;
    }
    if (this.panel === 'trait') {
      const trait = s.CombatTraitID ? getTrait(s.CombatTraitID) : null;
      return trait ? `<h2 id="dialog-title">${esc(trait.name)}</h2><p class="intent-modal-detail">${esc(trait.description)}</p>` : '<h2 id="dialog-title">无战斗特性</h2>';
    }
    if (this.panel === 'log') return `<h2 id="dialog-title">渡魂手记</h2><ol class="event-log">${s.Log.map(line => `<li>${esc(line)}</li>`).join('')}</ol>`;
    const won = s.Status === 'won';
    return `<div class="result-symbol">${won ? '渡' : '待'}</div><h2 id="dialog-title">${won ? '渡魂完成' : '渡魂未竟'}</h2><p class="modal-subtitle">${won ? '心事已释，灯火照归途。' : `晨光将至，仍有${s.Obsession}点执念未解。`}</p><div class="result-stats"><span><b>${s.Turn}</b>经历回合</span><span><b>${s.Stats.CardsPlayed}</b>使用卡牌</span><span><b>${s.Obsession}</b>剩余执念</span></div><div class="result-actions">${primaryButton('再渡一程', 'restart')}<button data-action="dismiss-result">查看本场记录</button></div>`;
  }

  private render(): void {
    if (this.destroyed) return;
    const s = this.battle.state, finished = s.Status !== 'playing';
    const activeCharacter = getCharacter(s.CharacterID);
    const activeSoul = getSoul(s.SoulID);
    const unresolvedSoulArt = this.options.soulArtState === 'hesitant'
      ? activeSoul.HesitantArtReference ?? activeSoul.ArtReference
      : activeSoul.ArtReference;
    const releasedSoulArt = activeSoul.ReleasedArtReference;
    const trait = s.CombatTraitID ? getTrait(s.CombatTraitID) : null;
    const intent = getIntentDisplay(this.intentVisualOverride ?? s.CurrentIntent);
    const visible = s.Hand.filter(card => !this.withheldHandIDs.has(card.InstanceID));
    const spacingPx = visible.length <= 1 ? 0 : Math.min(
      HandLayout.spacingVw * 16,
      HandLayout.maxSpreadVw * 16 / (visible.length - 1),
    );
    const modal = this.panel !== null;
    const variables = `--ferryman-right:${BattleLayout.ferrymanAnchor.rightPercent}%;--ferryman-bottom:${BattleLayout.ferrymanAnchor.bottomPercent}%;--ferryman-scale:${BattleLayout.ferrymanScale};--soul-x:${BattleLayout.soulAnchor.xPercent}%;--soul-y:${BattleLayout.soulAnchor.yPercent}%;--end-x:${BattleLayout.endTurnAnchor.xPercent}%;--end-bottom:${BattleLayout.endTurnAnchor.bottomPx}px;--intent-gap:${BattleLayout.intent.gapPx}px;--intent-width:${BattleLayout.intent.widthPercent}%;--intent-height:${BattleLayout.intent.heightPx}px;--intent-scale:${BattleLayout.intent.scale};--hand-center:${HandLayout.centerPercent}%;--drag-scale:${DragConfig.dragScale};--step:${spacingPx}px`;
    this.root.innerHTML = `<main class="game ${this.resultStage === 'failed' ? 'battle-unresolved' : ''}" style="${variables}" aria-label="夜渡对局" ${modal ? 'inert' : ''}>
      <img class="scene-background" src="${assetURL(this.options.backgroundPath ?? sceneArt.background)}" alt=""><div class="scene-vignette"></div><div class="play-zone" aria-hidden="true"></div>
      <header class="hud"><div class="location"><div><h1>无名渡口</h1><span>第一夜 · 子时</span></div></div><div class="turn-badge"><span>第</span><strong data-testid="turn">${String(s.Turn).padStart(2, '0')}</strong><span>/ ${s.MaxTurns} 夜</span></div><button class="icon-button settings-icon-button" data-action="menu" aria-label="设置"><img src="${assetURL(Assets.hub.settings)}" alt=""></button></header>
      <section class="soul-target ${this.intentVisualOverride ? 'intent-reacting' : ''} ${this.resultStage === 'releasing' ? 'releasing' : ''} ${this.resultStage === 'released' ? 'released' : ''}" aria-label="亡魂"><div class="soul-hud"><div class="soul-title-row"><button class="intent-card ${this.intentResolving ? 'resolving' : ''}" data-testid="intent" data-action="intent" aria-label="查看亡魂意图：${esc(intent.name)}"><img src="${assetURL(Assets.battle.intent)}" alt=""><span><b>${esc(intent.name)}</b></span></button><h2>${esc(activeSoul.Name)}</h2></div><div class="soul-status-line"><button class="obsession-track" data-action="soul" aria-label="查看亡魂状态"><span style="width:${(this.obsessionVisualFrom ?? s.Obsession) / s.MaxObsession * 100}%"></span><strong data-testid="obsession">执念 ${s.Obsession} / ${s.MaxObsession}</strong></button></div></div><span class="soul-feedback-anchor" aria-hidden="true"></span><img class="release-glow" src="${assetURL(Assets.effects.release_glow)}" alt=""><img class="soul-image soul-unresolved" src="${assetURL(unresolvedSoulArt ?? Assets.souls.unresolved)}" alt=""><img class="soul-image soul-released" src="${assetURL(releasedSoulArt ?? Assets.souls.released)}" alt=""></section>
      <aside class="character" aria-label="绯川"><img class="character-image" src="${assetURL(sceneArt.character)}" alt=""></aside>
      <div class="character-name" aria-hidden="true"><b>${esc(activeCharacter.Name)}</b><span>${esc(activeCharacter.AnimalType)} · 摆渡人</span></div>
      ${trait ? `<button class="trait-badge ${s.CombatTraitDiscountActive ? 'active' : ''}" style="--trait-glow:${esc(trait.glowColor)}" data-action="trait" aria-label="查看角色特性：${esc(trait.name)}" title="点击查看角色特性"><img src="${assetURL(trait.icon)}" alt=""></button>` : ''}
      <section class="resource-cluster" aria-label="对局资源">
        <button class="light-orb" data-action="light" aria-label="查看灯火说明，当前 ${s.Light} 点"><img src="${assetURL(Assets.icons.IC01)}" alt=""><strong class="light-value" data-testid="light">${s.Light}</strong></button>
        <button class="pile discard-pile" data-action="discard" aria-label="查看弃牌堆，共 ${s.DiscardPile.length} 张"><img src="${assetURL(Assets.piles.UC02)}" alt=""><strong class="resource-value">${s.DiscardPile.length}</strong></button>
        <button class="pile exhaust-pile" data-action="exhaust" aria-label="查看消耗牌堆，共 ${s.ExhaustPile.length} 张"><img src="${assetURL(Assets.piles.UC03)}" alt=""><strong class="resource-value" data-testid="exhaust-count">${s.ExhaustPile.length}</strong></button>
      </section>
      <button class="pile draw-pile" data-action="deck" aria-label="查看牌库，本轮剩余 ${s.DrawPile.length} 张"><span class="deck-stack" aria-hidden="true"><img src="${assetURL(Assets.cards.back)}" alt=""><img src="${assetURL(Assets.cards.back)}" alt=""><img src="${assetURL(Assets.cards.back)}" alt=""></span><strong class="draw-count" data-testid="draw-count">${s.DrawPile.length}</strong></button>
      ${this.selectionMarkup()}
      ${primaryButton('结束回合', 'end', finished || !!this.pending || this.resolving || this.endTurnLocked || this.flowLocked, 'end-button')}
      <section class="hand-layer" aria-label="手牌区"><div class="hand" data-testid="hand">${visible.map((card, i) => this.cardMarkup(card, i, visible.length)).join('') || '<p class="empty-hand">手牌已用尽</p>'}</div></section>
      <p class="notice" role="status">${esc(this.notice)}</p>
      ${finished && this.showResult ? `<div class="result-banner ${s.Status === 'won' ? 'success' : 'failure'}" role="status"><img src="${assetURL(s.Status === 'won' ? Assets.results.success : Assets.results.failure)}" alt=""><strong>${s.Status === 'won' ? '渡魂完成' : '渡魂未竟'}</strong></div>` : ''}
    </main><div class="rotate-screen"><span class="rotate-icon">▯</span><h2>横过来，开始今夜的摆渡</h2></div>`;
    if (this.popupLayer !== this.root) {
      let modalLayer = this.popupLayer.querySelector<HTMLElement>('.battle-popup-layer');
      if (!modalLayer) {
        modalLayer = document.createElement('div');
        modalLayer.className = 'battle-popup-layer';
        this.popupLayer.append(modalLayer);
      }
      modalLayer.innerHTML = modal ? `<div class="modal-backdrop"><section class="modal ${infoPanelClass(this.panel ?? 'result')}" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><button class="modal-close" aria-label="关闭弹层" data-action="${this.panel ? 'close' : 'dismiss-result'}">×</button>${this.modalContent()}</section></div>` : '';
    } else {
      const oldModal = this.root.querySelector('.modal-backdrop');
      oldModal?.remove();
      if (modal) this.root.insertAdjacentHTML('beforeend', `<div class="modal-backdrop"><section class="modal ${infoPanelClass(this.panel ?? 'result')}" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><button class="modal-close" aria-label="关闭弹层" data-action="${this.panel ? 'close' : 'dismiss-result'}">×</button>${this.modalContent()}</section></div>`);
    }
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
