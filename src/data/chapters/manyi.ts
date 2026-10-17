import rawGroups from './manyi-beats.json';
import type { ChapterDefinition, ChapterNode, EncounterDefinition } from '../../core/chapters/chapter-types';
import type { BattleEncounterConfig, IntentInstance } from '../../core/types';

export type ManyiSceneId = 'ferry' | 'street' | 'ledger' | 'dock';
export type ManyiBeat = {
  id: string;
  kind: 'story' | 'encounter';
  textKey?: string;
  speakerId?: string;
  backgroundId: ManyiSceneId;
  encounterId?: string;
  afterBattle?: boolean;
  propId?: string;
  cast?: string;
};
export type ManyiGroupId = keyof typeof rawGroups;
export const manyiGroups = rawGroups as Record<ManyiGroupId, ManyiBeat[]>;
export const manyiBeats = Object.values(manyiGroups).flat();
export const manyiBeatById = new Map(manyiBeats.map(beat => [beat.id, beat]));

const intent = (IntentID: IntentInstance['IntentID'], BurdenCardID?: IntentInstance['BurdenCardID']): IntentInstance => ({ IntentID, ...(BurdenCardID ? { BurdenCardID } : {}) });
const encounter = (id: string, soul: string, obsession: number, backgroundId: ManyiSceneId, sequence: IntentInstance[], rounds = 6): EncounterDefinition => ({
  id, backgroundId, rewardPolicy: 'run_card_choice',
  battle: { SoulID: soul, StartingObsession: obsession, VictoryObsession: 0, MaxRounds: rounds, InitialDraw: 5, CardsPerTurn: 2, BaseLight: 4, IntentSequence: sequence, IntentPool: sequence },
});

export const manyiEncounters: Readonly<Record<string, EncounterDefinition>> = {
  'manyi-battle-1': encounter('manyi-battle-1', 'manyi-merchant', 32, 'street', [intent('intent_close'), intent('intent_hesitate')]),
  'manyi-battle-2': encounter('manyi-battle-2', 'manyi-ledger-merchant', 34, 'ledger', [intent('intent_account_inflation', 'burden_003'), intent('intent_close'), intent('intent_account_inflation', 'burden_003')]),
  'manyi-battle-3': encounter('manyi-battle-3', 'manyi-delivery-merchant', 36, 'dock', [intent('intent_dim_light'), intent('intent_hesitate'), intent('intent_close')]),
  'manyi-battle-4': encounter('manyi-battle-4', 'manyi-chiying-history', 38, 'dock', [intent('intent_close'), intent('intent_hesitation_spread', 'burden_001'), intent('intent_close')]),
  'manyi-battle-5': encounter('manyi-battle-5', 'manyi-chiying-voyage', 40, 'dock', [intent('intent_dim_light'), intent('intent_close'), intent('intent_hesitate')]),
  'manyi-battle-6': { ...encounter('manyi-battle-6', 'manyi-chiying-full', 45, 'dock', [intent('intent_close'), intent('intent_account_inflation', 'burden_003'), intent('intent_hesitation_spread', 'burden_001'), intent('intent_close')]), battle: { SoulID: 'manyi-chiying-full', StartingObsession: 45, VictoryObsession: 0, MaxRounds: 6, InitialDraw: 5, CardsPerTurn: 2, BaseLight: 4, PhaseThresholds: [30, 15], IntentSequence: [intent('intent_close'), intent('intent_account_inflation', 'burden_003'), intent('intent_hesitation_spread', 'burden_001'), intent('intent_close')], IntentPool: [intent('intent_account_inflation', 'burden_003'), intent('intent_close')] } },
  'manyi-optional-a': encounter('manyi-optional-a', 'manyi-merchant', 30, 'ledger', [intent('intent_hesitate'), intent('intent_close')]),
  'manyi-optional-b': encounter('manyi-optional-b', 'manyi-delivery-merchant', 30, 'dock', [intent('intent_dim_light'), intent('intent_close')]),
  'manyi-optional-c': encounter('manyi-optional-c', 'manyi-chiying-history', 32, 'ledger', [intent('intent_account_inflation', 'burden_003'), intent('intent_close')]),
};

export const manyiEncounterNames: Readonly<Record<string, string>> = {
  'manyi-battle-1': '有钱难花', 'manyi-battle-2': '越败越富', 'manyi-battle-3': '日落之铃',
  'manyi-battle-4': '归潮未归', 'manyi-battle-5': '最后一航', 'manyi-battle-6': '满溢',
  'manyi-optional-a': '未完货路', 'manyi-optional-b': '空泊之位', 'manyi-optional-c': '未结之账',
};

const order: readonly ManyiGroupId[] = ['opening', 'battle1', 'battle2', 'optionalA', 'battle3', 'optionalB', 'battle4', 'optionalC', 'battle5', 'battle6', 'ending', 'epilogue'];
const first = (group: ManyiGroupId): string => manyiGroups[group][0]!.id;
const nodes: Record<string, ChapterNode> = {};
const nextGroup: Partial<Record<ManyiGroupId, string>> = {
  opening: first('battle1'), battle1: first('battle2'), battle2: 'manyi-choice-a', optionalA: first('battle3'),
  battle3: 'manyi-choice-b', optionalB: first('battle4'), battle4: 'manyi-choice-c', optionalC: first('battle5'),
  battle5: first('battle6'), battle6: first('ending'), ending: first('epilogue'), epilogue: 'manyi-chapter-end',
};
for (const group of order) {
  const beats = manyiGroups[group];
  for (let index = 0; index < beats.length; index++) {
    const beat = beats[index]!;
    const next = beats[index + 1]?.id ?? nextGroup[group]!;
    if (beat.kind === 'story') nodes[beat.id] = { kind: 'story', id: beat.id, backgroundId: beat.backgroundId, speakerId: beat.speakerId!, textKey: beat.textKey!, ...(beat.speakerId === 'chiying' ? { onEnter: [{ kind: 'setFlag' as const, flagId: 'chiying_met' }] } : {}), exit: { kind: 'node', targetNodeId: next } };
    else {
      const rewardId = `reward-${beat.encounterId}`;
      nodes[beat.id] = { kind: 'encounter', id: beat.id, encounterId: beat.encounterId!, onVictory: { nextNodeId: rewardId }, onDefeat: { outcome: 'retry' } };
      nodes[rewardId] = { kind: 'reward', id: rewardId, policy: 'run_card_choice', nextNodeId: next };
    }
  }
}
for (const [letter, optional, next] of [['a', 'optionalA', 'battle3'], ['b', 'optionalB', 'battle4'], ['c', 'optionalC', 'battle5']] as const) {
  nodes[`manyi-choice-${letter}`] = {
    kind: 'choice', id: `manyi-choice-${letter}`, promptTextKey: `manyi.choice.${letter}`,
    options: [
      { id: 'enter', textKey: 'manyi.choice.enter', effects: [{ kind: 'setFlag', flagId: `optional-${letter}-entered` }], nextNodeId: first(optional) },
      { id: 'skip', textKey: 'manyi.choice.skip', effects: [{ kind: 'setFlag', flagId: `optional-${letter}-skipped` }], nextNodeId: first(next) },
    ],
  };
}
nodes['manyi-chapter-end'] = { kind: 'chapter_end', id: 'manyi-chapter-end', grantId: 'manyi-complete' };

export const manyiChapter: ChapterDefinition = {
  id: 'manyi', entryNodeId: first('opening'), nodes, encounters: manyiEncounters,
  grants: { 'manyi-complete': { id: 'manyi-complete', effects: [
    { kind: 'unlockMemento', mementoId: 'manyi_return_voucher' },
    { kind: 'setCampaignFlag', chapterId: 'manyi', flagId: 'manyi_complete' },
    { kind: 'completeChapter', chapterId: 'manyi' },
  ] } },
};

export const manyiBattleConfigs: Readonly<Record<string, BattleEncounterConfig>> = Object.fromEntries(Object.values(manyiEncounters).map(item => [item.id, item.battle]));
