import { describe, expect, it } from 'vitest';
import { projectSoulArchive } from '../src/core/archive/soul-archive';
import { createDefaultSaveGame } from '../src/infrastructure/save/save-schema';

describe('亡魂档案状态', () => {
  it('只按真实章节进度显示未遇见、已遇见和已渡魂', () => {
    const save = createDefaultSaveGame();
    expect(projectSoulArchive(save.profile, save.campaign)[0]?.status).toBe('unknown');
    expect(projectSoulArchive(save.profile, save.campaign)[0]?.portrait).toBeNull();

    save.campaign.chapters.prologue!.flags.met_child = true;
    const encountered = projectSoulArchive(save.profile, save.campaign)[0]!;
    expect(encountered.status).toBe('encountered');
    expect(encountered.name).toBe('无名孩子');

    save.campaign.chapters.prologue!.status = 'complete';
    const released = projectSoulArchive(save.profile, save.campaign)[0]!;
    expect(released.status).toBe('released');
    expect(released.portrait).toContain('GH-P03.png');
  });

  it('旧版完成存档的信物足以还原已渡魂，不编造对局次数', () => {
    const save = createDefaultSaveGame();
    save.profile.mementoIds.push('prologue_wooden_boat');
    expect(projectSoulArchive(save.profile, save.campaign)[0]?.status).toBe('released');
  });
});
