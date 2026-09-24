import { describe, expect, it } from 'vitest';
import { Battle } from '../src/core/battle';
import { completePrologue, createPrologueState, resolveChildRelease } from '../src/core/prologue-state';
import { prologueBattleEncounters, prologueBeats } from '../src/data/chapters/prologue';

describe('序章《初见》剧本与战斗配置', () => {
  it('包含旁白、角色对白、三场战斗节点和结尾信物段落', () => {
    expect(new Set(prologueBeats.map(beat => beat.id)).size).toBe(prologueBeats.length);
    expect(prologueBeats.some(beat => beat.speaker === 'narrator' && beat.text.includes('水声很近'))).toBe(true);
    expect(prologueBeats.filter(beat => beat.transition).map(beat => beat.transition)).toEqual(['battle1', 'battle2', 'finalBattle']);
    expect(prologueBeats.some(beat => beat.text === '以后的我啊。')).toBe(true);
    expect(prologueBeats.at(-1)).toMatchObject({ id: 'chapter-end', ending: true, text: '——序·初见，完。' });
  });

  it('三场战斗执念逐场提升，最终战保留1点供剧情完成渡魂', () => {
    expect([prologueBattleEncounters.battle1, prologueBattleEncounters.battle2, prologueBattleEncounters.finalBattle].map(encounter => encounter.StartingObsession)).toEqual([40, 50, 60]);
    expect([prologueBattleEncounters.battle1, prologueBattleEncounters.battle2, prologueBattleEncounters.finalBattle].map(encounter => encounter.VictoryObsession)).toEqual([0, 0, 1]);
  });

  it('信物托付前不能释放亡魂，释放后才能领取并保存章节完成状态', () => {
    const state = createPrologueState(prologueBeats[0].id);
    expect(resolveChildRelease(state)).toBe(false);
    state.storyFlags.boat_entrusted = true;
    expect(resolveChildRelease(state)).toBe(true);
    expect(state.childObsession).toBe(0);
    expect(completePrologue(state)).toBe(true);
    expect(state.storyFlags.wooden_boat_trace_unlocked).toBe(true);
  });

  it('第一场战斗按配置从40执念开始并降至0结束', () => {
    const deck = Array(12).fill('common_002');
    const battle = new Battle(17, 'prologue-r1', 'feichuan', deck, { ...prologueBattleEncounters.battle1, StartingObsession: 7 });
    expect(battle.state.Obsession).toBe(7);
    expect(battle.state.MaxObsession).toBe(7);
    const card = battle.state.Hand.find(item => item.DefinitionID === 'common_002')!;
    expect(battle.play(card.InstanceID).Ok).toBe(true);
    expect(battle.state.Status).toBe('won');
    expect(battle.state.Obsession).toBe(0);
  });
});
