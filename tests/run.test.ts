import { describe, expect, it } from 'vitest';
import { Battle } from '../src/core/battle';
import { battleSeed, claimReward, createRun, finishEncounter, generateRewards } from '../src/core/run';

describe('Phase 2C Run闭环', () => {
  it('初始化绯川Run并保留15张角色牌组', () => {
    const run = createRun('feichuan', 42);
    expect(run.Status).toBe('battle');
    expect(run.CurrentEncounter).toBe(1);
    expect(run.MaxEncounters).toBe(3);
    expect(run.RunDeck).toHaveLength(15);
    expect(run.RunDeck).toEqual(expect.arrayContaining(['feichuan_001', 'feichuan_002', 'feichuan_003']));
  });

  it('同一Run种子生成可复现的三张合法奖励', () => {
    const first = createRun('feichuan', 9), second = createRun('feichuan', 9);
    finishEncounter(first, 'won'); finishEncounter(second, 'won');
    const a = generateRewards(first), b = generateRewards(second);
    expect(a).toEqual(b);
    expect(a).toHaveLength(3);
    expect(new Set(a).size).toBe(3);
    expect(a.every(id => !id.startsWith('burden_'))).toBe(true);
  });

  it('点击奖励只在确认后加入RunDeck并进入下一场Battle', () => {
    const run = createRun('feichuan', 10);
    finishEncounter(run, 'won');
    const offered = generateRewards(run);
    const before = [...run.RunDeck];
    expect(run.RunDeck).toEqual(before);
    claimReward(run, offered[1], offered);
    expect(run.RunDeck).toEqual([...before, offered[1]]);
    expect(run.AcquiredCards).toEqual([offered[1]]);
    expect(run.CurrentEncounter).toBe(2);
    expect(run.Status).toBe('battle');
  });

  it('新增奖励进入下一场独立Battle，Battle临时状态全部重置', () => {
    const run = createRun('feichuan', 11);
    finishEncounter(run, 'won');
    const offered = generateRewards(run);
    claimReward(run, offered[0], offered);
    const battle = new Battle(battleSeed(run), 'run-test-2', run.SelectedCharacterID, run.RunDeck);
    const all = [...battle.state.Hand, ...battle.state.DrawPile];
    expect(all).toHaveLength(16);
    expect(all.filter(card => card.DefinitionID === offered[0]).length).toBe(run.RunDeck.filter(id => id === offered[0]).length);
    expect(battle.state.Turn).toBe(1);
    expect(battle.state.Light).toBe(3);
    expect(battle.state.PendingLightModifier).toBe(0);
    expect(battle.state.ExhaustPile).toEqual([]);
    expect(battle.state.CombatTraitDiscountActive).toBe(false);
  });

  it('三场成功完成Run，任一场失败立即终止Run', () => {
    const completed = createRun('feichuan', 12);
    for (let encounter = 1; encounter <= 3; encounter++) {
      finishEncounter(completed, 'won');
      if (encounter < 3) {
        const offered = generateRewards(completed);
        claimReward(completed, offered[0], offered);
      }
    }
    expect(completed.Status).toBe('completed');
    expect(completed.CompletedEncounters).toBe(3);
    expect(completed.AcquiredCards).toHaveLength(2);
    expect(completed.RunDeck).toHaveLength(17);

    const failed = createRun('feichuan', 13);
    finishEncounter(failed, 'won');
    const offered = generateRewards(failed);
    claimReward(failed, offered[0], offered);
    finishEncounter(failed, 'lost');
    expect(failed.Status).toBe('failed');
    expect(failed.CompletedEncounters).toBe(1);
  });

  it('拒绝在错误阶段或领取未提供的奖励', () => {
    const run = createRun('feichuan', 14);
    expect(() => generateRewards(run)).toThrow('奖励');
    finishEncounter(run, 'won');
    const offered = generateRewards(run);
    expect(() => claimReward(run, 'burden_001', offered)).toThrow('无效');
  });
});
