import type { ICommandOutcome } from '@zerospin/core/contracts/CommandOutcomeSchema';
import type { RetainedAggregateCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import type {
  IAggregateCommand,
  IEncodedCommand,
} from '@zerospin/core/contracts/types';
import type { PublicFailureSchema } from '@zerospin/error';

export type IAdmittedAggregateCommands =
  readonly (IEncodedCommand<IAggregateCommand> &
    Readonly<{ aggregateIndex: number }>)[];

/** Complete admitted command transported with its bound aggregate owner. */
export type IAdmittedAggregateCommand =
  typeof RetainedAggregateCommandSchema.Type &
    Readonly<{
      aggregateIndex: number;
      outcome: ICommandOutcome | null;
      payloadFailure?: typeof PublicFailureSchema.Type;
    }>;
