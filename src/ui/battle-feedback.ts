import { Assets } from '../core/asset-manifest';
import { assetURL } from './card-view';
import { FeedbackConfig } from './layout-config';

export interface FlowSource { html: string; rect: DOMRect }

export class BattleFeedback {
  private generation = 0;
  private pending = new Map<number, (active: boolean) => void>();
  private animations = new Set<Animation>();
  private readonly preloaded: HTMLImageElement[];

  constructor(private readonly root: HTMLElement) {
    this.preloaded = [
      Assets.cards.back, Assets.piles.UC01, Assets.piles.UC02, Assets.piles.UC03,
      Assets.effects.soul_flame, Assets.effects.release_glow, Assets.souls.unresolved, Assets.souls.released,
      Assets.results.success, Assets.results.failure, Assets.traits.TR01,
    ].map(path => { const image = new Image(); image.src = assetURL(path); return image; });
    void this.preloaded.length;
  }

  token(): number { return this.generation; }
  active(token: number): boolean { return token === this.generation; }

  cancel(): void {
    this.generation++;
    for (const [timer, resolve] of this.pending) { clearTimeout(timer); resolve(false); }
    this.pending.clear();
    for (const animation of this.animations) animation.cancel();
    this.animations.clear();
    this.root.querySelectorAll('.flow-proxy,.floating-feedback,.soul-flame').forEach(node => node.remove());
    this.root.querySelectorAll('.flow-hidden,.is-pulsing').forEach(node => node.classList.remove('flow-hidden', 'is-pulsing'));
  }

  delay(ms: number, token = this.generation): Promise<boolean> {
    if (!this.active(token)) return Promise.resolve(false);
    return new Promise(resolve => {
      const timer = window.setTimeout(() => {
        this.pending.delete(timer);
        resolve(this.active(token));
      }, ms);
      this.pending.set(timer, resolve);
    });
  }

  async draw(cardIDs: readonly string[], token = this.generation, originSelector = '.draw-pile'): Promise<boolean> {
    const origin = this.root.querySelector(originSelector)?.getBoundingClientRect();
    if (!origin || !cardIDs.length) return this.active(token);
    const targets = cardIDs.map(id => this.root.querySelector<HTMLElement>(`.card[data-id="${CSS.escape(id)}"]`)).filter(Boolean) as HTMLElement[];
    targets.forEach(target => target.classList.add('flow-hidden'));
    targets.forEach((target, index) => {
      const destination = target.getBoundingClientRect();
      const proxy = document.createElement('img');
      proxy.className = 'flow-proxy flow-card-back';
      proxy.src = assetURL(Assets.cards.back);
      proxy.alt = '';
      Object.assign(proxy.style, { left: `${origin.left}px`, top: `${origin.top}px`, width: `${origin.width}px`, height: `${origin.height}px` });
      this.root.append(proxy);
      const animation = proxy.animate([
        { transform: 'translate(0,0) scale(.72)', opacity: .25 },
        { transform: `translate(${destination.left - origin.left}px,${destination.top - origin.top}px) scale(1)`, opacity: 1 },
      ], { duration: FeedbackConfig.drawMoveMs, delay: index * FeedbackConfig.drawStaggerMs, easing: 'cubic-bezier(.22,.8,.3,1)', fill: 'forwards' });
      this.track(animation, () => { proxy.remove(); target.classList.remove('flow-hidden'); target.classList.add('flow-reveal'); });
    });
    this.pulse(originSelector, FeedbackConfig.drawMoveMs, token);
    return this.delay(FeedbackConfig.drawMoveMs + Math.max(0, targets.length - 1) * FeedbackConfig.drawStaggerMs + FeedbackConfig.revealMs, token);
  }

  async move(sources: readonly FlowSource[], targetSelector: string, kind: 'discard' | 'exhaust', token = this.generation): Promise<boolean> {
    const target = this.root.querySelector(targetSelector)?.getBoundingClientRect();
    if (!target || !sources.length) return this.active(token);
    sources.forEach((source, index) => {
      const holder = document.createElement('div');
      holder.className = `flow-proxy flow-${kind}`;
      holder.innerHTML = source.html;
      Object.assign(holder.style, { left: `${source.rect.left}px`, top: `${source.rect.top}px`, width: `${source.rect.width}px`, height: `${source.rect.height}px` });
      this.root.append(holder);
      const animation = holder.animate([
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: `translate(${target.left - source.rect.left}px,${target.top - source.rect.top}px) scale(.28) rotate(${kind === 'exhaust' ? 9 : -5}deg)`, opacity: 0 },
      ], { duration: kind === 'exhaust' ? FeedbackConfig.exhaustMs : FeedbackConfig.discardMs, delay: index * FeedbackConfig.discardStaggerMs, easing: 'cubic-bezier(.4,0,.7,1)', fill: 'forwards' });
      this.track(animation, () => holder.remove());
    });
    const duration = (kind === 'exhaust' ? FeedbackConfig.exhaustMs : FeedbackConfig.discardMs) + Math.max(0, sources.length - 1) * FeedbackConfig.discardStaggerMs;
    this.pulse(targetSelector, duration, token);
    return this.delay(duration, token);
  }

  pulse(selector: string, duration: number = FeedbackConfig.pulseMs, token = this.generation): void {
    const element = this.root.querySelector<HTMLElement>(selector);
    if (!element || !this.active(token)) return;
    element.classList.remove('is-pulsing');
    void element.offsetWidth;
    element.classList.add('is-pulsing');
    void this.delay(duration, token).then(active => { if (active) element.classList.remove('is-pulsing'); });
  }

  float(selector: string, text: string, tone: 'soul' | 'light' | 'intent' | 'trait', token = this.generation): void {
    const anchor = this.root.querySelector(selector)?.getBoundingClientRect();
    if (!anchor || !this.active(token)) return;
    const node = document.createElement('strong');
    node.className = `floating-feedback floating-${tone}`;
    node.textContent = text;
    Object.assign(node.style, { left: `${anchor.left + anchor.width / 2}px`, top: `${anchor.top + anchor.height / 2}px` });
    this.root.append(node);
    const animation = node.animate([{ transform: 'translate(-50%,0)', opacity: 0 }, { opacity: 1, offset: .18 }, { transform: 'translate(-50%,-42px)', opacity: 0 }], { duration: FeedbackConfig.floatMs, easing: 'ease-out' });
    this.track(animation, () => node.remove());
  }

  soulFlames(count = FeedbackConfig.soulFlameCount, token = this.generation): void {
    const anchor = this.root.querySelector('.soul-image')?.getBoundingClientRect();
    if (!anchor || !this.active(token)) return;
    for (let index = 0; index < count; index++) {
      const flame = document.createElement('img');
      flame.className = 'soul-flame'; flame.src = assetURL(Assets.effects.soul_flame); flame.alt = '';
      Object.assign(flame.style, { left: `${anchor.left + anchor.width * (.3 + index / Math.max(1, count - 1) * .4)}px`, top: `${anchor.top + anchor.height * .58}px`, animationDelay: `${index * 70}ms` });
      this.root.append(flame);
      void this.delay(FeedbackConfig.floatMs + index * 70, token).then(active => { if (active) flame.remove(); });
    }
  }

  private track(animation: Animation, cleanup: () => void): void {
    this.animations.add(animation);
    void animation.finished.catch(() => undefined).then(() => { this.animations.delete(animation); cleanup(); });
  }
}
