import { describe, expect, it } from 'vitest';
import { getCard, getSoul } from '../src/core/content';
import { encounterResultNodeId, nextChapterNodeId, validateChapterDefinition } from '../src/core/chapters/chapter-runtime';
import type { BattleEncounterConfig } from '../src/core/types';
import { Assets } from '../src/core/asset-manifest';
import { prologueBattleEncounters, prologueBeats, prologueChapter } from '../src/data/chapters/prologue';
import { manyiBeats, manyiChapter, manyiEncounters } from '../src/data/chapters/manyi';
import { getChapterDefinition, listChapterDefinitions } from '../src/data/chapters/chapter-catalog';
import { hasTextKey } from '../src/data/locales/text-catalog';
import manyiSource from '../docs/manyi-v1.1-source.md?raw';
import manyiTexts from '../src/data/locales/manyi-zh-CN.json';
import { manyiAssetManifest, manyiCharacterAssets, manyiStoryPortrait } from '../src/data/chapters/manyi-assets';
import importedManyiAssets from '../docs/manyi-asset-import.json';

describe('validate:content', () => {
  it('第一章17张正式素材全部有导入记录，人物与释然形态正确选择', () => {
    expect(manyiAssetManifest).toHaveLength(17);
    expect(new Set(manyiAssetManifest.map(item => item.path)).size).toBe(17);
    for (const asset of manyiAssetManifest) expect(importedManyiAssets.some(item => item.destination === asset.path)).toBe(true);
    expect(manyiStoryPortrait('chiying', 'battle1')).toBe(manyiCharacterAssets.chiying.normal);
    expect(manyiStoryPortrait('chiying', 'battle5')).toBe(manyiCharacterAssets.chiying.deepened);
    expect(manyiStoryPortrait('chiying', 'battle6')).toBe(manyiCharacterAssets.chiying.aberrant);
    expect(manyiStoryPortrait('chiying', 'battle6', true)).toBe(manyiCharacterAssets.chiying.released);
    expect(manyiStoryPortrait('chiying', 'ending')).toBe(manyiCharacterAssets.chiying.released);
    expect(manyiStoryPortrait('achou', 'battle2')).toBe(manyiCharacterAssets.achou);
    expect(manyiStoryPortrait('awei', 'battle2')).toBe(manyiCharacterAssets.awei);
    expect(manyiStoryPortrait('worker_voice', 'battle3')).toBeNull();
  });
  it('序章节点、文本、战斗引用和主要资源完整', () => {
    expect(getChapterDefinition('prologue')).toBe(prologueChapter);
    expect(listChapterDefinitions()).toEqual([prologueChapter, manyiChapter]);
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

  it('《满溢》的九场遭遇和全文文本均可从章节节点访问', () => {
    expect(validateChapterDefinition(manyiChapter)).toEqual([]);
    expect(Object.keys(manyiEncounters)).toHaveLength(9);
    expect(new Set(manyiBeats.map(beat => beat.id)).size).toBe(manyiBeats.length);
    for (const beat of manyiBeats) if (beat.kind === 'story') expect(hasTextKey(beat.textKey!)).toBe(true);
    for (const encounter of Object.values(manyiEncounters)) {
      expect(() => getSoul(encounter.battle.SoulID!)).not.toThrow();
      expect(encounter.battle.StartingObsession).toBeGreaterThan(0);
    }
  });

  it('批准剧本的全部对白原文均保留在 textKey 表中', () => {
    const source = manyiSource.split('## 7. 《满溢》V1.1完整剧情正文')[1]!.split('### 信物说明')[0]!;
    const actual = new Set(Object.values(manyiTexts));
    const dialogue = [...source.matchAll(/^\*\*(.+?)：\*\*\s*(.+)$/gm)];
    expect(dialogue.length).toBeGreaterThan(100);
    for (const line of dialogue) expect(actual.has(line[2]!.trim()), line[0]).toBe(true);
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
