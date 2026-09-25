import { Assets } from '../core/asset-manifest';
import { cardDatabase, type CardData } from '../core/card-database';
import { getTrait } from '../core/traits';
import { loadPrologueProgress, savePrologueProgress, type FerrymanId, type ProloguePersistentState } from '../core/prologue-state';
import { assetURL, CardView, escapeHTML as esc, fitCardText } from './card-view';
import { applyHubInfoPanelContentRects, CardPreviewPopup, FerrymanSelectorDrawer, ferryButton, fitHubButtonLabels, hb19PanelStyle, HubInfoPanel, HubTypography, MementoDetailPopup, type HubFerrymanData, type MementoData } from './hub-components';
import { HubEnvironment } from './hub-environment';

export interface HubActions { startPrologue(): void; returnToMenu(): void; }

type HubPage = 'hub' | 'collection' | 'stage-select' | 'growth';
type Category = 'prologue' | 'world' | 'emotion' | 'life' | 'years' | 'ferry';
const categories: readonly { id: Category; label: string }[] = [
  { id: 'prologue', label: '序｜初见' }, { id: 'world', label: '世｜见天地' }, { id: 'emotion', label: '情｜见众生' },
  { id: 'life', label: '生｜见生活' }, { id: 'years', label: '岁｜见无常' }, { id: 'ferry', label: '渡｜见自己' },
];
const ferrymen: readonly HubFerrymanData[] = [
  { id: 'feichuan', name: '绯川', portrait: Assets.ferrymen.feichuan.portrait, avatar: Assets.ferrymen.feichuan.avatar, role: '赤狐 · 摆渡人', intro: '善于观察得失，也擅长与人打交道。' },
  { id: 'moyu', name: '墨羽', portrait: Assets.ferrymen.moyu.portrait, avatar: Assets.ferrymen.moyu.avatar, role: '尚未开放', intro: '' },
  { id: 'qinglan', name: '青岚', portrait: Assets.ferrymen.qinglan.portrait, avatar: Assets.ferrymen.qinglan.avatar, role: '尚未开放', intro: '' },
];
const mementos: readonly (MementoData & { category: Category; slot: 'A1' | 'A2' | 'A3' | 'A4' | 'B1' | 'B2' | 'B3' | 'B4' })[] = [
  { id: 'prologue_wooden_boat', category: 'prologue', slot: 'A1', asset: Assets.prologue.woodenBoat, name: '小木船', source: '序｜初见', description: '一艘做得不算精致的小木船。\n有人托你暂时替他保管。', quote: '“那也先给他看看。”' },
];
const shelf = { x: 385, y: 125, width: 830, height: 600, sourceWidth: 1600, sourceHeight: 1080 };
const shelfSlots = {
  A1: { x: 320, y: 420 }, A2: { x: 655, y: 420 }, A3: { x: 990, y: 420 }, A4: { x: 1325, y: 420 },
  B1: { x: 320, y: 780 }, B2: { x: 655, y: 780 }, B3: { x: 990, y: 780 }, B4: { x: 1325, y: 780 },
} as const;
const showShelfMementos = true;

function shelfSlotStyle(slot: keyof typeof shelfSlots): string {
  const scale = Math.min(shelf.width / shelf.sourceWidth, shelf.height / shelf.sourceHeight);
  const imageLeft = (shelf.width - shelf.sourceWidth * scale) / 2;
  const imageTop = (shelf.height - shelf.sourceHeight * scale) / 2;
  const center = shelfSlots[slot];
  const width = 280 * scale;
  const height = 300 * scale;
  return `left:${imageLeft + center.x * scale - width / 2}px;top:${imageTop + center.y * scale - height / 2}px;width:${width}px;height:${height}px;--item-max-width:${220 * scale}px;--item-max-height:${230 * scale}px`;
}

export class HubController {
  private page: HubPage = 'hub';
  private categoryIndex = 0;
  private detailMementoId: string | null = null;
  private previewCard: CardData | null = null;
  private drawerOpen = false;
  private settingsOpen = false;
  private selectedFerryman: FerrymanId;
  private toast = '';
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly popupHost: HTMLElement;
  private readonly environment = new HubEnvironment();

  private readonly onClick = (event: MouseEvent): void => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-hub-action]') : null;
    if (!target) return;
    const action = target.dataset.hubAction;
    if (action === 'settings') { this.settingsOpen = true; this.render(); }
    else if (action === 'close-settings') { this.settingsOpen = false; this.render(); }
    else if (action === 'open-ferryman-drawer') { this.drawerOpen = true; this.render(); }
    else if (action === 'close-ferryman-drawer') { this.drawerOpen = false; this.render(); }
    else if (action === 'select-ferryman') this.selectFerryman(target.dataset.ferryman as FerrymanId);
    else if (action === 'open-growth') { this.page = 'growth'; this.render(); }
    else if (action === 'open-collection') { this.page = 'collection'; this.categoryIndex = 0; this.render(); }
    else if (action === 'open-stages') { this.page = 'stage-select'; this.render(); }
    else if (action === 'back-hub') { this.page = 'hub'; this.detailMementoId = null; this.previewCard = null; this.render(); }
    else if (action === 'collection-prev' || action === 'collection-next') {
      const delta = action === 'collection-next' ? 1 : -1;
      this.categoryIndex = (this.categoryIndex + delta + categories.length) % categories.length;
      this.render();
    } else if (action === 'open-memento') { this.detailMementoId = target.dataset.mementoId ?? null; this.render(); }
    else if (action === 'close-memento-detail') { this.detailMementoId = null; this.render(); }
    else if (action === 'preview-card') {
      const id = target.dataset.cardId;
      this.previewCard = id ? cardDatabase.get(id) : null;
      this.render();
    } else if (action === 'close-card-preview') { this.previewCard = null; this.render(); }
    else if (action === 'replay-prologue') this.actions.startPrologue();
    else if (action === 'locked-chapter' || action === 'coming-soon' || action === 'growth-node') this.showToast('尚未开放');
    else if (action === 'return-menu') this.actions.returnToMenu();
  };

  constructor(private readonly root: HTMLElement, private readonly actions: HubActions) {
    this.popupHost = root.closest('.game-viewport')?.querySelector<HTMLElement>('.viewport-overlay') ?? root;
    this.selectedFerryman = loadPrologueProgress().currentFerrymanId;
    this.root.addEventListener('click', this.onClick);
    if (this.popupHost !== this.root) this.popupHost.addEventListener('click', this.onClick);
    this.render();
  }

  destroy(): void {
    this.environment.destroy();
    this.root.removeEventListener('click', this.onClick);
    if (this.popupHost !== this.root) {
      this.popupHost.removeEventListener('click', this.onClick);
      this.popupHost.querySelector('.hub-popup-layer')?.remove();
    }
    if (this.toastTimer) clearTimeout(this.toastTimer);
  }

  private selectFerryman(id: FerrymanId | undefined): void {
    if (!id) return;
    const data = ferrymen.find(person => person.id === id);
    if (!data) return;
    const progress = loadPrologueProgress();
    if (!progress.unlockedFerrymen[id]) { this.showToast('尚未解锁'); return; }
    this.selectedFerryman = id;
    savePrologueProgress({ currentFerrymanId: id });
    this.drawerOpen = false;
    this.render();
  }

  private showToast(message: string): void {
    this.toast = message;
    this.render();
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { this.toast = ''; this.render(); }, 1700);
  }

  private render(): void {
    const progress = loadPrologueProgress();
    const current = ferrymen.find(entry => entry.id === this.selectedFerryman) ?? ferrymen[0]!;
    const layer = this.page === 'hub' ? this.renderHub(progress, current)
      : this.page === 'collection' ? this.renderCollection(progress)
        : this.page === 'stage-select' ? this.renderStageSelect()
          : this.renderGrowth(current);
    const hasPopup = this.drawerOpen || this.settingsOpen || !!this.detailMementoId || !!this.previewCard;
    this.root.innerHTML = `<div class="hub-safe-viewport">${layer}${!hasPopup && this.toast ? `<div class="hub-toast" role="status">${esc(this.toast)}</div>` : ''}</div>`;
    if (this.page === 'hub') this.environment.mount(this.root);
    else this.environment.suspend();
    this.popupHost.querySelector('.hub-popup-layer')?.remove();
    if (hasPopup) {
      const closeAction = this.previewCard ? 'close-card-preview'
        : this.detailMementoId ? 'close-memento-detail'
          : this.settingsOpen ? 'close-settings' : 'close-ferryman-drawer';
      const popupLayer = document.createElement('div');
      popupLayer.className = 'hub-popup-layer';
      popupLayer.innerHTML = `<div class="hub-popup-viewport-backdrop" data-hub-action="${closeAction}" aria-hidden="true"></div><div class="hub-popup-safe-surface">${this.drawerOpen ? FerrymanSelectorDrawer.render(ferrymen, progress, this.selectedFerryman) : ''}${this.settingsOpen ? this.settingsModal() : ''}${this.detailMementoId ? this.renderMementoPopup() : ''}${this.previewCard ? CardPreviewPopup.render(this.previewCard) : ''}${this.toast ? `<div class="hub-toast" role="status">${esc(this.toast)}</div>` : ''}</div>`;
      this.popupHost.append(popupLayer);
    }
    applyHubInfoPanelContentRects(this.root);
    fitCardText(this.root);
    fitHubButtonLabels(this.root);
    if (this.popupHost !== this.root) {
      fitCardText(this.popupHost);
      fitHubButtonLabels(this.popupHost);
    }
  }

  private renderResources(progress: ProloguePersistentState): string {
    return `<div class="hub-resources"><span><img src="${assetURL(Assets.resources.copper)}" alt="铜钱"><b>${progress.copper}</b></span><span><img src="${assetURL(Assets.resources.soulFlame)}" alt="魂火"><b>${progress.soulFlame}</b></span></div>`;
  }

  private renderSlot(item: (typeof mementos)[number], progress: ProloguePersistentState): string {
    if (!showShelfMementos) return '';
    if (item.id === 'prologue_wooden_boat' && !progress.wooden_boat_trace_unlocked) return '';
    const collectionClass = this.page === 'collection' ? ' collection-memento' : '';
    return `<button class="hub-memento-slot${collectionClass}" style="${shelfSlotStyle(item.slot)}" data-hub-action="open-memento" data-memento-id="${esc(item.id)}" aria-label="查看信物：${esc(item.name)}"><img src="${assetURL(item.asset)}" alt="${esc(item.name)}"></button>`;
  }

  private renderFerrymanSwitch(current: HubFerrymanData): string {
    return FerrymanSelectorDrawer.renderCurrent(current);
  }

  private renderHub(progress: ProloguePersistentState, current: HubFerrymanData): string {
    const trace = mementos.filter(item => item.category === 'prologue').map(item => this.renderSlot(item, progress)).join('');
    return `<main class="hub-screen hub-home" aria-label="驿站">
      <img class="hub-background" src="${assetURL(Assets.hub.background)}" alt="" draggable="false">
      ${this.renderResources(progress)}
      <button class="hub-settings" data-hub-action="settings" aria-label="设置"><img src="${assetURL(Assets.hub.settings)}" alt=""></button>
      <div class="hub-home-focus-layer" aria-hidden="true"></div>
      <section class="hub-shelf-area"><img class="hub-shelf" src="${assetURL(Assets.hub.shelf)}" alt="信物收藏架">${trace}</section>
      <button class="hub-character" data-hub-action="open-growth" aria-label="查看${esc(current.name)}"><img src="${assetURL(current.portrait)}" alt="${esc(current.name)}"></button>
      <div class="hub-home-actions">
        ${ferryButton('open-stages', '渡魂', 'primary', 'hub-primary-action')}
        <div class="hub-secondary-actions">${ferryButton('open-collection', '信物录', 'secondary')}${ferryButton('coming-soon', '牌录', 'secondary')}${ferryButton('coming-soon', '渡魂记录', 'secondary')}</div>
      </div>
      ${FerrymanSelectorDrawer.renderCurrent(current)}
    </main>`;
  }

  private renderCollection(progress: ProloguePersistentState): string {
    const category = categories[this.categoryIndex]!;
    const items = showShelfMementos ? mementos.filter(item => item.category === category.id).map(item => this.renderSlot(item, progress)).join('') : '';
    return `<main class="hub-screen hub-collection-screen" aria-label="信物录">
      <img class="hub-background" src="${assetURL(Assets.hub.background)}" alt="" draggable="false">
      <button class="hub-back-button" data-hub-action="back-hub" aria-label="返回"><img src="${assetURL(Assets.hub.back)}" alt=""></button>
      <section class="hub-shelf-area hub-collection-shelf"><img class="hub-shelf" src="${assetURL(Assets.hub.shelf)}" alt="">
        ${items}
        <button class="hub-page-arrow previous" data-hub-action="collection-prev" aria-label="上一类"><img src="${assetURL(Assets.hub.arrow)}" alt=""></button>
        <button class="hub-page-arrow next" data-hub-action="collection-next" aria-label="下一类"><img src="${assetURL(Assets.hub.arrow)}" alt=""></button>
      </section>
    </main>`;
  }

  private renderMementoPopup(): string {
    const item = mementos.find(entry => entry.id === this.detailMementoId);
    return item ? MementoDetailPopup.render(item) : '';
  }

  private renderStageSelect(): string {
    return `<main class="hub-screen hub-stage-screen" aria-label="渡魂">
      <img class="hub-background" src="${assetURL(Assets.hub.background)}" alt="" draggable="false">
      <button class="hub-back-button" data-hub-action="back-hub" aria-label="返回"><img src="${assetURL(Assets.hub.back)}" alt=""></button>
      <section class="hub-stage-list">
        <article class="hub-stage-entry" style="${hb19PanelStyle()}" data-hb19-panel><div><h2>序｜初见</h2><p>在无名渡口，遇见第一位无法离开的亡魂。</p><small>已完成 · 可再次进入</small></div><button class="hub-stage-button hub-stage-button--replay" data-hub-action="replay-prologue">再次渡魂</button></article>
        <article class="hub-stage-entry is-unavailable" style="${hb19PanelStyle()}" data-hb19-panel><div><h2>世｜见天地</h2><p>新的相遇仍在前方。</p><small>尚未开放</small></div><button class="hub-stage-button is-muted" data-hub-action="locked-chapter" disabled>尚未开放</button></article>
      </section>
    </main>`;
  }

  private renderGrowth(current: HubFerrymanData): string {
    const trait = getTrait('good_merchant');
    const cards = ['feichuan_001', 'feichuan_002', 'feichuan_003'].map((id, index) => {
      const card = cardDatabase.get(id);
      return `<div class="growth-card-slot growth-card-slot--${index + 1}">
        <button class="growth-card" data-hub-action="preview-card" data-card-id="${esc(card.id)}" aria-label="预览卡牌：${esc(card.name)}"><span class="growth-card-face">${CardView.render(card)}</span></button>
      </div>`;
    }).join('');
    const header = `<header class="growth-header" aria-label="角色身份"><div class="growth-header-identity"><h1>${esc(current.name)}</h1><span>${esc(current.role)}</span></div></header>`;
    const traits = `<div class="growth-trait-panels">${HubInfoPanel(`<div class="growth-trait-copy growth-safe-content"><h2>善贾</h2><p>${esc(trait.description)}</p></div>`, 'growth-trait growth-trait--merchant', '善贾')}${HubInfoPanel(`<div class="growth-trait-copy growth-safe-content"><h2>后续特性</h2><p>尚未开放</p></div>`, 'growth-trait growth-trait--locked', '后续特性')}</div>`;
    const exclusiveCards = `<section class="growth-exclusive-cards" aria-label="摆渡人卡牌"><div class="growth-card-content"><div class="growth-card-row"><div class="growth-card-track">${cards}</div></div><p class="growth-more-cards">更多卡牌<br>未解锁</p></div></section>`;
    const growth = HubInfoPanel(`<div class="growth-node-content growth-safe-content"><h2>成长</h2><span>尚未开放</span></div><button class="growth-panel-action" data-hub-action="growth-node" aria-label="成长：尚未开放"></button>`, 'growth-node-panel', '成长');
    return `<main class="hub-screen growth-screen" aria-label="摆渡人养成页">
      <img class="growth-background" src="${assetURL(Assets.hub.growthBackground)}" alt="" draggable="false">
      <button class="growth-back" data-hub-action="back-hub" aria-label="返回"><img src="${assetURL(Assets.hub.back)}" alt=""></button>
      <img class="growth-portrait" src="${assetURL(current.portrait)}" alt="${esc(current.name)}">
      <section class="growth-info-layout" aria-label="摆渡人资料">${header}${traits}${exclusiveCards}${growth}</section>
      <div class="growth-bottom-row">${this.renderFerrymanSwitch(current)}</div>
    </main>`;
  }
  private settingsModal(): string {
    return `<div class="hub-settings-backdrop" data-hub-action="close-settings"><section class="hub-settings-panel" role="dialog" aria-modal="true" aria-labelledby="hub-settings-title" data-hub-action="stop-popup-close"><h2 id="hub-settings-title">设置</h2><p>设置功能将在后续版本开放。</p><button class="hub-settings-close" data-hub-action="close-settings">返回</button></section></div>`;
  }
}

export { HubTypography };
