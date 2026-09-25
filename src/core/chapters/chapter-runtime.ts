import type { ChapterDefinition, ChapterNode, ChapterSessionState, StoryCommand } from './chapter-types';

export type ChapterValidationIssue = { code: string; nodeId?: string; message: string };

export function validateChapterDefinition(chapter: ChapterDefinition): ChapterValidationIssue[] {
  const issues: ChapterValidationIssue[] = [];
  const ids = Object.keys(chapter.nodes);
  if (!chapter.id.trim()) issues.push({ code: 'chapter.id.empty', message: '章节 ID 不能为空。' });
  if (!chapter.nodes[chapter.entryNodeId]) issues.push({ code: 'chapter.entry.missing', message: `入口节点不存在：${chapter.entryNodeId}` });
  const addTarget = (sourceId: string, targetId: string): void => {
    if (!chapter.nodes[targetId]) issues.push({ code: 'chapter.target.missing', nodeId: sourceId, message: `目标节点不存在：${targetId}` });
  };
  for (const id of ids) {
    const node = chapter.nodes[id]!;
    if (id !== node.id) issues.push({ code: 'chapter.node.key_mismatch', nodeId: id, message: `节点键和节点 ID 不一致：${node.id}` });
    if (node.kind === 'story') {
      if (!node.textKey.trim()) issues.push({ code: 'chapter.text_key.empty', nodeId: id, message: '对白节点缺少 textKey。' });
      addTarget(id, node.exit.targetNodeId);
    } else if (node.kind === 'choice') {
      if (!node.promptTextKey.trim()) issues.push({ code: 'chapter.prompt_key.empty', nodeId: id, message: '选项节点缺少 promptTextKey。' });
      for (const option of node.options) {
        if (!option.textKey.trim()) issues.push({ code: 'chapter.option_key.empty', nodeId: id, message: `选项 ${option.id} 缺少 textKey。` });
        addTarget(id, option.nextNodeId);
      }
    } else if (node.kind === 'encounter') {
      if (!chapter.encounters[node.encounterId]) issues.push({ code: 'chapter.encounter.missing', nodeId: id, message: `遭遇定义不存在：${node.encounterId}` });
      addTarget(id, node.onVictory.nextNodeId);
      if (node.onDefeat.nextNodeId) addTarget(id, node.onDefeat.nextNodeId);
    } else if (node.kind === 'reward') addTarget(id, node.nextNodeId);
    else if (!chapter.grants[node.grantId]) issues.push({ code: 'chapter.grant.missing', nodeId: id, message: `章节奖励不存在：${node.grantId}` });
  }
  const reachable = new Set<string>();
  const visit = (id: string): void => {
    if (reachable.has(id)) return;
    const node = chapter.nodes[id];
    if (!node) return;
    reachable.add(id);
    for (const target of nodeTargets(node)) visit(target);
  };
  visit(chapter.entryNodeId);
  for (const id of ids) if (!reachable.has(id)) issues.push({ code: 'chapter.node.unreachable', nodeId: id, message: '节点无法从章节入口到达。' });
  return issues;
}

function nodeTargets(node: ChapterNode): string[] {
  if (node.kind === 'story') return [node.exit.targetNodeId];
  if (node.kind === 'choice') return node.options.map(option => option.nextNodeId);
  if (node.kind === 'encounter') return [node.onVictory.nextNodeId, ...(node.onDefeat.nextNodeId ? [node.onDefeat.nextNodeId] : [])];
  if (node.kind === 'reward') return [node.nextNodeId];
  return [];
}

export function enterCommands(state: ChapterSessionState, commands: readonly StoryCommand[] = []): ChapterSessionState {
  const next = structuredClone(state);
  for (const command of commands) if (command.kind === 'setFlag') next.flags[command.flagId] = true;
  return next;
}

export function startChapter(chapter: ChapterDefinition): ChapterSessionState {
  return { chapterId: chapter.id, currentNodeId: chapter.entryNodeId, flags: {}, variables: {}, status: 'in_progress' };
}

export function nextChapterNodeId(chapter: ChapterDefinition, nodeId: string): string | null {
  const node = chapter.nodes[nodeId];
  if (!node) return null;
  if (node.kind === 'story') return node.exit.targetNodeId;
  if (node.kind === 'reward') return node.nextNodeId;
  return null;
}

export function encounterResultNodeId(chapter: ChapterDefinition, nodeId: string, outcome: 'victory' | 'defeat'): string | null {
  const node = chapter.nodes[nodeId];
  if (!node || node.kind !== 'encounter') return null;
  return outcome === 'victory' ? node.onVictory.nextNodeId : node.onDefeat.nextNodeId ?? null;
}
