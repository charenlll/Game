import { cardDatabase } from '../core/card-database';
import { CardView, fitCardText } from './card-view';

export function mountCardTestScene(root: HTMLElement): void {
  root.innerHTML = `<main class="card-test-scene"><header><div><h1>CardTestScene · 公共卡牌</h1><p>600 × 900固定坐标 · 共用卡框 · JSON文字与数值</p></div><a href="${import.meta.env.BASE_URL}">返回对局</a></header><section class="card-test-grid">${cardDatabase.all().map(data => `<figure><div class="test-card">${CardView.render(data)}</div><figcaption>${data.id}</figcaption></figure>`).join('')}</section></main>`;
  const observer = new ResizeObserver(() => fitCardText(root));
  observer.observe(root);
  requestAnimationFrame(() => fitCardText(root));
}
