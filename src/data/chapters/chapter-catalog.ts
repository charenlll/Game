import type { ChapterDefinition } from '../../core/chapters/chapter-types';
import { prologueChapter } from './prologue';
import { manyiChapter } from './manyi';

const chapters = Object.freeze({
  prologue: prologueChapter,
  manyi: manyiChapter,
} satisfies Readonly<Record<string, ChapterDefinition>>);

export function getChapterDefinition(chapterId: string): ChapterDefinition {
  const chapter = chapters[chapterId as keyof typeof chapters];
  if (!chapter) throw new Error(`未注册的章节定义：${chapterId}`);
  return chapter;
}

export function listChapterDefinitions(): readonly ChapterDefinition[] {
  return Object.values(chapters);
}
