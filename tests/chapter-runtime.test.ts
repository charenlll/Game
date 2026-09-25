import { describe, expect, it } from 'vitest';
import { validateChapterDefinition } from '../src/core/chapters/chapter-runtime';
import { prologueChapter } from '../src/data/chapters/prologue';

describe('章节运行时契约', () => {
  it('序章定义的节点、出口、遭遇和结算引用全部闭合', () => {
    expect(validateChapterDefinition(prologueChapter)).toEqual([]);
  });

  it('报告无效目标节点和未注册遭遇', () => {
    const broken = structuredClone(prologueChapter);
    const first = broken.nodes[broken.entryNodeId]!;
    if (first.kind !== 'story') throw new Error('序章入口应为对白节点');
    const nodes = { ...broken.nodes, [first.id]: { ...first, exit: { kind: 'node' as const, targetNodeId: 'missing-node' } } };
    const brokenDefinition = { ...broken, nodes };
    const issues = validateChapterDefinition(brokenDefinition);
    expect(issues.some(issue => issue.code === 'chapter.target.missing' && issue.nodeId === first.id)).toBe(true);
  });
});
