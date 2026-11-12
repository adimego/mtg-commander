/** Layers that replace the default board on a phone. */
export interface BoardViews {
  zoom: boolean;
  zone: boolean;
  menu: boolean;
  log: boolean;
  stack: boolean;
  board: boolean;
}

export function needsBack(v: BoardViews): boolean {
  return v.zoom || v.zone || v.menu || v.log || v.stack || v.board;
}

/** Close every inspect layer and return to the default board. */
export function backToBoard(_v: BoardViews): BoardViews {
  return { zoom: false, zone: false, menu: false, log: false, stack: false, board: false };
}
