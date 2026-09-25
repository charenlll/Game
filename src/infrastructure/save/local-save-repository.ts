import { createDefaultSaveGame, isSaveGameV1, LEGACY_PROLOGUE_KEY, migrateLegacyPrologueSave, SAVE_KEY, type SaveGameV1 } from './save-schema';

export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type SaveLoadResult =
  | { status: 'ready'; save: SaveGameV1; source: 'current' | 'legacy' | 'new'; persisted: boolean; diagnostic?: string }
  | { status: 'corrupt'; save: null; diagnostic: string };

export type SaveWriteResult = { ok: true } | { ok: false; diagnostic: string };

export class LocalSaveRepository {
  constructor(private readonly storage: StoragePort, private readonly now: () => string = () => new Date().toISOString()) {}

  load(): SaveLoadResult {
    let current: string | null;
    try { current = this.storage.getItem(SAVE_KEY); }
    catch (error) { return { status: 'corrupt', save: null, diagnostic: `读取存档失败：${messageOf(error)}` }; }
    if (current !== null) {
      try {
        const parsed: unknown = JSON.parse(current);
        if (!isSaveGameV1(parsed)) return { status: 'corrupt', save: null, diagnostic: '新存档结构无效。原始存档已保留，没有覆盖。' };
        return { status: 'ready', save: parsed, source: 'current', persisted: true };
      } catch (error) {
        return { status: 'corrupt', save: null, diagnostic: `新存档无法解析：${messageOf(error)}。原始存档已保留，没有覆盖。` };
      }
    }

    let legacy: string | null;
    try { legacy = this.storage.getItem(LEGACY_PROLOGUE_KEY); }
    catch (error) { return { status: 'corrupt', save: null, diagnostic: `读取旧存档失败：${messageOf(error)}` }; }
    if (legacy !== null) {
      try {
        const save = migrateLegacyPrologueSave(JSON.parse(legacy), this.now());
        const write = this.write(save);
        return { status: 'ready', save, source: 'legacy', persisted: write.ok, ...(write.ok ? {} : { diagnostic: write.diagnostic }) };
      } catch (error) {
        return { status: 'corrupt', save: null, diagnostic: `旧存档无法迁移：${messageOf(error)}。原始存档已保留。` };
      }
    }

    const save = createDefaultSaveGame(this.now());
    const write = this.write(save);
    return { status: 'ready', save, source: 'new', persisted: write.ok, ...(write.ok ? {} : { diagnostic: write.diagnostic }) };
  }

  write(save: SaveGameV1): SaveWriteResult {
    if (!isSaveGameV1(save)) return { ok: false, diagnostic: '存档未通过结构校验，没有写入。' };
    try {
      this.storage.setItem(SAVE_KEY, JSON.stringify(save));
      const written = this.storage.getItem(SAVE_KEY);
      if (written === null || JSON.stringify(JSON.parse(written)) !== JSON.stringify(save)) return { ok: false, diagnostic: '存档写入后回读不一致。' };
      return { ok: true };
    } catch (error) {
      return { ok: false, diagnostic: `写入存档失败：${messageOf(error)}` };
    }
  }
}

export function createBrowserSaveRepository(): LocalSaveRepository {
  return new LocalSaveRepository(window.localStorage);
}

function messageOf(error: unknown): string { return error instanceof Error ? error.message : String(error); }
