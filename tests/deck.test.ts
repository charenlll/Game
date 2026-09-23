import { expect, it } from 'vitest';
import { Battle } from '../src/core/battle';
import { drawCards } from '../src/core/deck';

it('抽牌堆不足时洗入弃牌继续抽，抽牌不受5张回合保留上限限制', () => {
  const b = new Battle(10); const s = b.state;
  s.DiscardPile.push(...s.Hand.splice(0), ...s.DrawPile.splice(0));
  s.DrawPile.push(s.DiscardPile.pop()!);
  expect(drawCards(s, 10)).toBe(10);
  expect(s.Hand).toHaveLength(10);
  expect(drawCards(s, 1)).toBe(1);
  expect([...s.Hand, ...s.DrawPile, ...s.DiscardPile]).toHaveLength(15);
});
