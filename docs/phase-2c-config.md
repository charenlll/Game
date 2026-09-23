# Phase 2C 配置说明

本文记录 Phase 2C 稳定基线，供后续 Phase 2D 增量开发使用。

## Run流程

`src/core/run.ts` 保存独立于战斗的 `RunState`：

- `Seed`：本次Run的基础随机种子。
- `RandomState`：奖励随机数状态。
- `SelectedCharacterID`：当前角色。
- `CurrentEncounter`：当前战斗序号，从1开始。
- `MaxEncounters`：当前固定为3。
- `CompletedEncounters`：已完成战斗数。
- `RunDeck`：跨战斗保留并因奖励增长的牌组。
- `AcquiredCards`：本次Run已经获得的奖励牌。
- `Status`：`battle`、`reward`、`completed`或`failed`。

每场战斗重新创建 `Battle`。灯火、手牌、弃牌堆、消耗牌堆、执念和临时费用修正不会跨场继承；`RunDeck`会继承。

奖励池只包含当前角色可用的普通牌，不包含浊念。玩家选择并确认后，奖励牌才加入 `RunDeck`。

## 战斗规则

- 初始手牌5张，之后每回合摸2张。
- 未使用手牌保留。回合结束超过5张时手动弃置普通牌至5张。
- 所有浊念在任何情况下均不可弃置。
- `burden_001` 踌躇：由踌躇蔓延随机插入抽牌堆；抽到后不能打出并永久留手。
- `burden_002` 杂念：由杂念滋生直接加入手牌；支付1灯火后进入消耗牌堆。
- 抽牌堆不足时将弃牌堆随机洗回。结算区卡牌不会参与该次洗牌。
- 状态先结算，动画只表现已经完成的状态变化；反馈队列可取消，重新开始不会遗留旧动画。

## 当前Intent

- 踌躇蔓延：向抽牌堆随机插入1张踌躇。
- 封闭：当前执念+4。
- 杂念滋生：向当前手牌加入1张杂念。
- 迟疑：下一回合随机正常可用牌临时+1费。
- 魂灯黯淡：下一回合基础灯火-1。

普通对局随机生成Intent顺序；指定seed时可复现。

## 角色配置

角色定义位于 `src/data/characters.json`，可以配置专属牌、起始牌组修正、战斗特性以及后续预留字段。

特性定义位于 `src/data/traits.json`。`glowColor`控制特性激活时PNG外部圆形发光颜色，PNG本身不会变色。

## UI配置

`src/ui/layout-config.ts`：

- `HandLayout`：手牌间距、最大展开宽度和中心位置；
- `DragConfig`：拖拽阈值、拖拽缩放和有效出牌区；
- `BattleLayout`：角色、亡魂、结束回合和Intent位置；
- `FeedbackConfig`：抽牌、弃牌、Intent、成功和失败动画时长。

`src/ui/card-layout.ts`配置600×900逻辑卡框内的费用、名称、卡面和描述区域。

`src/game.css`负责战斗界面；`src/ui/run-view.css`负责奖励、进度和Run Result界面。矮横屏覆盖集中在各文件末尾的横屏媒体查询中。

## 素材绑定

`scripts/import-assets.mjs`是源素材到运行时素材的明确映射；`docs/asset-bindings.json`记录最近一次导入的字节数和SHA-256。

代码统一通过 `src/core/asset-manifest.ts`和数据文件引用运行时路径。不要在新组件中重新写源素材绝对路径。

## Phase 2C验收命令

```powershell
npm.cmd run assets:import
npm.cmd run build
npm.cmd test
npm.cmd run test:browser
```

稳定基线为45个核心单元测试和31个Playwright浏览器测试通过。
