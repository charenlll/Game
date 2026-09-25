import { describe, expect, it } from 'vitest';
import { getCard, getSoul } from '../src/core/content';
import { encounterResultNodeId, nextChapterNodeId, validateChapterDefinition } from '../src/core/chapters/chapter-runtime';
import type { BattleEncounterConfig } from '../src/core/types';
import { Assets } from '../src/core/asset-manifest';
import { prologueBattleEncounters, prologueBeats, prologueChapter } from '../src/data/chapters/prologue';
import { getChapterDefinition, listChapterDefinitions } from '../src/data/chapters/chapter-catalog';
import { hasTextKey } from '../src/data/locales/text-catalog';

describe('validate:content', () => {
  it('序章节点、文本、战斗引用和主要资源完整', () => {
    expect(getChapterDefinition('prologue')).toBe(prologueChapter);
    expect(listChapterDefinitions()).toEqual([prologueChapter]);
    expect(() => getChapterDefinition('unknown')).toThrow('未注册的章节定义：unknown');
    expect(validateChapterDefinition(prologueChapter)).toEqual([]);
    expect(new Set(prologueBeats.map(beat => beat.id)).size).toBe(prologueBeats.length);
    for (const beat of prologueBeats) {
      if (beat.textKey) expect(hasTextKey(beat.textKey)).toBe(true);
      else expect(beat.transition).toBeDefined();
    }
    for (const config of Object.values(prologueBattleEncounters) as BattleEncounterConfig[]) {
      expect(() => getSoul(config.SoulID!)).not.toThrow();
      for (const intent of [...(config.IntentSequence ?? []), ...(config.IntentPool ?? [])]) {
        if (intent.BurdenCardID) expect(() => getCard(intent.BurdenCardID!)).not.toThrow();
      }
      expect(config.StartingObsession).toBeGreaterThan(0);
      expect(config.VictoryObsession).toBeLessThan(config.StartingObsession!);
    }
    for (const background of Object.values(Assets.prologue.backgrounds)) expect(background.startsWith('assets/')).toBe(true);
    expect(Assets.prologue.woodenBoat.startsWith('assets/')).toBe(true);
  });

  it('序章的遭遇结果通过节点图连接奖励和后续剧情', () => {
    const afterBattle1 = encounterResultNodeId(prologueChapter, 'transition-battle1', 'victory');
    expect(prologueChapter.nodes[afterBattle1!]?.kind).toBe('reward');
    const afterReward = nextChapterNodeId(prologueChapter, afterBattle1!);
    expect(prologueChapter.nodes[afterReward!]?.kind).toBe('story');
    const afterBattle2 = encounterResultNodeId(prologueChapter, 'transition-battle2', 'victory');
    expect(prologueChapter.nodes[afterBattle2!]?.kind).toBe('story');
  });
});
