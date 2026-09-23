import type { CardData } from '../core/card-database';
import { CardLayout as layout } from './card-layout';

export const escapeHTML = (value: string | number): string => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const assetURL = (path: string): string => `${import.meta.env.BASE_URL}${path}`;
const rect = (area: { x: number; y: number; width: number; height: number }): string =>
  `left:${area.x / layout.width * 100}%;top:${area.y / layout.height * 100}%;width:${area.width / layout.width * 100}%;height:${area.height / layout.height * 100}%`;

// 纯显示组件：不引用Battle、资源或效果执行器，不绑定出牌事件。
export class CardView {
  static render(data: CardData, displayedCost = data.cost): string {
    const font = Math.max(layout.name.min_font_size, Math.min(layout.name.font_size, layout.name.width / Math.max(1, Array.from(data.name).length)));
    const cost = { x: layout.cost.center_x - layout.cost.width / 2, y: layout.cost.center_y - layout.cost.height / 2, width: layout.cost.width, height: layout.cost.height };
    return `<span class="card-face frame-${escapeHTML(data.frame_style)}" data-card-id="${escapeHTML(data.id)}">
      <span class="card-art-mask" style="${rect(layout.art)}"><img class="card-art-image" src="${escapeHTML(assetURL(data.art_path))}" alt="" draggable="false"></span>
      <img class="card-frame" src="${escapeHTML(assetURL(layout.frames[data.frame_style]))}" alt="" draggable="false">
      <span class="card-cost" style="${rect(cost)};font-size:${layout.cost.font_size / 6}cqw">${escapeHTML(displayedCost)}</span>
      <span class="card-title" style="${rect(layout.name)};font-size:${font / 6}cqw">${escapeHTML(data.name)}</span>
      <span class="card-description-box" style="${rect(layout.description)};padding:${layout.description.padding / 6}cqw"><span class="card-description-text" style="font-size:${layout.description.font_size / 6}cqw;line-height:${layout.description.line_height}">${escapeHTML(data.description)}</span></span>
    </span>`;
  }
}

// 按实际文本边界微调字号；只测DOM文字，不读取或分析图像。
export function fitCardText(root: ParentNode): void {
  for (const face of root.querySelectorAll<HTMLElement>('.card-face')) {
    const scale = face.clientWidth / layout.width;
    if (!scale) continue;
    const title = face.querySelector<HTMLElement>('.card-title')!;
    const box = face.querySelector<HTMLElement>('.card-description-box')!;
    const text = face.querySelector<HTMLElement>('.card-description-text')!;
    for (let size = parseFloat(getComputedStyle(title).fontSize) / scale; size >= layout.name.min_font_size; size--) {
      title.style.fontSize = `${size * scale}px`;
      if (title.scrollWidth <= title.clientWidth + 1 && title.scrollHeight <= title.clientHeight + 1) break;
    }
    const maxHeight = box.clientHeight - layout.description.padding * scale * 2;
    for (let size = layout.description.font_size; size >= layout.description.min_font_size; size--) {
      text.style.fontSize = `${size * scale}px`;
      if (text.scrollHeight <= Math.min(maxHeight, size * scale * layout.description.line_height * 4) + 1 && text.scrollWidth <= text.clientWidth + 1) break;
    }
  }
}
