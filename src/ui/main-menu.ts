import { Assets } from '../core/asset-manifest';
import { assetURL } from './card-view';
import { primaryButton } from './ui-components';

export interface MainMenuActions {
  startGame(): void;
}

export class MainMenu {
  private settingsOpen = false;
  private readonly popupHost: HTMLElement;
  private readonly onClick = (event: MouseEvent): void => {
    const target = (event.target as Element).closest<HTMLElement>('[data-action],[data-menu-action]');
    if (!target) return;
    const action = target.dataset.menuAction ?? target.dataset.action;
    if (action === 'start-game') this.actions.startGame();
    else if (action === 'settings') { this.settingsOpen = true; this.render(); }
    else if (action === 'close-settings') { this.settingsOpen = false; this.render(); }
  };

  constructor(private readonly root: HTMLElement, private readonly actions: MainMenuActions) {
    this.popupHost = root.closest('.game-viewport')?.querySelector<HTMLElement>('.viewport-overlay') ?? root;
    this.root.addEventListener('click', this.onClick);
    if (this.popupHost !== this.root) this.popupHost.addEventListener('click', this.onClick);
    this.render();
  }

  destroy(): void {
    this.root.removeEventListener('click', this.onClick);
    if (this.popupHost !== this.root) this.popupHost.removeEventListener('click', this.onClick);
    this.popupHost.querySelector('.main-menu-popup-layer')?.remove();
  }

  private render(): void {
    this.root.innerHTML = `<div class="menu-safe-viewport"><main class="main-menu-screen" aria-label="夜渡主菜单">
      <img class="menu-background" src="${assetURL(Assets.menu.background)}" alt="">
      <section class="menu-content">
        <div class="menu-logo" aria-label="夜渡">
          <img src="${assetURL(Assets.menu.logo)}" alt="夜渡" draggable="false">
          <h1 hidden>夜渡</h1>
        </div>
        ${primaryButton('开始游戏', 'start-game', false, 'menu-start-button')}
        <button class="menu-secondary" data-menu-action="settings">设置</button>
      </section>
      <small class="menu-version">Version 0.1.0</small>
    </main></div>`;
    let popupLayer = this.popupHost.querySelector<HTMLElement>('.main-menu-popup-layer');
    if (!popupLayer) {
      popupLayer = document.createElement('div');
      popupLayer.className = 'main-menu-popup-layer';
      this.popupHost.append(popupLayer);
    }
    popupLayer.innerHTML = this.settingsOpen
      ? `<div class="menu-settings-backdrop"><section class="menu-settings" role="dialog" aria-modal="true" aria-labelledby="menu-settings-title"><h2 id="menu-settings-title">设置</h2><p>设置功能将在后续版本开放。</p>${primaryButton('返回', 'close-settings', false, 'menu-settings-close')}</section></div>`
      : '';
    const logo = this.root.querySelector<HTMLImageElement>('.menu-logo img');
    const fallback = this.root.querySelector<HTMLHeadingElement>('.menu-logo h1');
    if (logo && fallback) {
      const showFallback = (): void => { logo.hidden = true; fallback.hidden = false; };
      logo.addEventListener('error', showFallback, { once: true });
      if (logo.complete && logo.naturalWidth === 0) showFallback();
    }
  }
}
