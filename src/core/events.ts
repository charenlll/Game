import type { BattleEvent } from './types';

export class BattleEvents {
  private listeners = new Set<(event: BattleEvent) => void>();
  subscribe(listener: (event: BattleEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  emit(event: BattleEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
