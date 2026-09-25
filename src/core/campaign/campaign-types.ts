export interface ChapterProgress {
  chapterId: string;
  flags: Record<string, true>;
  status: 'available' | 'in_progress' | 'complete' | 'failed';
  currentNodeId?: string;
  variables: Record<string, boolean | number | string>;
}

export interface CampaignState {
  chapters: Record<string, ChapterProgress>;
  activeChapterId?: string;
}
