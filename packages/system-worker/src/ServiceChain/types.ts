import type { ICommandOutcome } from '@zerospin/core/contracts/CommandOutcomeSchema';
import type { RetainedServiceCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import type { PublicFailureSchema } from '@zerospin/error';
/** Complete admitted occurrence transported with its bound service owner. */
export type IServiceCommandOccurrence =
  typeof RetainedServiceCommandSchema.Type &
    Readonly<{
      serviceIndex: number;
      outcome: ICommandOutcome | null;
      payloadFailure?: typeof PublicFailureSchema.Type;
    }>;
