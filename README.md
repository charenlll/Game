# 夜渡 — Phase 2C 浏览器原型

中国古风幻想、治愈向卡牌 Roguelite 原型。当前版本面向手机横屏，已经完成单场战斗、角色专属牌与特性、三场 Run、战后奖励和 Run Result 的最小闭环。

## 运行

需要 Node.js 22.12 或更新版本。

```powershell
cd F:\Game
npm.cmd install
npm.cmd run dev -- --port 5173
```

浏览器打开 `http://127.0.0.1:5173/`。不带参数时，每次新 Run 使用随机种子；使用 `http://127.0.0.1:5173/?seed=42` 可以复现相同牌序、Intent和奖励顺序。

不要使用 VS Code Go Live 直接打开 `index.html`，项目依赖 Vite 处理 TypeScript、模块和资源路径。

## 当前玩法

- 每个 Run 包含3场战斗。战斗胜利后从3张现有普通牌中选择1张加入 Run 牌组；任意战斗失败则本次 Run 暂止。
- 初始摸5张牌，之后每回合恢复基础灯火并摸2张牌。未使用的牌跨回合保留。
- 回合结束时若手牌超过5张，玩家手动选择可弃置普通牌直到剩余5张。
- 所有浊念都不能弃置。踌躇随机插入抽牌堆，抽到后永久留在手牌且不能打出；杂念由Intent直接加入手牌，支付1灯火后进入消耗牌堆。
- 抽牌堆用尽时洗回弃牌堆。正在结算的卡不会被自己的抽牌效果重新抽回。
- 普通对局的初始牌序、洗牌、Intent和奖励均随机；显式seed可完整复现。

当前角色为绯川，起始牌组由12张通用牌加3张绯川专属牌组成。战斗特性“善贾”在每回合第一次实际获得灯火后激活，使下一张成功打出的普通牌费用-1，最低为0。

当前3场遭遇暂时复用同一亡魂和战斗配置。不同亡魂、路线节点、局外成长和永久存档尚未实现。

## 素材更新

源素材位于 `资源图源文件/`，运行时素材位于 `public/assets/`。更新源文件后执行：

```powershell
npm.cmd run assets:import
```

导入脚本按明确文件名复制并进行字节校验，不修改源素材。卡牌显示测试场景为 `http://127.0.0.1:5173/?card-test`。

## 验证

```powershell
npm.cmd run build
npm.cmd test
npm.cmd run test:browser
```

- `build/`：生产构建输出。
- `tests/`：核心规则单元测试。
- `e2e/`：拖拽、动画、UI、Run流程浏览器测试。
- `artifacts/`：浏览器测试临时产物，不提交Git。

## 配置入口

- 战斗与反馈布局：`src/ui/layout-config.ts`
- 卡框内部文字与卡面区域：`src/ui/card-layout.ts`
- 战斗UI：`src/game.css`
- Run、奖励和结算UI：`src/ui/run-view.css`
- 卡牌数据：`src/data/cards.json`
- Intent数据：`src/data/intents.json`
- 角色与特性：`src/data/characters.json`、`src/data/traits.json`
- 详细配置说明：[Phase 2C配置说明](docs/phase-2c-config.md)

## 历史文档

- [技术方案](docs/phase-0.md)
- [素材规格与内容清单](docs/asset-checklist.md)
- [Phase 1阶段报告](docs/phase-1-report.md)
- [横屏界面验收](docs/phase-1-landscape-ui.md)
