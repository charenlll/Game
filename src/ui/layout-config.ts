export const HandLayout = Object.freeze({ pageSize: 5, cardScale: 1, spacingVw: 9, maxSpreadVw: 40, centerPercent: 50, arcPx: 0, hoverOffsetPx: 18 });
export const DragConfig = Object.freeze({
  thresholdPx: 7, dragScale: 1.07,
  playZone: { topRatio: 0.08, bottomRatio: 0.58, leftRatio: 0.16, rightRatio: 0.84 },
  resolveDurationMs: 900,
});
export const BattleLayout = Object.freeze({
  ferrymanAnchor: { rightPercent: -8, bottomPercent: -18 }, ferrymanScale: 2,
  soulAnchor: { xPercent: 50, yPercent: 9 }, endTurnAnchor: { xPercent: 50, bottomPx: 36 },
  intent: { gapPx: 10, widthPercent: 28, heightPx: 60, scale: 1 },
});
export const FeedbackConfig = Object.freeze({
  drawMoveMs: 420, drawStaggerMs: 140, revealMs: 240,
  discardMs: 560, discardStaggerMs: 120, exhaustMs: 620,
  pulseMs: 720, floatMs: 1500,
  turnEndPauseMs: 420, intentDisplayMs: 1650, intentToDrawPauseMs: 500,
  releasePauseMs: 180, releaseMs: 1500, resultDelayMs: 240,
  failureDelayMs: 650, resultDisplayMs: 1800, soulFlameCount: 4,
});
