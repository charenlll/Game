import { describe, expect, it } from 'vitest';
import { SessionCoordinator } from '../src/app/session/session-coordinator';
import { Battle } from '../src/core/battle';
import { createRun } from '../src/core/run';
import { LocalSaveRepository, type StoragePort } from '../src/infrastructure/save/local-save-repository';
import { CONTENT_VERSION } from '../src/data/content-version';

class MemoryStorage implements StoragePort {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

describe('牌录发现记录', () => {
  it('把对局牌组和战斗中出现的浊念持久记录，并在返回后保留', () => {
    const repository = new LocalSaveRepository(new MemoryStorage());
    const sessions = SessionCoordinator.open(repository);
    const runState = createRun('feichuan', 42);
    const encounterId = 'catalog-test';
    const battle = new Battle(42, encounterId, 'feichuan', runState.RunDeck);
    battle.state.Hand.push({ InstanceID: 'catalog-burden', DefinitionID: 'burden_001', IsTemporary: false, CostModifiers: [] });
    const snapshot = battle.createSnapshot();
    expect(sessions.checkpoint({
      mode: 'free_run', runState, screen: 'battle', encounterId, appliedSessionEventIds: [],
      battle: { snapshotVersion: 1, contentVersion: CONTENT_VERSION, encounterId, ...snapshot },
    })).toBe(true);
    expect(sessions.discoveredCardIds()).toContain('common_001');
    expect(sessions.discoveredCardIds()).toContain('feichuan_001');
    expect(sessions.discoveredCardIds()).toContain('burden_001');
    sessions.clearSession();
    expect(SessionCoordinator.open(repository).discoveredCardIds()).toContain('burden_001');
  });
});
