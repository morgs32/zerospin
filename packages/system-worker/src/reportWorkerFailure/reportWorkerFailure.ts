import { prettyUnknownFailure } from '@zerospin/error';
import * as Cause from 'effect/Cause';

/** Print an escaping failure without changing its propagation or public encoding. */
export function reportWorkerFailure(props: {
  boundary: string;
  cause: Cause.Cause<unknown>;
}): void {
  const { boundary, cause } = props;
  if (Cause.hasInterruptsOnly(cause)) return;
  try {
    console.error(`[zerospin] ${boundary}\n${prettyUnknownFailure(cause)}`);
  } catch {
    // Formatting or diagnostic delivery must never replace the original failure.
  }
}
