import type { IAnyError } from '@zerospin/error';
import type { Effect } from 'effect';

import type { ICommandOutcome } from '../contracts/CommandOutcomeSchema.ts';
import type { IAggregateContracts, ICommand } from '../contracts/types.ts';
import type { IDb } from '../drizzle/types.ts';
import type { IActorIdentity } from '../identity/make/makeActorIdentity/makeActorIdentity.ts';
import type { IAggregateAuthentication } from '../identity/types.ts';
import type {
  IAnyQueryDbVersion,
  IQuerySelections,
  ISelection,
} from '../models/make/makeQueryDbVersion.ts';
import type { IAnyModels } from '../models/types.ts';

export type IAggregateQuerySelections = Readonly<Record<string, ISelection>>;

export type IAggregateActorAuthorization<
  CLAIMS = Readonly<Record<string, unknown>>,
  R = never,
> = {
  bivarianceHack(props: {
    claims: CLAIMS;
    aggregateId: string;
    sessionName: string;
    db: Readonly<Pick<IDb, 'query'>>;
    executeCommand(
      command: Omit<ICommand, 'id'>,
    ): Effect.Effect<ICommandOutcome, IAnyError, never>;
  }): Effect.Effect<void, IAnyError, R>;
}['bivarianceHack'];

export type IAnyAggregateActorRelease = {
  readonly kind: 'aggregate';
  readonly name: string;
  readonly version: number;
  readonly db: IAnyQueryDbVersion;
  readonly exposedModels: IAnyModels;
  readonly selections: IQuerySelections;
  readonly capturedSelections: IAggregateQuerySelections;
  readonly contracts: IAggregateContracts;
  readonly __contractRequirements?: unknown;
  readonly identity: IActorIdentity;
  readonly authentication: IAggregateAuthentication;
  readonly authorize: {
    bivarianceHack(props: unknown): Effect.Effect<void, IAnyError, unknown>;
  }['bivarianceHack'];
  readonly __authorizeRequirements?: unknown;
};
