import './game.css';
import './ui/card-view.css';
import { BattleView } from './ui/game-view';
import { mountCardTestScene } from './ui/card-test-scene';

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('页面缺少应用容器');
if (new URLSearchParams(location.search).has('card-test')) mountCardTestScene(app);
else new BattleView(app);
