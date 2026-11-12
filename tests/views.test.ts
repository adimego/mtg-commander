import { describe, expect, it } from 'vitest';
import { backToBoard, needsBack, type BoardViews } from '../src/setup/views';

const open: BoardViews = { zoom: true, zone: true, menu: false, log: true, stack: true, board: true };

describe('phone view back button', () => {
  it('asks for Back whenever any inspect layer is open', () => {
    expect(needsBack(open)).toBe(true);
    expect(needsBack({ zoom: false, zone: false, menu: false, log: false, stack: false, board: false })).toBe(false);
    expect(needsBack({ ...open, zoom: false, zone: false, log: false, stack: false, board: false, menu: true })).toBe(true);
  });

  it('Back restores the default board from every combination', () => {
    const closed = backToBoard(open);
    expect(closed).toEqual({ zoom: false, zone: false, menu: false, log: false, stack: false, board: false });
    expect(needsBack(closed)).toBe(false);
    expect(backToBoard({ zoom: false, zone: true, menu: false, log: false, stack: false, board: false }).zone).toBe(false);
  });
});
