import { describe, expect, it } from 'vitest';
import { LocalSaveRepository, type StoragePort } from '../src/infrastructure/save/local-save-repository';
import { LEGACY_PROLOGUE_KEY, SAVE_KEY, createDefaultSaveGame, isSaveGameV1 } from '../src/infrastructure/save/save-schema';
import { createRun } from '../src/core/run';
import { SessionCoordinator } from '../src/app/session/session-coordinator';
import { manyiChapter } from '../src/data/chapters/manyi';

class MemoryStorage implements StoragePort {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

describe('统一存档迁移', () => {
  it('重玩已通关章节后仍标记完成，信物和永久结算不重复', () => {
    const sessions = SessionCoordinator.open(new LocalSaveRepository(new MemoryStorage()));
    const grant = manyiChapter.grants['manyi-complete']!;
    expect(sessions.completeChapter(grant)).toBe(true);
    expect(sessions.checkpoint({ mode: 'chapter', chapterId: 'manyi', runState: createRun('feichuan', 11), screen: 'story', appliedSessionEventIds: [] }, {
      chapterId: 'manyi', currentNodeId: manyiChapter.entryNodeId, flags: {}, variables: {}, status: 'in_progress',
    })).toBe(true);
    expect(sessions.completeChapter(grant)).toBe(true);
    const save = sessions.snapshot;
    expect(save.campaign.chapters.manyi?.status).toBe('complete');
    expect(save.profile.mementoIds.filter(id => id === 'manyi_return_voucher')).toHaveLength(1);
    expect(save.appliedGrantIds.filter(id => id === 'manyi-complete')).toHaveLength(1);
    expect(save.activeSession).toBeNull();
  });
  it('迁移旧序章数据，保留旧键且重复加载不重复迁移', () => {
    const storage = new MemoryStorage();
    const legacy = JSON.stringify({
      prologue_complete: true, wooden_boat_trace_unlocked: true,
      currentFerrymanId: 'moyu', unlockedFerrymen: { feichuan: true, moyu: true }, copper: 25, soulFlame: 4,
    });
    storage.setItem(LEGACY_PROLOGUE_KEY, legacy);
    const repository = new LocalSaveRepository(storage, () => '2026-09-25T00:00:00.000Z');
    const first = repository.load();
    expect(first.status).toBe('ready');
    if (first.status !== 'ready') return;
    expect(first.source).toBe('legacy');
    expect(first.save.profile.currencies).toEqual({ copper: 25, soulFlame: 4 });
    expect(first.save.profile.ferrymen).toEqual({ currentId: 'moyu', unlockedIds: ['feichuan', 'moyu'] });
    expect(first.save.profile.mementoIds).toEqual(['prologue_wooden_boat']);
    expect(first.save.campaign.chapters.prologue.status).toBe('complete');
    expect(storage.getItem(LEGACY_PROLOGUE_KEY)).toBe(legacy);
    const second = repository.load();
    expect(second.status).toBe('ready');
    if (second.status === 'ready') expect(second.source).toBe('current');
    expect(isSaveGameV1(JSON.parse(storage.getItem(SAVE_KEY)!))).toBe(true);
  });

  it('旧版中途无快照，不伪造进行中的 Run 或战斗', () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_PROLOGUE_KEY, JSON.stringify({ prologue_complete: false, copper: -8 }));
    const result = new LocalSaveRepository(storage).load();
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.save.activeSession).toBeNull();
    expect(result.save.campaign.chapters.prologue.status).toBe('available');
    expect(result.save.profile.currencies.copper).toBe(0);
  });

  it('损坏的新档保留原数据且不会被默认档覆盖', () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, '{broken');
    const result = new LocalSaveRepository(storage).load();
    expect(result.status).toBe('corrupt');
    expect(storage.getItem(SAVE_KEY)).toBe('{broken');
  });

  it('旧版进行中的牌组不被编辑规则重写，迁移重复读取保持幂等', () => {
    const storage = new MemoryStorage();
    const original = createDefaultSaveGame();
    delete original.profile.unlockedCardIds;
    delete original.profile.startingDecks;
    const run = createRun('feichuan', 77);
    expect(run.RunDeck).toHaveLength(15);
    original.activeSession = { mode: 'free_run', runState: run, screen: 'result', appliedSessionEventIds: [] };
    storage.setItem(SAVE_KEY, JSON.stringify(original));
    const repository = new LocalSaveRepository(storage);
    const first = repository.load();
    expect(first.status).toBe('ready');
    if (first.status !== 'ready') return;
    expect(first.save.activeSession?.runState?.RunDeck).toEqual(run.RunDeck);
    expect(first.save.profile.startingDecks?.feichuan).toHaveLength(12);
    expect(first.save.profile.unlockedCardIds).not.toContain('common_007');
    const serialized = storage.getItem(SAVE_KEY);
    const second = repository.load();
    expect(second.status).toBe('ready');
    expect(storage.getItem(SAVE_KEY)).toBe(serialized);
  });
});
