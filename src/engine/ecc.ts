import type { FrcApi } from './frc';
import { runEccLeftovers } from './ecc-run';

export function runEcc(kind: string | undefined, api: FrcApi): boolean {
  if (!kind) return false;
  return runEccLeftovers(kind, api);
}
