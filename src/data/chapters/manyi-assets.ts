import { Assets } from '../../core/asset-manifest';
import type { ManyiSceneId } from './manyi';

export const manyiSceneAssets: Readonly<Record<ManyiSceneId, string>> = {
  ferry: Assets.prologue.backgrounds.ferry,
  street: 'assets/backgrounds/manyi/SC01.png',
  ledger: 'assets/backgrounds/manyi/SC02.png',
  dock: 'assets/backgrounds/manyi/SC03.png',
};
export const manyiCharacterAssets = Object.freeze({
  chiying: Object.freeze({
    normal: 'assets/characters/manyi/CH1-01.png',
    deepened: 'assets/characters/manyi/CH1-02.png',
    aberrant: 'assets/characters/manyi/CH1-03.png',
    released: 'assets/characters/manyi/CH1-06.png',
  }),
  achou: 'assets/characters/manyi/CH1-04.png',
  awei: 'assets/characters/manyi/CH1-05.png',
});
export const manyiVoucherArt = 'assets/story/manyi/PR1-03.png';
export const manyiBossPhaseArts = [manyiCharacterAssets.chiying.normal, manyiCharacterAssets.chiying.deepened, manyiCharacterAssets.chiying.aberrant] as const;

export function manyiStoryPortrait(speaker: string, groupId: string, afterBattle = false): string | null {
  if (speaker === 'achou') return manyiCharacterAssets.achou;
  if (speaker === 'awei') return manyiCharacterAssets.awei;
  if (speaker === 'other_merchant') return 'assets/souls/manyi/EN1-01.png';
  if (speaker !== 'chiying') return null;
  if (groupId === 'ending' || groupId === 'epilogue' || groupId === 'battle6' && afterBattle) return manyiCharacterAssets.chiying.released;
  if (groupId === 'battle6') return manyiCharacterAssets.chiying.aberrant;
  if (['battle4', 'battle5', 'optionalC'].includes(groupId)) return manyiCharacterAssets.chiying.deepened;
  return manyiCharacterAssets.chiying.normal;
}

/** Native dimensions of imported files; logical UI sizes are independent. */
export const manyiAssetManifest = [
  ...(['street', 'ledger', 'dock'] as const).map((scene, i) => ({
    id: `SC0${i + 1}`, path: manyiSceneAssets[scene], width: 1672, height: 941, alpha: false,
  })),
  ...[
    manyiCharacterAssets.chiying.normal, manyiCharacterAssets.chiying.deepened,
    manyiCharacterAssets.chiying.aberrant, manyiCharacterAssets.achou,
    manyiCharacterAssets.awei, manyiCharacterAssets.chiying.released,
  ].map((path, i) => ({ id: `CH1-0${i + 1}`, path, width: 1024, height: 1536, alpha: true })),
  ...[1, 2, 3].map(i => ({ id: `EN1-0${i}`, path: `assets/souls/manyi/EN1-0${i}.png`, width: 1024, height: 1536, alpha: true })),
  { id: 'PR1-03', path: manyiVoucherArt, width: 1561, height: 1008, alpha: true },
  ...[
    ['CA07', 'common'], ['CA08', 'common'], ['FC04', 'feichuan'], ['ZN03', 'burden'],
  ].map(([id, folder]) => ({ id: id!, path: `assets/cards/${folder}/${id}.png`, width: 1122, height: 1402, alpha: false })),
] as const;
