import { Assets } from '../core/asset-manifest';
import { assetURL } from './card-view';

const DESIGN_WIDTH = 2560;
const DESIGN_HEIGHT = 1440;
const BOTTOM_FOREGROUND_SCALE = 1.12;
const FOG_ALPHA = 0.21;
const FOG_ALPHA_BREATH = 0.015;
const FOG_BREATH_PERIOD = 24;
const FOG_DRIFT_DISTANCE = 18;
const FOG_DRIFT_PERIOD = 110;
const ATLAS_WIDTH = 1254;
const ATLAS_HEIGHT = 1254;
const ATLAS_COLUMNS = 4;
const ATLAS_ROWS = 3;

interface Particle {
  sprite: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  spin: number;
  scale: number;
  alpha: number;
  age: number;
  lifetime: number;
}

interface Glow {
  x: number;
  y: number;
  scale: number;
  alpha: number;
  pulse: number;
  period: number;
  phase: number;
}

const atlasCellWidth = ATLAS_WIDTH / ATLAS_COLUMNS;
const atlasCellHeight = ATLAS_HEIGHT / ATLAS_ROWS;

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomInt(min: number, max: number): number {
  return Math.floor(randomBetween(min, max + 1));
}

function loadImage(path: string): HTMLImageElement {
  const image = new Image();
  image.decoding = 'async';
  image.src = assetURL(path);
  return image;
}

function drawAtlasSprite(ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, particle: Particle): void {
  if (!atlas.complete || atlas.naturalWidth === 0) return;
  const column = particle.sprite % ATLAS_COLUMNS;
  const row = Math.floor(particle.sprite / ATLAS_COLUMNS);
  const fadeIn = Math.min(1, particle.age / 1.1);
  const fadeOut = Math.min(1, (particle.lifetime - particle.age) / 1.6);
  const width = atlasCellWidth * particle.scale;
  const height = atlasCellHeight * particle.scale;

  ctx.save();
  ctx.globalAlpha = particle.alpha * Math.max(0, Math.min(fadeIn, fadeOut));
  ctx.translate(particle.x, particle.y);
  ctx.rotate(particle.rotation);
  ctx.drawImage(
    atlas,
    column * atlasCellWidth,
    row * atlasCellHeight,
    atlasCellWidth,
    atlasCellHeight,
    -width / 2,
    -height / 2,
    width,
    height,
  );
  ctx.restore();
}

abstract class HubParticleSystem {
  protected readonly particles: Particle[] = [];
  protected targetCount: number;
  private spawnDelay = randomBetween(0.6, 1.8);
  private targetChangeDelay = randomBetween(7, 12);

  protected constructor(initialCount: number, targetCount: number) {
    this.targetCount = targetCount;
    for (let i = 0; i < initialCount; i += 1) this.particles.push(this.createParticle(true));
  }

  protected abstract createParticle(initial: boolean): Particle;
  protected abstract updateParticle(particle: Particle, dt: number): void;
  protected abstract chooseTarget(): number;
  protected abstract readonly maxCount: number;

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const particle = this.particles[i]!;
      particle.age += dt;
      this.updateParticle(particle, dt);
      if (particle.age >= particle.lifetime) this.particles.splice(i, 1);
    }

    this.targetChangeDelay -= dt;
    if (this.targetChangeDelay <= 0) {
      this.targetCount = this.chooseTarget();
      this.targetChangeDelay = randomBetween(7, 13);
    }

    this.spawnDelay -= dt;
    if (this.particles.length < this.targetCount && this.particles.length < this.maxCount && this.spawnDelay <= 0) {
      this.particles.push(this.createParticle(false));
      this.spawnDelay = randomBetween(1.2, 3.8);
    }
    if (this.particles.length >= this.targetCount) this.spawnDelay = Math.max(this.spawnDelay, 0.4);
  }

  draw(ctx: CanvasRenderingContext2D, atlas: HTMLImageElement): void {
    for (const particle of this.particles) drawAtlasSprite(ctx, atlas, particle);
  }
}

export class HubPetalParticles extends HubParticleSystem {
  protected readonly maxCount = 6;

  constructor() {
    const initialCount = randomInt(2, 4);
    super(initialCount, initialCount);
  }

  protected chooseTarget(): number {
    return Math.random() < 0.16 ? 0 : randomInt(2, 5);
  }

  protected createParticle(initial: boolean): Particle {
    const lifetime = randomBetween(8, 16);
    return {
      sprite: randomInt(0, 3),
      x: randomBetween(90, DESIGN_WIDTH - 90),
      y: initial ? randomBetween(80, DESIGN_HEIGHT - 180) : randomBetween(40, 320),
      vx: randomBetween(-22, 22),
      vy: randomBetween(7, 21),
      rotation: randomBetween(-Math.PI, Math.PI),
      spin: randomBetween(-0.11, 0.11),
      scale: randomBetween(0.35, 0.7),
      alpha: randomBetween(0.25, 0.55),
      age: initial ? randomBetween(0, lifetime * 0.55) : 0,
      lifetime,
    };
  }

  protected updateParticle(particle: Particle, dt: number): void {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.rotation += particle.spin * dt;
    particle.vx += randomBetween(-3, 3) * dt;
    particle.vx = Math.max(-28, Math.min(28, particle.vx));
  }
}

export class HubDustParticles extends HubParticleSystem {
  protected readonly maxCount = 12;

  constructor() {
    const initialCount = randomInt(7, 10);
    super(initialCount, initialCount);
  }

  protected chooseTarget(): number { return randomInt(6, 12); }

  protected createParticle(initial: boolean): Particle {
    const lifetime = randomBetween(12, 25);
    return {
      sprite: randomInt(4, 7),
      x: randomBetween(250, 1600),
      y: initial ? randomBetween(250, 1050) : randomBetween(250, 720),
      vx: randomBetween(-1.7, 1.7),
      vy: randomBetween(-2.1, 0.7),
      rotation: randomBetween(-0.08, 0.08),
      spin: randomBetween(-0.025, 0.025),
      scale: randomBetween(0.2, 0.5),
      alpha: randomBetween(0.04, 0.12),
      age: initial ? randomBetween(0, lifetime * 0.6) : 0,
      lifetime,
    };
  }

  protected updateParticle(particle: Particle, dt: number): void {
    particle.x += (particle.vx + Math.sin(particle.age * 0.31 + particle.sprite) * 0.35) * dt;
    particle.y += particle.vy * dt;
    particle.rotation += particle.spin * dt;
    particle.vx += randomBetween(-0.2, 0.2) * dt;
    particle.vx = Math.max(-2.2, Math.min(2.2, particle.vx));
    if (particle.y < 250) particle.y = 1050;
    if (particle.x < 250) { particle.x = 250; particle.vx = Math.abs(particle.vx); }
    if (particle.x > 1600) { particle.x = 1600; particle.vx = -Math.abs(particle.vx); }
  }
}

export class HubSpiritParticles extends HubParticleSystem {
  protected readonly maxCount = 7;

  constructor() {
    const initialCount = randomInt(3, 5);
    super(initialCount, initialCount);
  }

  protected chooseTarget(): number { return randomInt(3, 7); }

  protected createParticle(initial: boolean): Particle {
    const hasRareSpirit = this.particles.some(particle => particle.sprite === 9);
    const roll = Math.random();
    let sprite: number;
    if (!hasRareSpirit && roll < 0.1) sprite = 9;
    else if (roll < (hasRareSpirit ? 0.56 : 0.6)) sprite = 8;
    else if (roll < (hasRareSpirit ? 0.78 : 0.8)) sprite = 10;
    else sprite = 11;

    const limits: Record<number, { scale: [number, number]; alpha: [number, number] }> = {
      8: { scale: [0.2, 0.45], alpha: [0.08, 0.2] },
      9: { scale: [0.16, 0.28], alpha: [0.12, 0.25] },
      10: { scale: [0.18, 0.35], alpha: [0.06, 0.16] },
      11: { scale: [0.15, 0.32], alpha: [0.06, 0.15] },
    };
    const limit = limits[sprite]!;
    const lifetime = randomBetween(12, 22);
    return {
      sprite,
      x: randomBetween(430, 1550),
      y: initial ? randomBetween(300, 1080) : randomBetween(540, 1050),
      vx: randomBetween(-2.5, 2.5),
      vy: randomBetween(-11, -4),
      rotation: randomBetween(-0.3, 0.3),
      spin: randomBetween(-0.035, 0.035),
      scale: randomBetween(limit.scale[0], limit.scale[1]),
      alpha: randomBetween(limit.alpha[0], limit.alpha[1]),
      age: initial ? randomBetween(0, lifetime * 0.35) : 0,
      lifetime,
    };
  }

  protected updateParticle(particle: Particle, dt: number): void {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.rotation += particle.spin * dt;
    if (particle.x < 430) { particle.x = 430; particle.vx = Math.abs(particle.vx); }
    if (particle.x > 1550) { particle.x = 1550; particle.vx = -Math.abs(particle.vx); }
    if (particle.y < 300) particle.y = 1080;
  }
}

function createGlows(): Glow[] {
  return [
    { x: 105, y: 840, scale: randomBetween(0.65, 0.85), alpha: 0.23, pulse: 0.03, period: randomBetween(4, 7), phase: Math.random() * Math.PI * 2 },
    { x: 1880, y: 285, scale: randomBetween(0.9, 1.15), alpha: 0.3, pulse: 0.035, period: randomBetween(5, 8), phase: Math.random() * Math.PI * 2 },
    { x: 1875, y: 716, scale: randomBetween(0.35, 0.5), alpha: 0.11, pulse: 0.02, period: randomBetween(5, 8), phase: Math.random() * Math.PI * 2 },
    { x: 2415, y: 865, scale: randomBetween(0.55, 0.75), alpha: 0.16, pulse: 0.025, period: randomBetween(4, 7), phase: Math.random() * Math.PI * 2 },
  ];
}

export class HubEnvironment {
  private readonly layer: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly topForeground = loadImage(Assets.hub.environment.topForeground);
  private readonly bottomForeground = loadImage(Assets.hub.environment.bottomForeground);
  private readonly groundFog = loadImage(Assets.hub.environment.groundFog);
  private readonly ambientGlow = loadImage(Assets.hub.environment.ambientGlow);
  private readonly atlas = loadImage(Assets.hub.environment.particleAtlas);
  private readonly glows = createGlows();
  private readonly petals = new HubPetalParticles();
  private readonly dust = new HubDustParticles();
  private readonly spirits = new HubSpiritParticles();
  private active = false;
  private animationFrame = 0;
  private lastFrameTime = 0;
  private elapsed = 0;
  private pixelRatio = 0;
  private viewportWidth = 0;
  private viewportHeight = 0;
  private coverScale = 1;
  private coverOffsetX = 0;
  private coverOffsetY = 0;

  private readonly onVisibilityChange = (): void => {
    if (document.hidden) this.stopLoop();
    else if (this.active) this.startLoop();
  };

  private readonly onResize = (): void => this.resizeCanvas();

  constructor() {
    this.layer = document.createElement('div');
    this.layer.className = 'hub-environment-layer';
    this.layer.setAttribute('aria-hidden', 'true');
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'hub-environment-canvas';
    this.layer.append(this.canvas);
    this.ctx = this.canvas.getContext('2d', { alpha: true, desynchronized: true });
    this.resizeCanvas();
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('resize', this.onResize, { passive: true });
    window.visualViewport?.addEventListener('resize', this.onResize, { passive: true });
  }

  mount(stage: HTMLElement): void {
    this.active = true;
    const viewport = stage.closest<HTMLElement>('.game-viewport') ?? stage;
    if (this.layer.parentElement !== viewport) viewport.prepend(this.layer);
    this.resizeCanvas();
    if (!document.hidden) this.startLoop();
  }

  suspend(): void {
    this.active = false;
    this.stopLoop();
    this.layer.remove();
  }

  destroy(): void {
    this.suspend();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('resize', this.onResize);
    window.visualViewport?.removeEventListener('resize', this.onResize);
  }

  private resizeCanvas(): void {
    const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const bounds = this.layer.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width || window.innerWidth));
    const height = Math.max(1, Math.round(bounds.height || window.innerHeight));
    if (ratio === this.pixelRatio && width === this.viewportWidth && height === this.viewportHeight) return;
    this.pixelRatio = ratio;
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.coverScale = Math.max(width / DESIGN_WIDTH, height / DESIGN_HEIGHT);
    this.coverOffsetX = (width - DESIGN_WIDTH * this.coverScale) / 2;
    this.coverOffsetY = (height - DESIGN_HEIGHT * this.coverScale) / 2;
    this.ctx?.setTransform(this.coverScale * ratio, 0, 0, this.coverScale * ratio, this.coverOffsetX * ratio, this.coverOffsetY * ratio);
  }

  private startLoop(): void {
    if (this.animationFrame || !this.ctx) return;
    this.lastFrameTime = 0;
    const frame = (timestamp: number): void => {
      this.animationFrame = 0;
      if (!this.active || document.hidden) return;
      const dt = this.lastFrameTime === 0 ? 0 : Math.min(0.05, (timestamp - this.lastFrameTime) / 1000);
      this.lastFrameTime = timestamp;
      this.elapsed += dt;
      this.render(dt);
      this.animationFrame = requestAnimationFrame(frame);
    };
    this.animationFrame = requestAnimationFrame(frame);
  }

  private stopLoop(): void {
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = 0;
    this.lastFrameTime = 0;
  }

  private render(dt: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const step = reducedMotion ? 0 : dt;
    this.dust.update(step);
    this.spirits.update(step);
    this.petals.update(step);

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.restore();
    ctx.setTransform(this.coverScale * this.pixelRatio, 0, 0, this.coverScale * this.pixelRatio, this.coverOffsetX * this.pixelRatio, this.coverOffsetY * this.pixelRatio);

    this.drawGlows(ctx, reducedMotion);
    this.dust.draw(ctx, this.atlas);
    this.spirits.draw(ctx, this.atlas);
    this.drawGroundFog(ctx, reducedMotion);
    this.drawForeground(ctx);
    this.petals.draw(ctx, this.atlas);
  }

  private drawGlows(ctx: CanvasRenderingContext2D, reducedMotion: boolean): void {
    if (!this.ambientGlow.complete || this.ambientGlow.naturalWidth === 0) return;
    const imageWidth = this.ambientGlow.naturalWidth;
    const imageHeight = this.ambientGlow.naturalHeight;
    for (const glow of this.glows) {
      const breathing = reducedMotion ? 0 : Math.sin((this.elapsed / glow.period) * Math.PI * 2 + glow.phase) * glow.pulse;
      const width = imageWidth * glow.scale;
      const height = imageHeight * glow.scale;
      ctx.save();
      ctx.globalAlpha = Math.max(0, glow.alpha + breathing);
      ctx.drawImage(this.ambientGlow, glow.x - width / 2, glow.y - height / 2, width, height);
      ctx.restore();
    }
  }

  private drawForeground(ctx: CanvasRenderingContext2D): void {
    if (this.topForeground.complete && this.topForeground.naturalWidth > 0) {
      const height = DESIGN_WIDTH * this.topForeground.naturalHeight / this.topForeground.naturalWidth;
      ctx.drawImage(this.topForeground, 0, 0, DESIGN_WIDTH, height);
    }
    if (this.bottomForeground.complete && this.bottomForeground.naturalWidth > 0) {
      const height = DESIGN_WIDTH * this.bottomForeground.naturalHeight / this.bottomForeground.naturalWidth;
      const top = DESIGN_HEIGHT - height;
      const width = DESIGN_WIDTH * BOTTOM_FOREGROUND_SCALE;
      const enlargedHeight = height * BOTTOM_FOREGROUND_SCALE;
      ctx.save();
      // Keep the foreground's original vertical coverage; the enlarged artwork is
      // clipped at the same lower edge so the outer screen edges remain covered.
      ctx.beginPath();
      ctx.rect(0, top, DESIGN_WIDTH, height);
      ctx.clip();
      ctx.drawImage(this.bottomForeground, (DESIGN_WIDTH - width) / 2, top, width, enlargedHeight);
      ctx.restore();
    }
  }

  private drawGroundFog(ctx: CanvasRenderingContext2D, reducedMotion: boolean): void {
    if (!this.groundFog.complete || this.groundFog.naturalWidth === 0) return;
    const drift = reducedMotion ? 0 : Math.sin((this.elapsed / FOG_DRIFT_PERIOD) * Math.PI * 2) * FOG_DRIFT_DISTANCE;
    const breathing = reducedMotion ? 0 : Math.sin((this.elapsed / FOG_BREATH_PERIOD) * Math.PI * 2) * FOG_ALPHA_BREATH;
    const width = DESIGN_WIDTH;
    const height = width * this.groundFog.naturalHeight / this.groundFog.naturalWidth;
    ctx.save();
    ctx.globalAlpha = FOG_ALPHA + breathing;
    ctx.drawImage(this.groundFog, drift, DESIGN_HEIGHT - height, width, height);
    ctx.restore();
  }
}
