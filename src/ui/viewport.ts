const DESIGN_WIDTH = 1600;
const DESIGN_HEIGHT = 900;

export interface GameViewport {
  readonly stage: HTMLElement;
  destroy(): void;
}

export function createGameViewport(host: HTMLElement): GameViewport {
  host.innerHTML = `<div class="game-viewport">
    <img class="viewport-background" alt="">
    <div class="safe-area-probe" aria-hidden="true"></div>
    <div class="game-stage"></div>
    <div class="viewport-overlay"></div>
    <div class="viewport-rotate"><span>▯</span><h2>横过来，继续今夜的摆渡</h2></div>
  </div>`;
  const viewport = host.querySelector<HTMLElement>('.game-viewport')!;
  const stage = viewport.querySelector<HTMLElement>('.game-stage')!;
  const background = viewport.querySelector<HTMLImageElement>('.viewport-background')!;
  const probe = viewport.querySelector<HTMLElement>('.safe-area-probe')!;

  const update = (): void => {
    const visual = window.visualViewport;
    const style = getComputedStyle(probe);
    const safeLeft = parseFloat(style.paddingLeft) || 0;
    const safeRight = parseFloat(style.paddingRight) || 0;
    const safeTop = parseFloat(style.paddingTop) || 0;
    const safeBottom = parseFloat(style.paddingBottom) || 0;
    const viewportWidth = visual?.width ?? window.innerWidth;
    const viewportHeight = visual?.height ?? window.innerHeight;
    const offsetLeft = (visual?.offsetLeft ?? 0) + safeLeft;
    const offsetTop = (visual?.offsetTop ?? 0) + safeTop;
    const safeWidth = Math.max(1, viewportWidth - safeLeft - safeRight);
    const safeHeight = Math.max(1, viewportHeight - safeTop - safeBottom);
    const scale = Math.min(safeWidth / DESIGN_WIDTH, safeHeight / DESIGN_HEIGHT);
    stage.style.left = `${offsetLeft + (safeWidth - DESIGN_WIDTH * scale) / 2}px`;
    stage.style.top = `${offsetTop + (safeHeight - DESIGN_HEIGHT * scale) / 2}px`;
    stage.style.transform = `scale(${scale})`;
    stage.dataset.scale = String(scale);
    viewport.style.setProperty('--viewport-stage-scale', String(scale));
  };

  const syncBackground = (): void => {
    const source = stage.querySelector<HTMLImageElement>('.scene-background,.run-background,.menu-background,.prologue-background');
    if (source?.src && background.src !== source.src) background.src = source.src;
  };
  const resizeObserver = new ResizeObserver(update);
  const mutationObserver = new MutationObserver(syncBackground);
  resizeObserver.observe(host);
  mutationObserver.observe(stage, { childList: true, subtree: true });
  window.visualViewport?.addEventListener('resize', update);
  window.visualViewport?.addEventListener('scroll', update);
  window.addEventListener('orientationchange', update);
  update();

  return {
    stage,
    destroy(): void {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
      window.removeEventListener('orientationchange', update);
    },
  };
}

export function screenToGamePoint(stage: HTMLElement, clientX: number, clientY: number): { x: number; y: number; scale: number } {
  const rect = stage.getBoundingClientRect();
  const scale = rect.width / DESIGN_WIDTH || 1;
  return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale, scale };
}
