import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const files = {
  'cards/frames/UI01卡框.png': 'assets/cards/frames/UI01.png',
  'cards/frames/UI02卡背.png': 'assets/cards/frames/UI02.png',
  'cards/common/CA01温言.png': 'assets/cards/common/CA01.png',
  'cards/common/CA02静听.png': 'assets/cards/common/CA02.png',
  'cards/common/CA03添灯.png': 'assets/cards/common/CA03.png',
  'cards/common/CA04观微.png': 'assets/cards/common/CA04.png',
  'cards/common/CA05整理行囊.png': 'assets/cards/common/CA05.png',
  'cards/common/CA06旧事.png': 'assets/cards/common/CA06.png',
  'cards/burden/ZN01踌躇.png': 'assets/cards/burden/ZN01.png',
  'cards/burden/ZN02杂念.png': 'assets/cards/burden/ZN02.png',
  'ferrymen/feichuan/CH01绯川标准立绘.png': 'assets/characters/CH01.png',
  'souls/soul-001/GH01执念状态.png': 'assets/souls/GH01.png',
  'souls/soul-001/GH02释然状态.png': 'assets/souls/GH02.png',
  'background/battle/BA01战斗场景1.png': 'assets/backgrounds/BA01.png',
  'ui/icons/IC01灯火.png': 'assets/ui/icons/IC01.png',
  'ui/icons/IC02安抚.png': 'assets/ui/icons/IC02.png',
  'ui/icons/IC03引魂.png': 'assets/ui/icons/IC03.png',
  'ui/icons/IC04洞察.png': 'assets/ui/icons/IC04.png',
  'ui/icons/IC05执念.png': 'assets/ui/icons/IC05.png',
  'ui/icons/IC06净化.png': 'assets/ui/icons/IC06.png',
  'ui/icons/IC07灵术.png': 'assets/ui/icons/IC07.png',
  'ui/card/UC01抽牌堆图标.png': 'assets/ui/card/UC01.png',
  'ui/card/UC02弃牌堆图标.png': 'assets/ui/card/UC02.png',
  'ui/card/UC03消耗移除牌图标.png': 'assets/ui/card/UC03.png',
  'ui/battle/UI03反馈提示框.png': 'assets/ui/battle/UI03.png',
  'ui/results/RT01渡魂成功.png': 'assets/ui/results/RT01.png',
  'ui/results/RT02渡魂未完成.png': 'assets/ui/results/RT02.png',
  'effect/soul/FX01通用魂火.png': 'assets/effects/soul/FX01.png',
  'effect/soul/FX02释然魂光.png': 'assets/effects/soul/FX02.png',
};
const report = [];
for (const [source, destination] of Object.entries(files)) {
  const from = resolve(root, '资源图源文件', source);
  const to = resolve(root, 'public', destination);
  await mkdir(dirname(to), { recursive: true });
  await copyFile(from, to);
  const original = await readFile(from), copied = await readFile(to);
  if (!original.equals(copied)) throw new Error(`素材复制校验失败：${source}`);
  report.push({ source, destination, bytes: copied.length, sha256: createHash('sha256').update(copied).digest('hex') });
}
await writeFile(resolve(root, 'docs/asset-bindings.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`已按明确文件名映射复制并校验 ${report.length} 个素材；未解码、修改或视觉识别图片。`);
