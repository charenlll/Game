import type { UserSettings } from '../infrastructure/save/save-schema';
import { hb19PanelStyle } from './hub-components';

/** The disabled rows describe planned capabilities without pretending they work. */
export function renderSettingsPanel(settings: UserSettings, actionAttribute: 'data-menu-action' | 'data-hub-action', titleId: string): string {
  return `<section class="game-settings-panel" style="${hb19PanelStyle()}" data-hb19-panel role="dialog" aria-modal="true" aria-labelledby="${titleId}" ${actionAttribute}="stop-popup-close"><div class="game-settings-content">
    <h2 id="${titleId}">设置</h2>
    <div class="game-settings-options">
      <button class="game-settings-option" type="button" ${actionAttribute}="toggle-reduced-motion" role="switch" aria-checked="${settings.reducedMotion}">
        <span><strong>减少动效</strong><small>降低界面和环境动画</small></span><span class="game-settings-switch" aria-hidden="true"><i></i></span>
      </button>
      <button class="game-settings-option" type="button" disabled aria-label="语言，简体中文，暂未开放"><span><strong>语言</strong><small>暂未开放</small></span><span class="game-settings-value">简体中文</span></button>
      <button class="game-settings-option" type="button" disabled aria-label="音量，暂未开放"><span><strong>音量</strong><small>音频资源接入后开放</small></span><span class="game-settings-value">暂未开放</span></button>
    </div>
    <button class="game-settings-close" type="button" ${actionAttribute}="close-settings">返回</button>
  </div></section>`;
}
