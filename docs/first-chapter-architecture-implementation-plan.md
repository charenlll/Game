# 《渡魂》第一篇章开发前架构准备方案

**版本：** 1.0（已确认并实施阶段 A–C）
**日期：** 2026-09-25
**状态：** 阶段 A–C 已实现并通过回归；阶段 D「世」篇内容生产尚未开始。
**适用范围：** 序章之后的第一篇章；本文暂按主线「世」篇理解。
**依据：** [架构与内容生产规范 v1](architecture-and-content-standards-v1.md)。

本文记录已经确认并完成的架构准备、旧存档迁移和代码边界。实施遵循渐进迁移，没有整体重写；序章台词与节点顺序、战斗规则、UI外观和已验收输入保持不变。下一步可以基于本规范开始「世」篇内容生产。

## 1. 本轮目标与边界

在新增「世」篇内容前，先具备：

1. 一个章节可描述、可校验、可由稳定节点 ID 恢复的内容结构。
2. 玩家档案、章节进度、Run 和单场战斗的状态边界。
3. 可重复调用而不会重复授予奖励的章节结算。
4. 从现有序章存档键迁移到统一存档结构的兼容路径。
5. 自动检测章节断链、无效引用和缺失素材的内容检查。
6. 序章与第一篇统一使用稳定 `textKey`，完整恢复进行中的战斗牌、回合和 Run 奖励状态。

本轮不做：

- 重做战斗规则、Run 奖励算法、卡牌效果或 Pointer/拖牌输入。
- 实现完整好感、特性分支、永久卡牌解锁、装扮玩法；只定义未来数据归属与扩展接口。
- 整体迁移 `src/core`、`src/data`、`src/ui` 目录，重做驿站或主菜单。
- 新建通用剧情编辑器、ECS、插件系统或全局事件总线。
- 改变序章内容、节点顺序、数值、资源和玩家体验。

## 2. 建议的逻辑契约

下面的 TypeScript 契约已按现有代码习惯实现；后续按需要扩展字段，并维持已发布 ID。

### 2.1 章节静态定义

```ts
type ChapterId = string;
type ChapterNodeId = string;
type EncounterId = string;
type GrantId = string;

interface ChapterDefinition {
  id: ChapterId;
  entryNodeId: ChapterNodeId;
  nodes: Readonly<Record<ChapterNodeId, ChapterNode>>;
  encounters: Readonly<Record<EncounterId, EncounterDefinition>>;
  grants: Readonly<Record<GrantId, ProgressionGrant>>;
}

interface EncounterDefinition {
  id: EncounterId;
  battle: BattleEncounterConfig;
  backgroundId: string;
  rewardPolicy: 'none' | 'run_card_choice';
}

type ChapterNode =
  | StoryNode
  | ChoiceNode
  | EncounterNode
  | RewardNode
  | ChapterEndNode;

interface ChoiceNode {
  kind: 'choice';
  id: ChapterNodeId;
  promptTextKey: string;
  options: readonly {
    id: string;
    textKey: string;
    effects?: readonly StoryCommand[];
    grantId?: GrantId;
    nextNodeId: ChapterNodeId;
  }[];
}

interface RewardNode {
  kind: 'reward';
  id: ChapterNodeId;
  policy: 'run_card_choice';
  nextNodeId: ChapterNodeId;
}

interface ChapterEndNode {
  kind: 'chapter_end';
  id: ChapterNodeId;
  grantId: GrantId;
}

type StoryCommand =
  | { kind: 'setFlag'; flagId: string };

interface StoryNode {
  kind: 'story';
  id: ChapterNodeId;
  backgroundId: string;
  speakerId: string;
  textKey: string;
  onEnter?: readonly StoryCommand[];
  exit: { kind: 'node'; targetNodeId: ChapterNodeId };
}

interface EncounterNode {
  kind: 'encounter';
  id: ChapterNodeId;
  encounterId: EncounterId;
  onVictory: { nextNodeId: ChapterNodeId; rewardId?: string };
  onDefeat: { nextNodeId?: ChapterNodeId; outcome: 'chapter_failed' | 'retry' };
}
```

关键约束：

- `nodes` 用稳定 ID 查找，不保存数组下标；每个出口都能被校验器解析。
- 序章现有 `beat-0001` 等 ID 全部保留。迁移适配器可按旧顺序生成节点出口，并将旧 `transition` 转为遭遇节点引用；不要要求手工改写数百条对白。
- 新篇章直接声明 `exit` 和选择结果，不依赖“当前数组下一项”推导分支。
- 序章通过适配器转换为章节节点时，所有旁白、对白和选项也必须映射到 `textKey`；保留旧 beat ID，并把旧 `transition` 映射为遭遇节点引用，不再保留内嵌文案兼容分支。
- 对话节点可重复进入时，入口动作必须幂等；永久好感/信物/货币变化只通过带唯一 ID 的 grant 发放，避免刷新或重选重复加成。
- 条件与效果使用有限的类型化联合，不在 JSON 中放可执行函数或脚本字符串。

事件/休息/路线节点可按第一篇实际需要增加为新的 `ChapterNode` 类型；不要在尚无实际内容时预先实现完整 DSL。普通线性对白仍保持轻量。

### 2.2 章节会话与状态生命周期

```ts
interface ChapterProgress {
  chapterId: ChapterId;
  flags: Record<string, true>;
  status: 'available' | 'in_progress' | 'complete' | 'failed';
  currentNodeId?: ChapterNodeId;
  variables: Record<string, boolean | number | string>;
}

interface ChapterSessionState {
  chapterId: ChapterId;
  currentNodeId: ChapterNodeId;
  flags: Record<string, true>;
  variables: Record<string, boolean | number | string>;
  status: 'in_progress';
}

interface SaveGameV1 {
  schemaVersion: 1;
  contentVersion: string;
  updatedAt: string;
  profile: ProfileState;
  campaign: CampaignState;
  activeSession: ActiveSessionSnapshot | null;
  settings: UserSettings;
  appliedGrantIds: string[];
}

interface ProfileState {
  currencies: { copper: number; soulFlame: number };
  ferrymen: { currentId: string; unlockedIds: string[] };
  mementoIds: string[];
  characterProgress: Record<string, CharacterProgress>;
}

interface CampaignState {
  chapters: Record<ChapterId, ChapterProgress>;
  activeChapterId?: ChapterId;
}

interface CharacterProgress {
  affinity: number;
  relationshipFlags: string[];
  unlockedTraitIds: string[];
  unlockedCardIds: string[];
  unlockedOutfitIds: string[];
  equippedOutfitId?: string;
}

interface ActiveSessionSnapshot {
  mode: 'chapter' | 'free_run';
  chapterId?: ChapterId;
  runState?: RunState;
  screen: 'story' | 'battle' | 'battle_result' | 'reward' | 'result' | 'keepsake';
  battle?: BattleSnapshot;
  appliedSessionEventIds: string[];
  battleResolution?: {
    id: string;
    encounterId: EncounterId;
    outcome: 'victory' | 'defeat';
  };
  offeredRewardIds?: string[];
  selectedRewardId?: string;
}

interface BattleSnapshot {
  snapshotVersion: 1;
  contentVersion: string;
  encounterId: EncounterId;
  state: BattleState;
  encounterConfig: BattleEncounterConfig;
  turnIndex: number;
  nextInstanceNumber: number;
}

interface UserSettings {
  language: string;
  reducedMotion: boolean;
  masterVolume: number;
}
```

状态归属：

- `ProfileState`：铜钱、魂火、摆渡人解锁与当前选择、已获得信物，以及以后的人物成长/装扮进度。
- `CampaignState`：章节可用/进行中/完成状态、当前章节节点、剧情 flags 和章节专属变量（例如序章孩子的执念值）；当前节点以稳定 ID 保存，不保存数组下标。
- `ActiveSessionSnapshot`：正在进行的章节或自由 Run，包括可选 Run 状态、当前流程屏、战斗、奖励选项/选择，以及会话内已应用事件 ID；完成或退出后为 `null`。剧情节点进度保存在 `CampaignState.chapters`，两者必须在同一根存档写入中保持一致。
- `BattleSnapshot` 是 JSON 可序列化的 DTO，完整保存 `BattleState`、遭遇 ID/配置、内容版本、随机状态、回合/Intent 序列游标和下一张实例编号等继续运行所需数据；不得包含类实例、函数或 DOM 引用。只有完整规则动作提交后的安全边界才写入快照；拖拽、待确认选牌、DOM 动画和 `busy` 等临时 UI 状态不保存。未提交的拖牌在退出时视为取消。
- 每次完整领域动作提交后立即把最新 Battle、Run 和当前流程阶段写入同一会话检查点；奖励选择/领取以及章节节点推进也各自原子写入。恢复时由 `Battle` 的恢复入口重建规则对象，`BattleView` 从现有状态渲染，不重播开场抽牌、不重置回合或牌堆。
- 遭遇结算使用稳定事件 ID，在同一次存档提交中更新 Run/章节进度并加入 `appliedSessionEventIds`；`battleResolution.id` 用于在胜负动画结束后恢复正确表现。恢复流程按事件 ID 检查结算，不重复结算或发奖。
- `BattleSnapshot.contentVersion` 与当前遭遇定义不兼容时，不得静默加载或覆盖快照；返回可诊断的恢复失败，并保留存档。具体兼容策略在将来内容版本变更时通过迁移显式定义。
- 弹窗、文字逐字动画、悬停、拖牌坐标等 UI 状态永不写入存档。

### 2.2.1 故事文本键约定

- 序章与第一篇所有剧情旁白、对白、选项提示和选项文字统一使用 `textKey`；Story Node 不允许内嵌 `text` 字符串或 inline/key 双格式。
- 现阶段只交付简体中文文本，不开展翻译。文本集中在 `src/data/locales/zh-CN.json`，章节数据只保存稳定键；由数据层文本目录解析键，不让章节运行时直接依赖 DOM 或浏览器语言 API。
- 序章沿用现有 `beat-xxxx` 节点 ID，并用 `prologue.<beat-id>` 作为文本键，例如 `prologue.beat-0001`。节点 ID 和文本键一旦发布，不因润色、排序或翻译改变；修改中文文案只改 locale 文件。
- 迁移前为旧序章 `{id, text}` 生成一次性校验清单（每条的 ID、顺序、字符数与文本哈希，不复制完整台词）；迁移后逐条核验文本、ID/顺序/背景/说话者/战斗转场/旗标完全不变，再删除旧数据中的重复文本源，避免新旧文案分叉。
- 缺失键属于内容错误：`validate:content` 必须在构建/测试中报告所属 chapter、node ID 和 textKey；不得静默显示空白或回退到另一份内嵌文案。文本解析器提供明确的缺失键诊断。

领域状态变化由纯规则函数返回新状态或明确结果；存档接口和 `localStorage` 只能在基础设施层访问。

### 2.3 章节奖励幂等

```ts
interface ProgressionGrant {
  id: GrantId;
  effects: readonly ProgressionEffect[];
}

type ProgressionEffect =
  | { kind: 'addCurrency'; currency: 'copper' | 'soulFlame'; amount: number }
  | { kind: 'unlockMemento'; mementoId: string }
  | { kind: 'setCampaignFlag'; flagId: string }
  | { kind: 'changeAffinity'; ferrymanId: string; amount: number };

interface ProgressionState {
  profile: ProfileState;
  campaign: CampaignState;
  appliedGrantIds: string[];
}

type GrantResult =
  | { status: 'applied'; state: ProgressionState }
  | { status: 'already_applied'; state: ProgressionState }
  | { status: 'invalid'; reason: string };

function applyGrant(state: ProgressionState, grant: ProgressionGrant): GrantResult;
```

`applyGrant` 先检查 `grant.id` 是否已在 `appliedGrantIds` 中；已应用则返回 `already_applied` 且不改档。首次应用时验证效果、更新领域状态并记录 grant ID，再由应用层将结果合并到根存档并一次性写回。领域代码不依赖 `SaveGameV1` 或存档适配器。

序章的“获取信物”仍是玩家确认领取的时点：点击前不得把序章完成/小木船信物写入已领取档案；点击后一次结算序章完成、信物获得和相关旗标。此规则由现有 E2E 保护。

跨系统奖励效果必须保持最小集合。人物好感、特性升级、永久卡牌、装扮等类型只有在产品规则确定且第一篇实际使用时才加入 `ProgressionEffect`。

## 3. 旧存档迁移方案

### 3.1 现有数据来源

当前旧存档键为 `night-ferry.prologue.v1`，包含：

- `prologue_complete`
- `wooden_boat_trace_unlocked`
- `currentFerrymanId`
- `unlockedFerrymen`
- `copper`
- `soulFlame`

当前旧键不含 `PrologueState` 的游玩中节点/flags、Run 或 Battle 快照，所以迁移只能保留已完成序章、信物、货币和人物解锁/选择；旧版中途剧情/战斗状态无法恢复。新版本开始写入后，后续章节和战斗按新快照恢复。

### 3.2 新存档目标映射

建议新键：`night-ferry.save`，由 payload 内的 `schemaVersion` 负责结构迁移。首版字段映射如下：

| 旧字段 | 新字段 | 迁移规则 |
|---|---|---|
| `copper` | `profile.currencies.copper` | 仅接受非负安全整数，否则使用 0 并产生迁移诊断。 |
| `soulFlame` | `profile.currencies.soulFlame` | 同上。 |
| `unlockedFerrymen` | `profile.ferrymen.unlockedIds` | 始终保留已解锁绯川；只迁移已知摆渡人 ID。 |
| `currentFerrymanId` | `profile.ferrymen.currentId` | 只有 ID 有效且已解锁才保留，否则回退绯川。 |
| `wooden_boat_trace_unlocked` | `profile.mementoIds` | 仅当序章完成且旧记录为 true 时加入小木船信物 ID。 |
| `prologue_complete` | `campaign.chapters.prologue.status` | true 映射为 `complete`，否则按旧默认值映射为 `available`。 |
| 旧键不存在 | 新存档默认值 | 新玩家从序章开始，默认仅绯川可用，货币为 0。 |
| 旧版无 Run/Battle 字段 | `activeSession` | 迁移为 `null`；不得伪造中途牌序或战斗状态。旧版也没有对白节点进度，因此只迁移完成状态，不推测中途序章位置。|

### 3.3 安全迁移步骤

1. 如果新键存在，先校验其 `schemaVersion` 和字段；有效则加载，不重复迁移。
2. 若新键不存在，读取并归一化旧键；旧键不存在时建立新玩家默认档。
3. 将迁移结果写入新键，再回读并重新校验；只有验证成功才宣布迁移完成。
4. 迁移成功后暂时保留旧键作为回滚证据；不得在本轮删除或覆盖旧键。
5. 新键损坏时不自动用默认值覆盖，也不删除旧键；返回可诊断的加载结果并保留恢复入口。
6. 浏览器禁用存储/容量不足时返回 `save_failed`，游戏可按设计使用内存状态继续，但 UI 不能静默显示“已保存”。

迁移函数必须纯化为“旧结构 → 新结构”的可测试逻辑；`localStorage` 的读取、写入、回读由可注入 Storage adapter 负责。迁移应可重复运行且结果一致。

## 4. 文件改动清单与实施顺序

### 阶段 A：先立接口和测试，不改表现

| 文件 | 计划动作 |
|---|---|
| `src/core/chapters/chapter-types.ts`（新增） | 定义章节、节点、遭遇、稳定文本键、结算 ID 和类型化出口；剧情节点只接受 `textKey`。 |
| `src/core/chapters/chapter-runtime.ts`（新增） | 实现节点进入、旗标应用、下一个节点解析和状态校验；不触碰 DOM。 |
| `src/core/progression/grants.ts`（新增） | 实现纯 grant 幂等应用和效果验证。 |
| `src/core/profile/profile-types.ts`、`src/core/campaign/campaign-types.ts`（新增） | 定义长期档案、章节状态和人物成长类型；不依赖浏览器存储。 |
| `src/infrastructure/save/save-schema.ts`、`src/infrastructure/save/migrations.ts`（新增） | 定义根存档校验、完整 Run/Battle 快照校验，以及旧 `prologue.v1` → 新 `save` 的纯迁移函数。 |
| `src/data/locales/zh-CN.json`、`src/data/locales/text-catalog.ts`（新增） | 集中保存简体中文故事文本并解析 `textKey`；键缺失由内容校验明确报错。 |
| `src/app/session/session-coordinator.ts`（新增） | 定义可测试的会话恢复/检查点用例与会话事件幂等处理；依赖存档接口，不直接访问浏览器存储。 |
| `package.json` | 增加 `validate:content` 脚本，先复用现有 Vitest 运行内容校验测试，不新增工具链依赖。 |
| `tests/chapter-runtime.test.ts`、`tests/progression-grants.test.ts`、`tests/save-migrations.test.ts`、`tests/battle-snapshot.test.ts`、`tests/text-catalog.test.ts`（新增） | 覆盖断链、重复奖励、旧档完整迁移、异常字段与重复迁移、战斗确定性恢复和文本键完整性。 |

阶段 A 的最小接口已实现。没有为尚未确定的情/生/岁/渡篇预建具体玩法系统。

### 阶段 B：接入存档，同时保留旧调用的兼容边界

| 文件 | 计划动作 |
|---|---|
| `src/infrastructure/save/local-save-repository.ts`（新增） | 实现读取、校验、写入、回读验证和迁移诊断；Storage 可注入。 |
| `src/core/prologue-state.ts` | 移除直接 `localStorage` 访问；保留纯序章规则。若需短期兼容，兼容函数放到适配层，不让 `core` 反向依赖浏览器。 |
| `src/core/battle.ts`、`src/ui/game-view.ts` | 增加 Battle 导出/恢复边界：恢复时载入完整规则状态与游标，不调用新战斗构造/开场抽牌/新回合逻辑；视图只渲染恢复后的状态。 |
| `src/ui/run-view.ts` | 保存并恢复当前流程阶段、Run 状态、Battle 快照、已生成奖励列表和当前奖励选择；领取奖励与下一阶段切换作为一次原子会话事件。 |
| `src/ui/game-flow.ts` | 通过应用层读取章节完成状态，不直接调用旧存档函数。 |
| `src/ui/hub-view.ts` | 通过档案用例读取/更换当前摆渡人，不把人物选择存进序章状态。 |
| `tests/prologue.test.ts`、`e2e/prologue.spec.ts` | 对照旧节点 ID、旁白、三场执念数值、战斗后奖励、跳过、魂光/信物时序和驿站进入；另验证序章每个旧 `{id,text}` 都迁移到唯一有效 `textKey` 且原文逐字一致。 |
| `e2e/session-resume.spec.ts`（新增） | 在序章故事、战斗中（包含手牌/牌堆/回合/资源/Intent 游标）、战后奖励选择阶段分别刷新浏览器，验证恢复后状态一致并能继续完成流程，且不会重复抽牌、发奖励或结算遭遇。 |

不改变主菜单、驿站或战斗布局；所有旧数据先映射，不删旧键，不清除玩家浏览器存档。

### 阶段 C：用序章验证章节契约，准备「世」篇复用

| 文件 | 计划动作 |
|---|---|
| `src/data/chapters/prologue.ts`、`src/data/chapters/prologue-story.ts`（若拆分） | 保留现有公开导出和 beat ID；把全部 `text` 原文逐字迁入 `zh-CN.json` 并改为 `textKey`；保持序列、说话者、背景、旗标和战斗转场完全不变。遭遇配置可在确有必要时拆至 `prologue-encounters.ts`。 |
| `src/data/chapters/chapter-catalog.ts`（新增） | 注册章节 ID 与已校验的定义；不让 `core` 按路径直接 import 某个 JSON。 |
| 第一篇内容数据 | 第一篇从新增之日起只使用 `textKey`；第一篇内容与序章共用同一文本目录及键校验规则。 |
| `src/ui/prologue-view.ts` | 只把节点推进、遭遇成功/失败出口、章节结算委托给共享 runtime/use case；每次完整节点推进后保存当前 node ID/flags/variables，恢复时从该节点继续；视觉、逐字显示、跳过确认、魂光和奖励动画保持原实现。 |
| `src/ui/game-flow.ts` / `src/app/chapter-flow.ts`（若实际需要再新增） | 统一章节→遭遇→奖励→章节节点的应用流程；避免每个新篇章另写一套控制器状态跳转。 |
| `tests/prologue.test.ts`、`e2e/prologue.spec.ts` | 对照旧节点 ID、旁白、三场执念数值、战斗后奖励、跳过、魂光/信物时序和驿站进入。 |

新章节应作为第二个章节定义接入同一运行时。序章视觉控制器暂时可以保留专属外观逻辑，但不得再拥有一套独立的奖励落档机制。

### 阶段 D：第一篇内容生产

在 A–C 的回归通过后，才开始新增「世」篇实际故事节点、路线和遭遇。第一篇特有的事件、休息或路线选择按内容需要逐一增加节点类型；每增加一个类型，先定义玩家可见行为、数据字段、状态出口和单测，再写大量内容。

## 5. 内容校验规则

新增 `npm run validate:content`（命令名可在实现前统一），至少校验：

- chapter/node/encounter/grant ID 唯一且格式合法。
- 序章与第一篇所有剧情文本引用均为 `textKey`；键必须存在且被正确引用，不允许重复键或残留 inline 故事文本。
- 序章迁移对照表覆盖每个旧 beat ID，文本逐字相同，节点顺序及所有流程元数据不变。
- `entryNodeId`、每个 `targetNodeId`、胜负出口和结算 grant 均存在。
- 从章节入口可达的节点存在闭合出口；不可达节点应报错或显式标记为草稿。
- encounter 的 soul、Intent、卡牌/浊念引用可以解析，数值处于合法范围。
- 效果类型、speaker、background、portrait、memento 和卡牌资源都能解析。
- 资源路径存在；缺失图片在开发期给出包含内容 ID 的错误，不只在浏览器里显示空白。
- 跳过剧情后的目标节点有效，章节完成奖励定义唯一且结算幂等。
- Battle 快照可通过 schema 校验，并且其 encounter ID/content version 与存档定义匹配；关键游标和所有牌实例 ID 均有效。

校验器只验证数据契约，不替编剧判断剧情质量，也不基于贪/嗔等主题自动解释人物动机。

## 6. 验收门槛

每个阶段都运行对应检查；阶段 C 完成前不得进入大量「世」篇内容生产：

1. `npm run build` 通过。
2. `npm test` 通过，原战斗、Run、序章测试保持通过。
3. `npm run validate:content` 对序章与第一篇数据通过；人为制造断链/缺失 textKey/资源时能失败并指出对应 ID。
4. 序章与第一篇文案迁移审计通过：旧序章每条文本逐字对应唯一键，节点 ID、顺序、说话者、背景与战斗转场一致。
5. `npx playwright test e2e/prologue.spec.ts --workers=1` 通过原完整序章流程，包括跳过、第二场战斗后续剧情、魂光/信物领取及进入驿站。
6. 战斗快照单测从非初始回合恢复后，用相同下一步操作与不中断控制组比较牌堆/手牌/资源/执念/Intent/随机游标/新牌 InstanceID，结果完全一致。
7. `npx playwright test e2e/session-resume.spec.ts --workers=1` 通过故事、第二场战斗中和战后选牌阶段的刷新恢复；继续流程不重复抽牌、遭遇结算或奖励发放。
8. 用一份真实旧 localStorage 数据迁移后，检查货币、人物解锁/选择、序章完成状态和小木船信物；重复刷新迁移不丢失、不重复发放。旧档无法恢复迁移前的战斗中途状态应明确显示为从遭遇入口重新开始。
9. 开发者调试 seed 仍可复现战斗和奖励；阶段 A–C 不改变战斗规则数值与手感。

## 7. 主要风险与控制

| 风险 | 控制办法 |
|---|---|
| 把通用章节运行时做成过度复杂的剧情语言 | v1 只实现实际需要的节点类型；保留显式类型，不加表达式解释器。 |
| 迁移丢失信物或人物选择 | 保留旧键、纯迁移测试、写后回读验证，并用真实旧档做一次人工验收。 |
| 为抽象而重写已稳定序章 | 保留 beat ID、文本与视图；只抽取状态推进和章节结算边界。 |
| UI 动画与规则流程再次耦合 | 战斗结果先成为确定的应用状态，再播放魂光/奖励表现；动画只呈现，不负责提交。 |
| 新内容需要的成长类型还未定 | 先留扩展位置；只实现第一篇实际使用并经剧情设计确认的成长效果。 |

## 8. 已确认的产品决策与评审边界

1. **中途退出恢复：完整恢复战斗。** 玩家重新打开时应保留当前手牌、各牌堆、资源、执念、回合、Intent 顺序、随机状态、Run 进度及奖励阶段；只丢弃尚未提交的拖牌/动画等瞬时 UI 操作。旧版存档没有这些快照，只能迁移长期档案并从安全入口继续，不能伪造旧战斗进度。
2. **文本：序章和第一篇都迁移为 `textKey`。** 简体中文原文集中管理；本轮不要求翻译。序章台词逐字搬迁并保留节点 ID 与顺序，第一篇从创作时即使用相同约定。

用户已确认两项产品决策，阶段 A→B→C 已按上述边界实施并逐段验证。目录整体重排、战斗规则变化和 UI 重做仍不在范围内。
