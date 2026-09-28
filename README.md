# 渡魂 — 浏览器游戏工程

中国古风幻想、治愈向卡牌 Roguelite 工程。当前可体验序章《初见》的剧情与三场战斗、驿站主界面、信物录、摆渡人页面及普通对局。第一篇章仍待开发。

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

序章使用独立剧情和三场逐步变化的战斗，完成后解锁驿站。普通对局与序章的返回入口不同：序章首次进入时返回开始菜单，从驿站重玩序章时返回驿站；后续对局返回驿站。养成页已有展示结构，尚未开放的成长节点仍不可用。存档使用版本化结构，战斗中进度可恢复；主动返回菜单会结束当前对局。

## 素材更新

源素材位于 `资源图源文件/`，运行时素材位于 `public/assets/`。更新源文件后执行：

```powershell
npm.cmd run assets:import
```

导入脚本按明确文件名复制并进行字节校验，不修改源素材。驿站当前渡魂按钮使用 `public/assets/ui/hub/buttons/ferry_primary_button1.png`；旧 HB18 素材不再覆盖它。人物主视觉仍使用静态 CHH01，视频动态立绘尚未接入。卡牌显示测试场景为 `http://127.0.0.1:5173/?card-test`。

## 验证

```powershell
npm.cmd run build
npm.cmd test
npm.cmd run validate:content
npm.cmd run test:browser
```

- `build/`：生产构建输出。
- `tests/`：核心规则单元测试。
- `e2e/`：拖拽、动画、UI、Run流程浏览器测试。
- `artifacts/`：浏览器测试临时产物，不提交Git。
- 驿站 UI 以 1600×800 为布局基准；[适配与层级规则](docs/hub-ui-layout-rules.md)记录其他横屏尺寸和弹窗的验收矩阵。

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

## 核心叙事文档

- [最高剧情方向与叙事闭环](docs/narrative-vision.md)：后续篇章、亡魂故事、角色养成和玩法叙事结合的最高参考。

## 工程规范

- [架构与内容生产规范 v1](docs/architecture-and-content-standards-v1.md)：系统边界、状态与存档生命周期、内容/资源校验、UI样式和测试发布要求。
- [驿站 UI 适配与层级规则](docs/hub-ui-layout-rules.md)：1600×800 基准、环境美术坐标、弹窗和多视口验收。
- [第一篇章开发前架构准备方案（阶段 A–C 已实施）](docs/first-chapter-architecture-implementation-plan.md)：章节/存档边界、序章 textKey 迁移、战斗恢复实现与阶段 D 开发门槛。
