# Phase 0 技术实施方案

状态：开发者已确认技术方案及12张起始牌组解释，授权开始 Phase 1。日期：2026-09-22。

## 1. 当前工程与协作

F:/Game 原为空目录，无代码或既有技术栈。已在 PATH 发现 Node.js、npm 和 Git。
开发者负责玩法设计、资源投入、试玩与阶段决策；程序助手负责实现、运行、测试、修复及文档。
每次仅推进一个 Phase，完成后报告测试和未解决问题，等待确认。

## 2. 技术选型

建议 TypeScript + Vite + HTML/CSS，使用浏览器原生界面实现二维卡牌原型。
TypeScript 管理规则和数据类型，Vite 提供本地运行和构建，HTML/CSS 负责手牌与信息展示。
核心规则不依赖页面元素，方便自动测试与后续替换展示层。暂不引入后端或大型前端框架。
首个验收目标为电脑浏览器、鼠标点击操作；手机适配尚未确认，不计入 Phase 1 验收范围。
本地浏览器运行不等于公开上线，托管发布单独安排。

参考：https://vite.dev/guide/ 、https://www.typescriptlang.org/docs/handbook/intro

## 3. 最小目录与预计文件

```text
index.html
package.json
package-lock.json
tsconfig.json
.gitignore
src/
  main.ts
  style.css
  data/
    characters.json
    cards.json
    souls.json
  core/
    types.ts
    content.ts
    deck.ts
    effects.ts
    battle.ts
    events.ts
  ui/
    battle-view.ts
tests/
  battle.test.ts
  deck.test.ts
docs/
  phase-0.md
  phase-1-report.md
```

本次仅新增本方案。上述工程文件在 Phase 1 创建；traits.ts 与 traits.json 到 Phase 2 按需添加，run.ts 到 Phase 4，resources.ts 与存档模块到 Phase 5。不预建空的未来系统。

## 4. Character 数据

CharacterDefinition 字段：CharacterID、Name、AnimalType、Gender（仅 Male）、AgeGroup、Occupation、Personality、VisualKeywords、CombatTrait（ID）、ResourceTrait（ID）、ExclusiveCards（卡牌 ID 列表）、TraitUpgrades（ID 列表）、StartingDeckModifier、StoryID、ArtReference。
StartingDeckModifier 表示起始牌组的增减配置；Phase 1 使用固定测试牌组。
未实现阶段的引用允许显式留空并标注，不加载未实现能力。每个人物最终恰好一个核心战力特性与一个核心资源特性。
CharacterDefinition 是静态数据，触发次数、局内升级等属于运行状态，不能写回人物定义。

## 5. CombatTrait 架构

TraitDefinition = ID + Kind + Trigger + Conditions + Effects + Limit。
Kind 为 Combat 或 Resource；Limit 记录每回合/每场触发上限。条件、效果采用有限枚举和参数，不设计任意脚本语言。
狐契配置：OnCardCreated、临时牌且本回合未触发、指定实例费用本回合 -1、每回合一次，费用最低为 0。
触发次数在回合开始重置。一次生成多张牌时逐张发送创建事件，只有首张符合条件的实例减费。
Phase 1 只建立最小事件边界，Phase 2 才实现特性执行。

## 6. ResourceTrait 架构

资源特性读取已完成任务的统计快照，积累夜巡奖励记录，不能取得直接修改对局的接口。
生意经计划：成功渡魂且本场临时牌实际使用至少三次，记录一次交易成功；完整夜巡结束时按成功次数结算铜钱。
具体铜钱数、夜巡失败是否保留基础收益在 Phase 5 确定。临时牌使用统计以成功提交出牌为准，不计点击失败或取消。
特性由通用条件和效果配置组合；任何模块不以 CharacterID 判断人物能力。

## 7. Card 数据

CardDefinition 字段：CardID、Name、Description、Cost、CardType、Rarity、Tags、TargetType、Effects、IsTemporary、OwnerCharacterID、ArtReference。
CardType 限定安抚、引魂、净化、洞察、灵术。公共牌 OwnerCharacterID 为空。
CardInstance 字段：InstanceID、DefinitionID、IsTemporary、CostModifiers；成本修正记录来源、数值和有效期。
复制卡牌创建新实例，不能共享可变状态。临时复制默认复制基础定义，不继承来源实例的临时减费。
临时牌建议在使用后或回合弃置时移出对局，普通牌进入弃牌堆；此规则在 Phase 2 实施前明确。

## 8. CardEffect 架构

Effect 数据为类型和参数，例如 { Type: ReduceObsession, Amount: 4 }。
Phase 1 按测试牌需要实现 ReduceObsession、GainLight、DrawCard、DiscardCard；净化与负面状态仅在测试卡确实需要时加入。
Phase 2/3 增加 CreateTemporaryCard、CopyCard、ModifyCost 等。
content.ts 校验唯一 ID、费用合法性、引用和支持的效果类型；遇到无效数据明确报错，不静默忽略。
出牌先收集目标与弃牌选择并校验，再扣费、移出手牌、按顺序结算效果，最后检查胜负。取消选择不扣费，不改变牌堆。
效果生成事件按明确顺序处理；监听器不能递归无限触发，后续复制机制需加入单次结算上限保护及错误日志。

## 9. Battle 流程

初始化角色、亡魂、牌堆与随机种子 → 第 1 回合开始 → 灯火设为 3 → 抽至 5 张 → 等待玩家操作。
出牌校验包括进行中状态、牌在手中、灯火足够、目标合法；完整结算后再接受下一条操作。
玩家结束回合 → 处理回合结束规则 → 弃置剩余手牌 → 清理回合修正 → 检查回合上限 → 下一回合。
抽牌堆不足时洗入弃牌堆继续抽，两堆都为空则停止抽牌。
执念不高于 0 为渡魂成功；第 10 回合仍允许正常操作，结束第 10 回合且未成功才失败。
胜负确定后禁止继续出牌或结束回合；重新开始必须生成完整的新状态。
核心状态：回合数、灯火、亡魂执念、抽牌堆、手牌、弃牌堆、移除区、对局阶段与统计。

## 10. Resource 分层

BattleState：灯火等单场状态。
RunState：本次夜巡牌组、任务结果、交易记录与待结算奖励。
MetaState：永久铜钱与未来解锁记录。
资源管理接口要求显式指定 Run 或 Meta。结算事务按 RunID 防重复，未结算记录不能直接作为永久余额。
Phase 5 使用带版本号的本地存档；清除浏览器数据会影响存档，届时确定导出备份方案。Phase 1 不实现永久存档。
所有重要资源保留通用获得渠道；人物资源特性提供额外效率，不垄断获得权限。

## 11. 事件边界与风险

局内事件：OnTurnStart、OnCardCreated、OnCardPlayed、OnCardDiscarded、OnBattleEnd。
夜巡事件：OnTaskCompleted、OnRunCompleted；其他节点事件到对应阶段再加。
事件包含对局/夜巡 ID、实例 ID 和必要统计。对局结束只发送一次结果；夜巡层把成功结果转换为任务完成事件。
OnCardCreated 在实例进入手牌后、界面刷新前处理，使费用变化即时可见。
高风险边界：抽牌洗牌、一次出牌多效果、事件顺序、临时复制身份、费用持续时间、结束对局后的重复输入、结算重复发放。
固定种子和规则测试用于复现；保留简短操作日志以协助试玩反馈。

## 12. Phase 1 实施及验收

建议将“12张测试卡”理解为起始牌组共 12 张，允许同名重复；先用少量公共牌定义验证流程。若开发者指 12 种不同卡牌，需要在实施前调整配置方案。
开发者已确认该解释：起始牌组共12张，允许同名重复。

1. 固定测试牌组与各牌费用、效果，记录到数据文件；绯川只显示身份和未启用的双特性说明。
2. 初始化项目、依赖锁文件、类型定义和数据校验。
3. 实现牌库、回合、基础效果、成功与超时失败。
4. 制作中文可操作界面：角色、亡魂执念、回合、灯火、手牌、牌堆数量、操作记录、结束回合、重新开始。
5. 运行类型检查和生产构建；规则测试覆盖费用不足不改变状态、洗牌不丢牌、第 10 回合胜负边界、结束后禁用操作、重开清空旧状态。
6. 实际浏览器打开并操作验证：出牌、结束回合、成功、超时失败、重新开始；报告真实结果与未测项。
7. 交付运行方式、文件变更、测试结果、未解决问题，请开发者试玩；停止等待下一阶段确认。

原型使用占位素材，卡牌文字与选择反馈必须清晰。30 执念与 10 回合是流程测试参数，不能据此认定正式难度合理。
首阶段不做正式立绘、地图、三选一、专属牌效果、狐契、生意经、永久资源或公开部署。
