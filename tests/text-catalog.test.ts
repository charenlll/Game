import { describe, expect, it } from 'vitest';
import manifest from './fixtures/prologue-text-migration-manifest.json';
import contract from './fixtures/prologue-beat-contract.json';
import { prologueBeats } from '../src/data/chapters/prologue';
import { getTextCatalog, hasTextKey, textForKey } from '../src/data/locales/text-catalog';

describe('序章 textKey 迁移', () => {
  it('旧对白逐条、逐字迁移，节点 ID 与顺序保持一致', async () => {
    const keyedBeats = prologueBeats.filter(beat => beat.textKey);
    expect(keyedBeats).toHaveLength(manifest.entries.length);
    expect(Object.keys(getTextCatalog())).toHaveLength(manifest.entries.length);
    for (let index = 0; index < manifest.entries.length; index++) {
      const expected = manifest.entries[index]!;
      const beat = keyedBeats[index]!;
      expect(beat.id).toBe(expected.id);
      expect(beat.textKey).toBe(expected.textKey);
      expect(hasTextKey(expected.textKey)).toBe(true);
      const text = textForKey(expected.textKey);
      expect(Array.from(text)).toHaveLength(expected.codePointLength);
      await expect(sha256(text)).resolves.toBe(expected.sha256);
    }
  });

  it('全部 687 个 beat 保留原顺序、背景、说话者、道具与转场语义', () => {
    const actual = prologueBeats.map(({ id, background, speaker, textKey, setFlags, prop, transition, ending }) => ({
      id, background, speaker,
      ...(transition ? { transition } : {}), ...(ending ? { ending: true } : {}),
      ...(prop ? { prop } : {}), ...(setFlags?.length ? { setFlags } : {}), ...(textKey ? { textKey } : {}),
    }));
    expect(actual).toEqual(contract.beats);
  });

  it('文本键不存在时给出内容 ID 诊断，不返回空文本', () => {
    expect(() => textForKey('prologue.missing')).toThrow('缺少剧情文本：zh-CN:prologue.missing');
  });
});

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
