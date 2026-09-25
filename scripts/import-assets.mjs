import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
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
  'cards/feichuan/FC01狐火.png': 'assets/cards/feichuan/FC01.png',
  'cards/feichuan/FC02借灯.png': 'assets/cards/feichuan/FC02.png',
  'cards/feichuan/FC03讨价还价.png': 'assets/cards/feichuan/FC03.png',
  'cards/feichuan/FCF01绯川专属卡框.png': 'assets/cards/feichuan/FCF01.png',
  'ferrymen/feichuan/CH01绯川标准立绘.png': 'assets/characters/CH01.png',
  'ferrymen/moyu/CH02墨羽标准立绘.png': 'assets/characters/CH02.png',
  'ferrymen/qinglan/CH03青岚标准立绘.png': 'assets/characters/CH03.png',
  'ferrymen/feichuan/AV01绯川头像.png': 'assets/characters/AV01.png',
  'ferrymen/moyu/AV02墨羽头像.png': 'assets/characters/AV02.png',
  'ferrymen/qinglan/AV03青岚头像.png': 'assets/characters/AV03.png',
  'souls/soul-001/GH01执念状态.png': 'assets/souls/GH01.png',
  'souls/soul-001/GH02释然状态.png': 'assets/souls/GH02.png',
  'background/battle/BA01战斗场景1.png': 'assets/backgrounds/BA01.png',
  'background/run/BA05reward公用背景.png': 'assets/backgrounds/run/BA05.png',
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
  'ui/traits/TR01善贾.png': 'assets/ui/traits/TR01.png',
  'ui/run/reward/RW01-A奖励底座.png': 'assets/ui/run/reward/RW01-A.png',
  'ui/run/reward/RW01-B奖励底座.png': 'assets/ui/run/reward/RW01-B.png',
  'ui/run/reward/RW01-C奖励底座.png': 'assets/ui/run/reward/RW01-C.png',
  'ui/run/reward/RW02标题装饰框.png': 'assets/ui/run/reward/RW02.png',
  'ui/run/progress/RP01-A未到达.png': 'assets/ui/run/progress/RP01-A.png',
  'ui/run/progress/RP01-B当前.png': 'assets/ui/run/progress/RP01-B.png',
  'ui/run/progress/RP01-C已到达.png': 'assets/ui/run/progress/RP01-C.png',
  'ui/run/progress/RP02-A连接线pending.png': 'assets/ui/run/progress/RP02-A.png',
  'ui/run/progress/RP02-B连接线complete.png': 'assets/ui/run/progress/RP02-B.png',
  'ui/run/buttons/RB01-A按钮normal.png': 'assets/ui/run/buttons/RB01-A.png',
  'ui/run/buttons/RB01-B按钮hover.png': 'assets/ui/run/buttons/RB01-B.png',
  'ui/run/buttons/RB01-C按钮pressed.png': 'assets/ui/run/buttons/RB01-C.png',
  'ui/run/result/RR01渡船结算icon.png': 'assets/ui/run/result/RR01.png',
  'ui/run/result/RR02信息底框.png': 'assets/ui/run/result/RR02.png',
  'effect/soul/FX01通用魂火.png': 'assets/effects/soul/FX01.png',
  'effect/soul/FX02释然魂光.png': 'assets/effects/soul/FX02.png',
  'souls/soul-000/GH-P01初见孩子·普通状态.png': 'assets/souls/prologue/GH-P01.png',
  'souls/soul-000/GH-P02初见孩子·迟疑状态.png': 'assets/souls/prologue/GH-P02.png',
  'souls/soul-000/GH-P03初见孩子·释然状态.png': 'assets/souls/prologue/GH-P03.png',
  'story/prologue/props/PR-P01孩子的小木船.png': 'assets/story/prologue/PR-P01.png',
  'background/prologue/BA07五名渡口·序章主景.png': 'assets/backgrounds/prologue/BA07.png',
  'background/prologue/BA08渡口附近·旧路河岸.png': 'assets/backgrounds/prologue/BA08.png',
  'background/prologue/BA09临水浅滩·发现木船.png': 'assets/backgrounds/prologue/BA09.png',
  'background/hub/HB01驿站主题背景.png': 'assets/backgrounds/hub/HB01.png',
  'background/hub/HB14摆渡人养成页背景.png': 'assets/backgrounds/hub/HB14.png',
  'ui/hub/display/HB02标准信物收藏架.png': 'assets/ui/hub/HB02.png',
  'ui/hub/display/HB08收藏分类标题底纹.png': 'assets/ui/hub/HB08.png',
  'ui/hub/nacigation/HB03收藏架右翻页箭头.png': 'assets/ui/hub/HB03.png',
  'ui/hub/nacigation/HB16通用返回按钮.png': 'assets/ui/hub/HB16.png',
  'ui/hub/buttons/HB05主功能按钮底板.png': 'assets/ui/hub/HB05.png',
  'ui/hub/buttons/HB06次级功能按钮底板.png': 'assets/ui/hub/HB06.png',
  'ui/hub/buttons/HB18墨绿圆形主按钮.png': 'assets/ui/hub/buttons/ferry_primary_button.png',
  'ui/hub/icons/HB09未解锁标记.png': 'assets/ui/hub/HB09.png',
  'ui/hub/icons/HB10设置图标.png': 'assets/ui/hub/HB10.png',
  'ui/hub/panels/HB07信物详情面板.png': 'assets/ui/hub/HB07.png',
  'ui/hub/characters/HB11摆渡人选择卡底板.png': 'assets/ui/hub/HB11.png',
  'ui/hub/characters/HB15通用养成节点按钮.png': 'assets/ui/hub/HB15.png',
  'ui/hub/stages/HB17条目底框.png': 'assets/ui/hub/stages/stage_entry_panel.png',
  'ui/resources/RS01铜钱.png': 'assets/ui/resources/RS01.png',
  'ui/resources/RS02魂火.png': 'assets/ui/resources/RS02.png',
};
const hubCharacterSourceDirectory = resolve(root, '资源图源文件', 'ui', 'hub', 'characters');
try {
  const hubCharacterSources = await readdir(hubCharacterSourceDirectory);
  const infoPanel = hubCharacterSources.find(name => name.startsWith('HB19'));
  if (infoPanel) files[`ui/hub/characters/${infoPanel}`] = 'assets/ui/hub/characters/info_panel_9slice.png';
} catch {
  // HB19 is optional until the character information panels are used.
}
const menuSourceDirectory = resolve(root, '资源图源文件', 'background', 'menu');
try {
  const menuSources = await readdir(menuSourceDirectory);
  const background = menuSources.find(name => name.startsWith('BA06'));
  const logo = menuSources.find(name => name.startsWith('LG01'));
  if (background) files[`background/menu/${background}`] = 'assets/backgrounds/menu/main_menu_background.png';
  if (logo) files[`background/menu/${logo}`] = 'assets/ui/menu/game_logo.png';
} catch {
  // Menu artwork is optional during development; the menu has a text logo fallback.
}
const hubBackgroundDirectory = resolve(dirname(menuSourceDirectory), 'hub');
try {
  const hubEnvironmentSources = await readdir(hubBackgroundDirectory);
  const environmentAssets = [
    ['HBFX01', 'assets/hub/foreground/HBFX01_top_foreground.png'],
    ['HBFX02', 'assets/hub/foreground/HBFX02_bottom_foreground.png'],
    ['HBFX03', 'assets/hub/effects/HBFX03_ambient_glow.png'],
    ['HBFX04', 'assets/hub/effects/HBFX04_particle_atlas.png'],
    ['HBFX05', 'assets/hub/effects/HBFX05_ground_fog.png'],
  ];
  for (const [prefix, destination] of environmentAssets) {
    const source = hubEnvironmentSources.find(name => name.startsWith(prefix));
    if (source) files[`background/hub/${source}`] = destination;
  }
} catch {
  // Environmental foreground/effect artwork is optional until the hub enhancement is enabled.
}
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
const formattedReport = JSON.stringify(report, null, 4).replace(/": /g, '":  ');
await writeFile(resolve(root, 'docs/asset-bindings.json'), formattedReport + '\n');
console.log(`已按明确文件名映射复制并校验 ${report.length} 个素材；未解码、修改或视觉识别图片。`);
