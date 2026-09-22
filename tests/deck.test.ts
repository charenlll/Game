import { expect, it } from 'vitest';
import { Battle } from '../src/core/battle';
import { drawCards } from '../src/core/deck';

it('抽牌堆不足时洗入弃牌继续抽，但手牌硬上限为5张', () => {
  const b = new Battle(10); const s = b.state;
  s.DiscardPile.push(...s.Hand.splice(0), ...s.DrawPile.splice(0));
  s.DrawPile.push(s.DiscardPile.pop()!);
  expect(drawCards(s, 10)).toBe(5);
  expect(s.Hand).toHaveLength(5);
  expect(drawCards(s, 1)).toBe(0);
  expect([...s.Hand, ...s.DrawPile, ...s.DiscardPile]).toHaveLength(12);
});
