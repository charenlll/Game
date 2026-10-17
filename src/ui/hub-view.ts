import { Assets } from '../core/asset-manifest';
import { cardDatabase, type CardData } from '../core/card-database';
import { getTrait } from '../core/traits';
import type { ProloguePersistentState } from '../core/prologue-state';
import type { FerrymanId } from '../core/profile/profile-types';
import { assetURL, CardView, escapeHTML as esc, fitCardText } from './card-view';
import { applyHubInfoPanelContentRects, CardPreviewPopup, FerrymanSelectorDrawer, ferryButton, fitHubButtonLabels, hb19PanelStyle, HubInfoPanel, HubTypography, MementoDetailPopup, type HubFerrymanData, type MementoData } from './hub-components';
import { HubEnvironment } from './hub-environment';
import { isOpaqueImagePixel } from './image-alpha-hit';
import type { SoulArchiveEntry } from '../core/archive/soul-archive';
import type { UserSettings } from '../infrastructure/save/save-schema';
import { renderSettingsPanel } from './settings-panel';
import { defaultEditableDeck, validateEditableDeck } from '../core/deck-editor';

export interface HubActions {
  startPrologue(): void;
  startManyi(): void;
  returnToMenu(): void;
  ferrymanProgress(): ProloguePersistentState;
  selectFerryman(id: FerrymanId): boolean;
  discoveredCardIds(): readonly string[];
  unlockedCardIds(): readonly string[];
  startingDeckFor(id: FerrymanId): readonly string[];
  saveStartingDeck(id: FerrymanId, deck: readonly string[]): string | null;
  mementoIds(): readonly string[];
  soulArchive(): readonly SoulArchiveEntry[];
  settings(): UserSettings;
  setReducedMotion(enabled: boolean): void;
}

type HubPage = 'hub' | 'collection' | 'stage-select' | 'growth';
type CatalogTab = 'common' | FerrymanId | 'burden';
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
const catalogTabs: readonly { id: CatalogTab; label: string }[] = [
  { id: 'common', label: '通用牌' },
  ...ferrymen.filter(person => cardDatabase.all().some(card => card.owner_character_id === person.id))
    .map(person => ({ id: person.id, label: `${person.name}专属` })),
  { id: 'burden', label: '浊念' },
];
const mementos: readonly (MementoData & { category: Category; slot: 'A1' | 'A2' | 'A3' | 'A4' | 'B1' | 'B2' | 'B3' | 'B4' })[] = [
  { id: 'prologue_wooden_boat', category: 'prologue', slot: 'A1', asset: Assets.prologue.woodenBoat, name: '小木船', source: '序｜初见', description: '一艘做得不算精致的小木船。\n有人托你暂时替他保管。', quote: '“那也先给他看看。”' },
  { id: 'manyi_return_voucher', category: 'world', slot: 'A2', asset: 'assets/story/manyi/PR1-03.png', name: '归潮返航凭证', source: '世｜满溢', description: '一张泛黄的旧凭证。\n出发地与目的地依然清晰，到港日期始终空白。\n它没有等回那艘船。后来，等船的人也离开了。', quote: '“一条就够了。”' },
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
  private cardCatalogOpen = false;
  private deckEditing = false;
  private deckDraft: string[] = [];
  private catalogTab: CatalogTab = 'common';
  private soulArchiveOpen = false;
  private archiveEntryId = 'prologue_child';
  private selectedFerryman: FerrymanId;
  private toast = '';
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly popupHost: HTMLElement;
  private readonly environment = new HubEnvironment();

  private isPortraitHit(event: MouseEvent | PointerEvent): boolean {
    if (this.page !== 'hub' || this.drawerOpen || this.settingsOpen || this.cardCatalogOpen || this.soulArchiveOpen || this.detailMementoId || this.previewCard) return false;
    const element = event.target instanceof Element ? event.target : null;
    const action = element?.closest<HTMLElement>('[data-hub-action]')?.dataset.hubAction;
    if ((action && action !== 'open-memento') || element?.closest('.hub-resources')) return false;
    const portrait = this.root.querySelector<HTMLImageElement>('.hub-character .hub-portrait-image');
    return !!portrait && isOpaqueImagePixel(portrait, event.clientX, event.clientY);
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType !== 'mouse' || this.page !== 'hub') return;
    const hit = this.isPortraitHit(event);
    this.root.querySelector('.hub-character')?.classList.toggle('is-opaque-hover', hit);
    this.root.querySelector('.hub-home')?.classList.toggle('hub-portrait-hot', hit);
  };

  private readonly onPointerLeave = (): void => {
    this.root.querySelector('.hub-character')?.classList.remove('is-opaque-hover');
    this.root.querySelector('.hub-home')?.classList.remove('hub-portrait-hot');
  };

  private readonly onClick = (event: MouseEvent): void => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-hub-action]') : null;
    if (event.detail > 0 && this.isPortraitHit(event)) { this.page = 'growth'; this.render(); return; }
    if (!target) return;
    const action = target.dataset.hubAction;
    if (action === 'settings') { this.settingsOpen = true; this.render(); }
    else if (action === 'close-settings') { this.settingsOpen = false; this.render(); }
    else if (action === 'toggle-reduced-motion') { this.actions.setReducedMotion(!this.actions.settings().reducedMotion); this.render(); }
    else if (action === 'open-ferryman-drawer') { this.drawerOpen = true; this.render(); }
    else if (action === 'close-ferryman-drawer') { this.drawerOpen = false; this.render(); }
    else if (action === 'open-card-catalog') { this.cardCatalogOpen = true; this.deckEditing = false; this.catalogTab = 'common'; this.render(); }
    else if (action === 'close-card-catalog') { this.cardCatalogOpen = false; this.render(); }
    else if (action === 'open-deck-editor') { this.deckEditing = true; this.deckDraft = [...this.actions.startingDeckFor(this.selectedFerryman)]; this.render(); }
    else if (action === 'close-deck-editor') { this.deckEditing = false; this.render(); }
    else if (action === 'deck-add' && target.dataset.cardId) {
      this.deckDraft.push(target.dataset.cardId);
      const issue = validateEditableDeck(this.deckDraft, this.selectedFerryman, new Set(this.actions.unlockedCardIds()));
      if (issue && !(issue === '初始牌组须为6～12张。' && this.deckDraft.length < 6)) { this.deckDraft.pop(); this.showToast(issue); } else this.refreshDeckEditor();
    }
    else if (action === 'deck-remove' && target.dataset.cardId) {
      const index = this.deckDraft.indexOf(target.dataset.cardId);
      if (index >= 0) this.deckDraft.splice(index, 1);
      this.refreshDeckEditor();
    }
    else if (action === 'deck-default') { this.deckDraft = defaultEditableDeck(this.selectedFerryman); this.refreshDeckEditor(); }
    else if (action === 'deck-save') {
      const issue = this.actions.saveStartingDeck(this.selectedFerryman, this.deckDraft);
      this.showToast(issue ?? '初始牌组已保存');
    }
    else if (action === 'open-soul-archive') { this.soulArchiveOpen = true; this.render(); }
    else if (action === 'close-soul-archive') { this.soulArchiveOpen = false; this.render(); }
    else if (action === 'archive-entry') {
      const id = target.dataset.archiveId;
      if (id && this.actions.soulArchive().some(entry => entry.id === id && entry.status !== 'unknown')) {
        this.archiveEntryId = id;
        this.render();
      }
    }
    else if (action === 'catalog-tab') {
      const tab = target.dataset.catalogTab;
      if (catalogTabs.some(entry => entry.id === tab)) { this.catalogTab = tab as CatalogTab; this.render(); }
    }
    else if (action === 'select-ferryman') this.selectFerryman(target.dataset.ferryman as FerrymanId);
    else if (action === 'open-growth') { this.page = 'growth'; this.render(); }
    else if (action === 'open-collection') { this.page = 'collection'; this.categoryIndex = 0; this.render(); }
    else if (action === 'open-stages') { this.page = 'stage-select'; this.render(); }
    else if (action === 'back-hub') { this.page = 'hub'; this.detailMementoId = null; this.previewCard = null; this.render(); }
    else if (action === 'collection-prev' || action === 'collection-next') {
      const delta = action === 'collection-next' ? 1 : -1;
      this.categoryIndex = (this.categoryIndex + delta + categories.length) % categories.length;
      this.render();
    } else if (action === 'open-memento' && this.page === 'collection') { this.detailMementoId = target.dataset.mementoId ?? null; this.render(); }
    else if (action === 'close-memento-detail') { this.detailMementoId = null; this.render(); }
    else if (action === 'preview-card') {
      const id = target.dataset.cardId;
      this.previewCard = id ? cardDatabase.get(id) : null;
      this.render();
    } else if (action === 'close-card-preview') { this.previewCard = null; this.render(); }
    else if (action === 'replay-prologue') this.actions.startPrologue();
    else if (action === 'start-manyi') this.actions.startManyi();
    else if (action === 'locked-chapter' || action === 'coming-soon' || action === 'growth-node') this.showToast('尚未开放');
    else if (action === 'return-menu') this.actions.returnToMenu();
  };

  constructor(private readonly root: HTMLElement, private readonly actions: HubActions) {
    this.popupHost = root.closest('.game-viewport')?.querySelector<HTMLElement>('.viewport-overlay') ?? root;
    this.selectedFerryman = actions.ferrymanProgress().currentFerrymanId;
    this.root.addEventListener('click', this.onClick);
    this.root.addEventListener('pointermove', this.onPointerMove);
    this.root.addEventListener('pointerleave', this.onPointerLeave);
    if (this.popupHost !== this.root) this.popupHost.addEventListener('click', this.onClick);
    this.render();
  }

  destroy(): void {
    this.environment.destroy();
    this.root.removeEventListener('click', this.onClick);
    this.root.removeEventListener('pointermove', this.onPointerMove);
    this.root.removeEventListener('pointerleave', this.onPointerLeave);
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
    const progress = this.actions.ferrymanProgress();
    if (!progress.unlockedFerrymen[id]) { this.showToast('尚未解锁'); return; }
    if (!this.actions.selectFerryman(id)) { this.showToast('摆渡人选择未能保存'); return; }
    this.selectedFerryman = id;
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
    const progress = this.actions.ferrymanProgress();
    const current = ferrymen.find(entry => entry.id === this.selectedFerryman) ?? ferrymen[0]!;
    const layer = this.page === 'hub' ? this.renderHub(progress, current)
      : this.page === 'collection' ? this.renderCollection()
        : this.page === 'stage-select' ? this.renderStageSelect()
          : this.renderGrowth(current);
    const hasPopup = this.drawerOpen || this.settingsOpen || this.cardCatalogOpen || this.soulArchiveOpen || !!this.detailMementoId || !!this.previewCard;
    this.root.innerHTML = `<div class="hub-safe-viewport">${layer}${!hasPopup && this.toast ? `<div class="hub-toast" role="status">${esc(this.toast)}</div>` : ''}</div>`;
    if (this.page === 'hub') this.environment.mount(this.root);
    else this.environment.suspend();
    this.popupHost.querySelector('.hub-popup-layer')?.remove();
    if (hasPopup) {
      const closeAction = this.previewCard ? 'close-card-preview'
        : this.detailMementoId ? 'close-memento-detail'
          : this.settingsOpen ? 'close-settings' : this.cardCatalogOpen ? 'close-card-catalog' : this.soulArchiveOpen ? 'close-soul-archive' : 'close-ferryman-drawer';
      const popupLayer = document.createElement('div');
      popupLayer.className = 'hub-popup-layer';
      popupLayer.innerHTML = `<div class="hub-popup-viewport-backdrop" data-hub-action="${closeAction}" aria-hidden="true"></div><div class="hub-popup-safe-surface">${this.drawerOpen ? FerrymanSelectorDrawer.render(ferrymen, progress, this.selectedFerryman) : ''}${this.settingsOpen ? this.settingsModal() : ''}${this.cardCatalogOpen ? this.renderCardCatalog() : ''}${this.soulArchiveOpen ? this.renderSoulArchive() : ''}${this.detailMementoId ? this.renderMementoPopup() : ''}${this.previewCard ? CardPreviewPopup.render(this.previewCard) : ''}${this.toast ? `<div class="hub-toast" role="status">${esc(this.toast)}</div>` : ''}</div>`;
      this.popupHost.append(popupLayer);
    }
    applyHubInfoPanelContentRects(this.root);
    if (this.popupHost !== this.root) applyHubInfoPanelContentRects(this.popupHost);
    fitCardText(this.root);
    fitHubButtonLabels(this.root);
    if (this.popupHost !== this.root) {
      fitCardText(this.popupHost);
      fitHubButtonLabels(this.popupHost);
    }
  }

  private renderResources(progress: ProloguePersistentState): string {
    return `<div class="hub-resources"><img class="hub-resource-backplate" src="${assetURL(Assets.hub.resourceBackplate)}" alt=""><span class="hub-resource--copper"><img src="${assetURL(Assets.resources.copper)}" alt="铜钱"><b>${progress.copper}</b></span><span class="hub-resource--soul-flame"><img src="${assetURL(Assets.resources.soulFlame)}" alt="魂火"><b>${progress.soulFlame}</b></span></div>`;
  }

  private renderSlot(item: (typeof mementos)[number]): string {
    if (!showShelfMementos) return '';
    if (!this.actions.mementoIds().includes(item.id)) return '';
    if (this.page !== 'collection') return `<span class="hub-memento-slot hub-memento-display" style="${shelfSlotStyle(item.slot)}"><img src="${assetURL(item.asset)}" alt="${esc(item.name)}"></span>`;
    return `<button class="hub-memento-slot collection-memento" style="${shelfSlotStyle(item.slot)}" data-hub-action="open-memento" data-memento-id="${esc(item.id)}" aria-label="查看信物：${esc(item.name)}"><img src="${assetURL(item.asset)}" alt="${esc(item.name)}"></button>`;
  }

  private renderFerrymanSwitch(current: HubFerrymanData): string {
    return FerrymanSelectorDrawer.renderCurrent(current);
  }

  private renderHub(progress: ProloguePersistentState, current: HubFerrymanData): string {
    const trace = mementos.map(item => this.renderSlot(item)).join('');
    return `<main class="hub-screen hub-home" aria-label="驿站">
      <img class="hub-background" src="${assetURL(Assets.hub.background)}" alt="" draggable="false">
      <div class="hub-home-title"><img src="${assetURL(Assets.hub.titleBackplate)}" alt=""><h1>渡魂驿站</h1></div>
      ${this.renderResources(progress)}
      <button class="hub-settings" data-hub-action="settings" aria-label="设置"><img src="${assetURL(Assets.hub.settings)}" alt=""></button>
      <div class="hub-home-focus-layer" aria-hidden="true"></div>
      <section class="hub-shelf-area"><img class="hub-shelf" src="${assetURL(Assets.hub.shelf)}" alt="信物收藏架">${trace}</section>
      <button class="hub-character ${current.id === 'feichuan' ? 'hub-character--seated' : ''}" data-hub-action="open-growth" aria-label="查看${esc(current.name)}">
        <img class="hub-character-ambient" src="${assetURL(Assets.hub.characterAmbient)}" alt="">
        <img class="hub-portrait-image" src="${assetURL(current.id === 'feichuan' ? Assets.ferrymen.feichuan.hubPortrait : current.portrait)}" alt="${esc(current.name)}">
      </button>
      <div class="hub-ground-fog" aria-hidden="true"><div class="hub-ground-fog-track"><img src="${assetURL(Assets.hub.environment.groundFog)}" alt=""><img src="${assetURL(Assets.hub.environment.groundFog)}" alt=""></div></div>
      <img class="hub-bottom-foreground-overlay" src="${assetURL(Assets.hub.environment.bottomForeground)}" alt="" aria-hidden="true">
      <div class="hub-home-actions">
        ${ferryButton('open-stages', '渡魂', 'primary', 'hub-primary-action', `<span class="hub-ferry-reflection" aria-hidden="true"><img src="${assetURL(Assets.hub.ferryPrimaryButton)}" alt=""><span>渡魂</span></span><img class="hub-ferry-clouds" src="${assetURL(Assets.hub.ferryClouds)}" alt="">`)}
        <div class="hub-secondary-actions">${ferryButton('open-collection', '信物录', 'secondary')}${ferryButton('open-card-catalog', '牌录', 'secondary')}${ferryButton('open-soul-archive', '渡魂记录', 'secondary')}</div>
      </div>
      ${FerrymanSelectorDrawer.renderHomeCurrent(current)}
    </main>`;
  }

  private renderCollection(): string {
    const category = categories[this.categoryIndex]!;
    const items = showShelfMementos ? mementos.filter(item => item.category === category.id).map(item => this.renderSlot(item)).join('') : '';
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

  private renderCardCatalog(): string {
    if (this.deckEditing) return this.renderDeckEditor();
    const discovered = new Set(this.actions.discoveredCardIds());
    const cards = cardDatabase.all().filter(card => this.catalogTab === 'burden'
      ? card.card_type === 'burden'
      : card.card_type !== 'burden' && (this.catalogTab === 'common' ? card.owner_character_id === null : card.owner_character_id === this.catalogTab));
    const tabs = catalogTabs.map(tab => `<button type="button" role="tab" class="hub-catalog-tab ${tab.id === this.catalogTab ? 'is-active' : ''}" data-hub-action="catalog-tab" data-catalog-tab="${tab.id}" aria-selected="${tab.id === this.catalogTab}">${esc(tab.label)}</button>`).join('');
    const entries = cards.map(card => discovered.has(card.id)
      ? `<button type="button" class="hub-catalog-card" data-hub-action="preview-card" data-card-id="${esc(card.id)}" aria-label="查看卡牌：${esc(card.name)}"><span class="hub-catalog-card-face">${CardView.render(card)}</span></button>`
      : `<div class="hub-catalog-card is-locked" role="img" aria-label="未解锁的卡牌"><img src="${assetURL(Assets.cards.back)}" alt=""><span>未解锁</span></div>`).join('');
    return `<section class="hub-info-panel hub-card-catalog" style="${hb19PanelStyle()}" data-hb19-panel role="dialog" aria-modal="true" aria-labelledby="hub-catalog-title" data-hub-action="stop-popup-close">
      <div class="hub-catalog-content"><header><h2 id="hub-catalog-title">牌录</h2><button type="button" class="hub-deck-editor-open" data-hub-action="open-deck-editor">编辑初始牌组</button><button type="button" class="hub-catalog-close" data-hub-action="close-card-catalog" aria-label="返回驿站"><img src="${assetURL(Assets.hub.back)}" alt=""></button></header>
      <nav class="hub-catalog-tabs" role="tablist" aria-label="卡牌分类">${tabs}</nav>
      <div class="hub-catalog-scroll" role="tabpanel" aria-label="${esc(catalogTabs.find(tab => tab.id === this.catalogTab)!.label)}"><div class="hub-catalog-track">${entries || '<p class="hub-catalog-empty">尚无卡牌</p>'}</div></div></div>
    </section>`;
  }

  private renderDeckEditor(): string {
    const unlocked = new Set(this.actions.unlockedCardIds());
    const available = cardDatabase.all().filter(card => card.card_type === 'normal' && (card.owner_character_id === null || card.owner_character_id === this.selectedFerryman));
    const counts = new Map<string, number>();
    for (const id of this.deckDraft) counts.set(id, (counts.get(id) ?? 0) + 1);
    const entries = available.map(card => {
      const count = counts.get(card.id) ?? 0;
      const known = unlocked.has(card.id);
      const preview = known ? `<button type="button" data-hub-action="preview-card" data-card-id="${esc(card.id)}" aria-label="查看${esc(card.name)}效果">${CardView.render(card)}</button>`
        : `<img src="${assetURL(Assets.cards.back)}" alt="未解锁卡牌">`;
      return `<article class="hub-deck-card ${known ? '' : 'is-locked'}"><div class="hub-deck-card-face">${preview}</div><strong>${known ? esc(card.name) : '未解锁'}</strong><span>${count} / 2</span><div class="hub-deck-controls"><button type="button" data-hub-action="deck-remove" data-card-id="${esc(card.id)}" ${count ? '' : 'disabled'} aria-label="移除1张${esc(card.name)}">－</button><button type="button" data-hub-action="deck-add" data-card-id="${esc(card.id)}" ${!known || count >= 2 || this.deckDraft.length >= 12 ? 'disabled' : ''} aria-label="加入1张${esc(card.name)}">＋</button></div></article>`;
    }).join('');
    const issue = validateEditableDeck(this.deckDraft, this.selectedFerryman, unlocked);
    const name = ferrymen.find(person => person.id === this.selectedFerryman)?.name ?? this.selectedFerryman;
    return `<section class="hub-info-panel hub-card-catalog hub-deck-editor" style="${hb19PanelStyle()}" data-hb19-panel role="dialog" aria-modal="true" aria-labelledby="hub-deck-title" data-hub-action="stop-popup-close"><div class="hub-catalog-content"><header><button type="button" class="hub-deck-back" data-hub-action="close-deck-editor">返回牌录</button><h2 id="hub-deck-title">${esc(name)} · 初始牌组</h2><button type="button" class="hub-catalog-close" data-hub-action="close-card-catalog" aria-label="返回驿站"><img src="${assetURL(Assets.hub.back)}" alt=""></button></header><p class="hub-deck-count">${this.deckDraft.length} / 12 张 · 同名最多2张</p><div class="hub-deck-grid">${entries}</div><div class="hub-deck-footer"><span role="status">${esc(issue ?? '牌组可保存')}</span><button type="button" data-hub-action="deck-default">恢复默认</button><button type="button" data-hub-action="deck-save" ${issue ? 'disabled' : ''}>保存牌组</button></div></div></section>`;
  }

  private refreshDeckEditor(): void {
    const previous = this.popupHost.querySelector<HTMLElement>('.hub-deck-editor');
    if (!previous) { this.render(); return; }
    const scrollTop = previous.querySelector('.hub-deck-grid')?.scrollTop ?? 0;
    const template = document.createElement('template');
    template.innerHTML = this.renderDeckEditor();
    const next = template.content.firstElementChild as HTMLElement;
    previous.replaceWith(next);
    applyHubInfoPanelContentRects(next.parentElement!);
    fitCardText(next);
    next.querySelector('.hub-deck-grid')!.scrollTop = scrollTop;
  }

  private renderSoulArchive(): string {
    const entries = this.actions.soulArchive();
    const selected = entries.find(entry => entry.id === this.archiveEntryId) ?? entries[0];
    const list = entries.map(entry => entry.status === 'unknown'
      ? `<div class="hub-archive-entry is-unknown" role="listitem" aria-label="${esc(entry.chapterTitle)}：尚未遇见"><span>${esc(entry.chapterTitle)}</span><strong>未遇见的亡魂</strong></div>`
      : `<button type="button" class="hub-archive-entry ${selected?.id === entry.id ? 'is-active' : ''}" data-hub-action="archive-entry" data-archive-id="${esc(entry.id)}" aria-label="查看${esc(entry.name)}的渡魂记录"><span>${esc(entry.chapterTitle)}</span><strong>${esc(entry.name)}</strong><small>${entry.status === 'released' ? '已渡魂' : '尚待渡魂'}</small></button>`).join('');
    const detail = selected && selected.status !== 'unknown'
      ? `<div class="hub-archive-portrait"><img src="${assetURL(selected.portrait!)}" alt="${esc(selected.name)}"></div>
          <div class="hub-archive-copy"><span class="hub-archive-chapter">${esc(selected.chapterTitle)}</span><h3>${esc(selected.name)}</h3>
            <strong class="hub-archive-status">${selected.status === 'released' ? '已渡魂' : '尚待渡魂'}</strong>
            <p>${esc(selected.story)}</p>
            ${selected.status === 'released' && selected.mementoArt ? `<div class="hub-archive-memento"><img src="${assetURL(selected.mementoArt)}" alt=""><span>留下的信物：${esc(selected.mementoName ?? '')}</span></div>` : ''}
          </div>`
      : `<div class="hub-archive-unknown-detail"><span aria-hidden="true">?</span><p>尚未遇见这位亡魂</p></div>`;
    return `<section class="hub-info-panel hub-soul-archive" style="${hb19PanelStyle()}" data-hb19-panel role="dialog" aria-modal="true" aria-labelledby="hub-archive-title" data-hub-action="stop-popup-close">
      <div class="hub-archive-content"><header><h2 id="hub-archive-title">渡魂记录</h2><button type="button" class="hub-archive-close" data-hub-action="close-soul-archive" aria-label="返回驿站"><img src="${assetURL(Assets.hub.back)}" alt=""></button></header>
        <div class="hub-archive-layout"><nav class="hub-archive-list" aria-label="亡魂档案" role="list">${list}</nav><article class="hub-archive-detail">${detail}</article></div>
      </div>
    </section>`;
  }

  private renderStageSelect(): string {
    return `<main class="hub-screen hub-stage-screen" aria-label="渡魂">
      <img class="hub-background" src="${assetURL(Assets.hub.background)}" alt="" draggable="false">
      <button class="hub-back-button" data-hub-action="back-hub" aria-label="返回"><img src="${assetURL(Assets.hub.back)}" alt=""></button>
      <section class="hub-stage-list">
        <article class="hub-stage-entry" style="${hb19PanelStyle()}" data-hb19-panel><div><h2>序｜初见</h2><p>在无名渡口，遇见第一位无法离开的亡魂。</p><small>已完成 · 可再次进入</small></div><button class="hub-stage-button hub-stage-button--replay" data-hub-action="replay-prologue">再次渡魂</button></article>
        <article class="hub-stage-entry" style="${hb19PanelStyle()}" data-hb19-panel><div><h2>世｜满溢</h2><p>走进商埠，倾听一段未结的账。</p><small>第一章 · 可进入</small></div><button class="hub-stage-button" data-hub-action="start-manyi">开始渡魂</button></article>
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
    return `<div class="hub-settings-backdrop" data-hub-action="close-settings">${renderSettingsPanel(this.actions.settings(), 'data-hub-action', 'hub-settings-title')}</div>`;
  }
}

export { HubTypography };
