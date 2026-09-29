import type { CampaignState } from '../campaign/campaign-types';
import { getSoul } from '../content';
import type { ProfileState } from '../profile/profile-types';

export interface SoulArchiveDefinition {
  id: string;
  chapterId: string;
  chapterTitle: string;
  soulId: string;
  encounterFlag: string;
  releaseFlag: string;
  mementoId?: string;
  mementoName?: string;
  mementoArt?: string;
}

export type SoulArchiveStatus = 'unknown' | 'encountered' | 'released';

export interface SoulArchiveEntry extends SoulArchiveDefinition {
  status: SoulArchiveStatus;
  name: string;
  story: string;
  portrait: string | null;
}

// Add a definition when a chapter introduces a new soul; progress always comes from the save.
export const soulArchiveDefinitions: readonly SoulArchiveDefinition[] = [
  {
    id: 'prologue_child', chapterId: 'prologue', chapterTitle: '序｜初见', soulId: 'soul-000',
    encounterFlag: 'met_child', releaseFlag: 'child_released',
    mementoId: 'prologue_wooden_boat', mementoName: '小木船',
    mementoArt: 'assets/story/prologue/PR-P01.png',
  },
];

export function projectSoulArchive(profile: ProfileState, campaign: CampaignState): readonly SoulArchiveEntry[] {
  return soulArchiveDefinitions.map(definition => {
    const progress = campaign.chapters[definition.chapterId];
    const released = progress?.status === 'complete' || progress?.flags[definition.releaseFlag] === true
      || !!definition.mementoId && profile.mementoIds.includes(definition.mementoId);
    const encountered = released || progress?.flags[definition.encounterFlag] === true;
    const status: SoulArchiveStatus = released ? 'released' : encountered ? 'encountered' : 'unknown';
    const soul = getSoul(definition.soulId);
    return {
      ...definition, status,
      name: status === 'unknown' ? '未遇见的亡魂' : soul.Name,
      story: status === 'unknown' ? '' : soul.Story,
      portrait: status === 'unknown' ? null : status === 'released'
        ? soul.ReleasedArtReference ?? soul.ArtReference : soul.ArtReference,
    };
  });
}
