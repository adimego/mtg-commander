import type { FrcApi } from './frc';
import { runEocLeftovers } from './eoc-run';

export function runEoc(kind: string | undefined, api: FrcApi): boolean {
  if (!kind) return false;
  return runEocLeftovers(kind, api);
}
