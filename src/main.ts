import './game.css';
import './ui/card-view.css';
import './ui/run-view.css';
import { mountCardTestScene } from './ui/card-test-scene';
import { GameFlow } from './ui/game-flow';
import { createGameViewport } from './ui/viewport';
import './ui/viewport.css';
import './ui/main-menu.css';
import './ui/prologue.css';

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('页面缺少应用容器');
if (new URLSearchParams(location.search).has('card-test')) mountCardTestScene(app);
else {
  const seedParam = new URLSearchParams(location.search).get('seed');
  const rawSeed = seedParam === null ? NaN : Number(seedParam);
  const seed = Number.isInteger(rawSeed) && rawSeed >= 0 && rawSeed <= 0xFFFFFFFF ? rawSeed : crypto.getRandomValues(new Uint32Array(1))[0];
  const viewport = createGameViewport(app);
  const showMainMenu = !(import.meta.env.DEV && new URLSearchParams(location.search).has('test-run'));
  const flow = new GameFlow(viewport.stage, seed, showMainMenu);
  if (import.meta.env.DEV) (globalThis as typeof globalThis & { __nightFerryDebug?: { finishBattle(result: 'won' | 'lost'): void; state(): unknown } }).__nightFerryDebug = {
    finishBattle: result => flow.debugFinishBattle(result),
    state: () => flow.debugState(),
  };
}
