import { describe, expect, it } from 'vitest';
import { HB19_NINE_SLICE, HubInfoPanel } from '../src/ui/hub-components';

describe('HB19 nine-slice geometry', () => {
  it('uses the fixed 1254px source cuts and shared 190px slices', () => {
    expect(HB19_NINE_SLICE).toMatchObject({
      sourceWidth: 1254,
      sourceHeight: 1254,
      left: 190,
      right: 190,
      top: 190,
      bottom: 190,
      renderBorder: 24,
      minWidth: 320,
      minHeight: 110,
      contentSafeRect: { x: 235, y: 220, width: 780, height: 814 },
    });
  });

  it.each([
    [795, 110],
    [387, 126],
    [795, 278],
    [795, 400],
  ])('maps the safe rect through the stretched center for %i×%i panels', (width, height) => {
    const rect = HubInfoPanel.getContentRect(width, height);
    const scaleX = (width - 48) / 874;
    const scaleY = (height - 48) / 874;

    expect(rect.x).toBeCloseTo(24 + 45 * scaleX, 6);
    expect(rect.y).toBeCloseTo(24 + 30 * scaleY, 6);
    expect(rect.width).toBeCloseTo(HB19_NINE_SLICE.contentSafeRect.width * scaleX, 6);
    expect(rect.height).toBeCloseTo(HB19_NINE_SLICE.contentSafeRect.height * scaleY, 6);
    expect(rect.x + rect.width).toBeLessThan(width - 24);
    expect(rect.y + rect.height).toBeLessThan(height - 24);
  });

  it('rejects panels below the shared minimum dimensions', () => {
    expect(() => HubInfoPanel.getContentRect(319, 110)).toThrow(RangeError);
    expect(() => HubInfoPanel.getContentRect(320, 109)).toThrow(RangeError);
  });
});
