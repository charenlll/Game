import { escapeHTML as esc } from './card-view';

export function primaryButton(label: string, action: string, disabled = false, extraClass = ''): string {
  return `<button class="primary-button ${extraClass}" data-action="${esc(action)}" ${disabled ? 'disabled' : ''}><span>${esc(label)}</span></button>`;
}

export function infoPanelClass(extra = ''): string {
  return `info-panel ${extra}`.trim();
}
