import { describe, expect, it } from 'vitest';
import { applyGrant, type ProgressionState } from '../src/core/progression/grants';

const initial: ProgressionState = {
  profile: {
    currencies: { copper: 0, soulFlame: 0 },
    ferrymen: { currentId: 'feichuan', unlockedIds: ['feichuan'] },
    mementoIds: [], characterProgress: {},
  },
  campaign: { chapters: { prologue: { chapterId: 'prologue', flags: {}, variables: {}, status: 'in_progress' } } },
  appliedGrantIds: [],
};

describe('章节奖励幂等结算', () => {
  it('应用同一 grant 两次不会重复发信物或货币', () => {
    const grant = { id: 'prologue-reward', effects: [
      { kind: 'addCurrency' as const, currency: 'copper' as const, amount: 8 },
      { kind: 'unlockMemento' as const, mementoId: 'prologue_wooden_boat' },
      { kind: 'setCampaignFlag' as const, chapterId: 'prologue', flagId: 'prologue_complete' },
      { kind: 'completeChapter' as const, chapterId: 'prologue' },
    ] };
    const first = applyGrant(initial, grant);
    expect(first.status).toBe('applied');
    if (first.status !== 'applied') return;
    const second = applyGrant(first.state, grant);
    expect(second.status).toBe('already_applied');
    expect(first.state.profile.currencies.copper).toBe(8);
    expect(first.state.profile.mementoIds).toEqual(['prologue_wooden_boat']);
    expect(first.state.campaign.chapters.prologue?.status).toBe('complete');
    expect(first.state.campaign.chapters.prologue?.flags.prologue_complete).toBe(true);
    expect(first.state.appliedGrantIds).toEqual(['prologue-reward']);
  });

  it('无效效果不会部分修改状态', () => {
    const result = applyGrant(initial, { id: 'bad', effects: [
      { kind: 'addCurrency', currency: 'copper', amount: 5 },
      { kind: 'addCurrency', currency: 'soulFlame', amount: -1 },
    ] });
    expect(result.status).toBe('invalid');
    expect(initial.profile.currencies).toEqual({ copper: 0, soulFlame: 0 });
  });
});
