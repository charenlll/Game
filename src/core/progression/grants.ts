import type { CampaignState } from '../campaign/campaign-types';
import type { ProfileState } from '../profile/profile-types';

export interface ProgressionGrant {
  id: string;
  effects: readonly ProgressionEffect[];
}

export type ProgressionEffect =
  | { kind: 'addCurrency'; currency: 'copper' | 'soulFlame'; amount: number }
  | { kind: 'unlockMemento'; mementoId: string }
  | { kind: 'setCampaignFlag'; flagId: string; chapterId: string }
  | { kind: 'completeChapter'; chapterId: string }
  | { kind: 'changeAffinity'; ferrymanId: string; amount: number };

export interface ProgressionState {
  profile: ProfileState;
  campaign: CampaignState;
  appliedGrantIds: string[];
}

export type GrantResult =
  | { status: 'applied'; state: ProgressionState }
  | { status: 'already_applied'; state: ProgressionState }
  | { status: 'invalid'; reason: string };

export function applyGrant(state: ProgressionState, grant: ProgressionGrant): GrantResult {
  if (!grant.id.trim()) return { status: 'invalid', reason: 'Grant ID 不能为空。' };
  if (state.appliedGrantIds.includes(grant.id)) return { status: 'already_applied', state };
  for (const effect of grant.effects) {
    if (effect.kind === 'addCurrency' && (!Number.isSafeInteger(effect.amount) || effect.amount < 0)) return { status: 'invalid', reason: `Grant ${grant.id} 的货币数量无效。` };
    if (effect.kind === 'changeAffinity' && !Number.isFinite(effect.amount)) return { status: 'invalid', reason: `Grant ${grant.id} 的好感变化无效。` };
    if (effect.kind === 'unlockMemento' && !effect.mementoId.trim()) return { status: 'invalid', reason: `Grant ${grant.id} 的信物 ID 为空。` };
    if (effect.kind === 'setCampaignFlag' && (!effect.flagId.trim() || !effect.chapterId.trim() || !state.campaign.chapters[effect.chapterId])) return { status: 'invalid', reason: `Grant ${grant.id} 的章节旗标目标不存在。` };
    if (effect.kind === 'completeChapter' && (!effect.chapterId.trim() || !state.campaign.chapters[effect.chapterId])) return { status: 'invalid', reason: `Grant ${grant.id} 的章节完成目标不存在。` };
  }
  const next = structuredClone(state);
  for (const effect of grant.effects) {
    if (effect.kind === 'addCurrency') next.profile.currencies[effect.currency] += effect.amount;
    else if (effect.kind === 'unlockMemento' && !next.profile.mementoIds.includes(effect.mementoId)) next.profile.mementoIds.push(effect.mementoId);
    else if (effect.kind === 'setCampaignFlag') {
      next.campaign.chapters[effect.chapterId]!.flags[effect.flagId] = true;
    } else if (effect.kind === 'completeChapter') {
      next.campaign.chapters[effect.chapterId]!.status = 'complete';
    } else if (effect.kind === 'changeAffinity') {
      const progress = next.profile.characterProgress[effect.ferrymanId];
      if (progress) progress.affinity += effect.amount;
    }
  }
  next.appliedGrantIds.push(grant.id);
  return { status: 'applied', state: next };
}
