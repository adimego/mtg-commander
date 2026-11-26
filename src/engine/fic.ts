import type { FrcApi } from './frc';
import { runFicLeftovers } from './fic-run';

export function runFic(kind: string | undefined, api: FrcApi): boolean {
  if (!kind) return false;
  return runFicLeftovers(kind, api);
}
