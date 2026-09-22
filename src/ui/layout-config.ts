export const HandLayout = Object.freeze({ pageSize: 5, cardScale: 1, spacingVw: 9, maxSpreadVw: 48, centerPercent: 50, arcPx: 0, hoverOffsetPx: 18 });
export const DragConfig = Object.freeze({
  thresholdPx: 7, dragScale: 1.07,
  playZone: { topRatio: 0.08, bottomRatio: 0.58, leftRatio: 0.16, rightRatio: 0.84 },
  resolveDurationMs: 720,
});
export const BattleLayout = Object.freeze({
  ferrymanAnchor: { rightPercent: -8, bottomPercent: -18 }, ferrymanScale: 2,
  soulAnchor: { xPercent: 50, yPercent: 9 }, endTurnAnchor: { xPercent: 50, bottomPx: 36 },
  intent: { gapPx: 10, widthPercent: 28, heightPx: 60, scale: 1 },
});
export const FeedbackConfig = Object.freeze({
  drawMoveMs: 250, drawStaggerMs: 85, revealMs: 170,
  discardMs: 380, discardStaggerMs: 80, exhaustMs: 460,
  pulseMs: 520, floatMs: 1150,
  releasePauseMs: 180, releaseMs: 1500, resultDelayMs: 240,
  failureDelayMs: 650, resultDisplayMs: 1800, soulFlameCount: 4,
});
