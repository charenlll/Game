import { Assets } from '../core/asset-manifest';
import type { PrologueFlag } from '../core/prologue-state';
import { assetURL } from './card-view';

interface FerryTraceDefinition {
  id: string;
  asset: string;
  unlockFlag: PrologueFlag;
  className: string;
  label: string;
}

const traces: readonly FerryTraceDefinition[] = [
  { id: 'prologue-wooden-boat', asset: Assets.prologue.woodenBoat, unlockFlag: 'wooden_boat_trace_unlocked', className: 'trace-wooden-boat', label: '留在渡口的小木船' },
];

export function renderFerryTraceLayer(flags: Partial<Record<PrologueFlag, boolean>>): string {
  const visible = traces.filter(trace => flags[trace.unlockFlag]);
  if (!visible.length) return '';
  return `<div class="ferry-trace-layer" aria-label="渡口留下的物件">${visible.map(trace => `<img class="ferry-trace ${trace.className}" data-trace-id="${trace.id}" src="${assetURL(trace.asset)}" alt="${trace.label}" draggable="false">`).join('')}</div>`;
}
