import type { CardData } from '../core/card-database';
import type { FerrymanId, ProloguePersistentState } from '../core/prologue-state';
import { Assets } from '../core/asset-manifest';
import { assetURL, CardView, escapeHTML as esc } from './card-view';

export const HubTypography = Object.freeze({
  primary: '#40352B', secondary: '#62574A', muted: '#827768', accent: '#806A36', light: '#F1E6CF',
  green: '#4F8174', greenHover: '#63998A', greenPressed: '#3E6C61',
});

export const HB19_NINE_SLICE = Object.freeze({
  sourceWidth: 1254, sourceHeight: 1254,
  left: 190, right: 190, top: 190, bottom: 190,
  renderBorder: 24,
  contentSafeRect: Object.freeze({ x: 235, y: 220, width: 780, height: 814 }),
  titleSafeRect: Object.freeze({ x: 250, y: 230, width: 754, height: 130 }),
  bodySafeRect: Object.freeze({ x: 250, y: 365, width: 754, height: 645 }),
  minWidth: 320, minHeight: 110,
});

export interface HubPanelContentRect { x: number; y: number; width: number; height: number; }

export function HubInfoPanel(content: string, className: string, label: string): string {
  return `<section class="hub-info-panel ${esc(className)}" style="${hb19PanelStyle()}" data-hb19-panel role="group" aria-label="${esc(label)}">${content}</section>`;
}

export namespace HubInfoPanel {
  export function getContentRect(width: number, height: number): HubPanelContentRect {
    const config = HB19_NINE_SLICE;
    if (width < config.minWidth || height < config.minHeight) {
      throw new RangeError(`HB19 panel must be at least ${config.minWidth}×${config.minHeight}px`);
    }
    const stretchWidth = width - 2 * config.renderBorder;
    const stretchHeight = height - 2 * config.renderBorder;
    const sourceStretchWidth = config.sourceWidth - config.left - config.right;
    const sourceStretchHeight = config.sourceHeight - config.top - config.bottom;
    const scaleX = stretchWidth / sourceStretchWidth;
    const scaleY = stretchHeight / sourceStretchHeight;
    const safe = config.contentSafeRect;
    return {
      x: config.renderBorder + (safe.x - config.left) * scaleX,
      y: config.renderBorder + (safe.y - config.top) * scaleY,
      width: safe.width * scaleX,
      height: safe.height * scaleY,
    };
  }
}

export function hb19PanelStyle(): string {
  const config = HB19_NINE_SLICE;
  return `--hub-info-panel-art:url('${assetURL(Assets.hub.infoPanel)}');--hb19-slice-left:${config.left};--hb19-slice-right:${config.right};--hb19-slice-top:${config.top};--hb19-slice-bottom:${config.bottom};--hb19-render-border:${config.renderBorder}px`;
}

export function applyHubInfoPanelContentRects(root: ParentNode): void {
  for (const panel of root.querySelectorAll<HTMLElement>('[data-hb19-panel]')) {
    const rect = HubInfoPanel.getContentRect(panel.offsetWidth, panel.offsetHeight);
    panel.style.setProperty('--hb19-content-x', `${rect.x}px`);
    panel.style.setProperty('--hb19-content-y', `${rect.y}px`);
    panel.style.setProperty('--hb19-content-width', `${rect.width}px`);
    panel.style.setProperty('--hb19-content-height', `${rect.height}px`);
  }
}

export interface HubFerrymanData {
  id: FerrymanId;
  name: string;
  portrait: string;
  avatar: string;
  intro: string;
  role: string;
}

export const ferryButton = (action: string, label: string, size: 'primary' | 'secondary' | 'stage', extra = ''): string => {
  const asset = size === 'primary' ? Assets.hub.ferryPrimaryButton : Assets.hub.secondaryButton;
  const baseFont = size === 'primary' ? 28 : size === 'secondary' ? 19 : 18;
  const minFont = size === 'primary' ? 26 : size === 'secondary' ? 16 : 15;
  return `<button class="hub-asset-button hub-asset-button--${size} ${extra}" data-hub-action="${esc(action)}" data-fit-label data-base-font="${baseFont}" data-min-font="${minFont}">
    <img class="hub-button-art" src="${assetURL(asset)}" alt=""><span class="hub-button-tint" aria-hidden="true"></span>
    <span class="hub-button-content">${esc(label)}</span></button>`;
};

export function fitHubButtonLabels(root: ParentNode): void {
  for (const label of root.querySelectorAll<HTMLElement>('[data-fit-label]')) {
    const content = label.querySelector<HTMLElement>('.hub-button-content,.ferryman-card-name');
    if (!content) continue;
    const textScale = 1;
    const base = Number(label.dataset.baseFont ?? 18) * textScale;
    const min = Number(label.dataset.minFont ?? 14) * textScale;
    content.style.fontSize = `${base}px`;
    for (let size = base; size > min && content.scrollWidth > content.clientWidth + 1; size -= 0.5) content.style.fontSize = `${size - 0.5}px`;
    content.classList.toggle('is-ellipsized', content.scrollWidth > content.clientWidth + 1);
    content.title = content.classList.contains('is-ellipsized') ? content.textContent ?? '' : '';
  }
}

export class FerrymanSelectorDrawer {
  static render(data: readonly HubFerrymanData[], progress: ProloguePersistentState, selectedId: FerrymanId): string {
    return `<div class="hub-drawer-scrim" data-hub-action="close-ferryman-drawer"><aside class="ferryman-drawer" role="dialog" aria-modal="true" aria-labelledby="ferryman-drawer-title" data-hub-action="stop-drawer-close">
      <button class="ferryman-drawer-close" data-hub-action="close-ferryman-drawer" aria-label="关闭角色选择">×</button>
      <h2 id="ferryman-drawer-title">摆渡人</h2><div class="ferryman-drawer-list">${data.map(person => this.renderCard(person, !!progress.unlockedFerrymen[person.id], selectedId === person.id)).join('')}</div>
    </aside></div>`;
  }

  static renderCurrent(person: HubFerrymanData): string {
    return this.renderCard(person, true, true, 'open-ferryman-drawer', 'hub-current-ferryman hub-current-ferryman--banner');
  }

  private static renderCard(person: HubFerrymanData, unlocked: boolean, selected: boolean, action = 'select-ferryman', extraClass = ''): string {
    return `<button class="hub-ferryman-card ${selected ? 'is-current' : ''} ${unlocked ? '' : 'is-locked'} ${extraClass}" data-hub-action="${action}" data-ferryman="${person.id}" aria-pressed="${selected}" aria-label="${selected ? '当前摆渡人，点击切换' : `选择摆渡人：${esc(person.name)}`}" data-fit-label data-base-font="24" data-min-font="15">
      <img class="ferryman-card-frame" src="${assetURL(Assets.hub.ferrymanCard)}" alt="">
      <img class="ferryman-avatar ${unlocked ? '' : 'is-locked-avatar'}" src="${assetURL(person.avatar)}" alt="">
      <span class="ferryman-card-name">${esc(person.name)}</span>
      ${unlocked ? '' : `<img class="ferryman-lock" src="${assetURL(Assets.hub.locked)}" alt="未解锁">`}
    </button>`;
  }
}
export class CardPreviewPopup {
  static render(card: CardData): string {
    return `<div class="hub-popup-scrim" data-hub-action="close-card-preview"><section class="card-preview-popup" role="dialog" aria-modal="true" aria-labelledby="card-preview-title" data-hub-action="stop-popup-close">
      <div class="card-preview-art">${CardView.render(card)}</div><div class="card-preview-name" id="card-preview-title">${esc(card.name)}</div>
    </section></div>`;
  }
}

export interface MementoData {
  id: string;
  name: string;
  source: string;
  description: string;
  quote: string;
  asset: string;
}

export class MementoDetailPopup {
  static render(item: MementoData): string {
    return `<div class="hub-popup-scrim memento-popup-scrim" data-hub-action="close-memento-detail"><section class="memento-detail-popup" role="dialog" aria-modal="true" aria-label="信物详情" data-hub-action="stop-popup-close">
      <img class="memento-panel-frame" src="${assetURL(Assets.hub.detailPanel)}" alt="">
      <div class="memento-popup-layout">
        <div class="memento-preview"><img src="${assetURL(item.asset)}" alt="${esc(item.name)}"></div>
        <div class="memento-info"><span class="memento-source">${esc(item.source)}</span>
          <div class="memento-divider"></div><p class="memento-description">${esc(item.description)}</p>
          <blockquote class="memento-quote">${esc(item.quote)}</blockquote></div>
      </div>
    </section></div>`;
  }
}
