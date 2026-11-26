import type { FrcApi } from './frc';
import { runFdcLeftovers } from './fdc-run';

export function runFdc(kind: string | undefined, api: FrcApi): boolean {
  if (!kind) return false;
  return runFdcLeftovers(kind, api);
}
