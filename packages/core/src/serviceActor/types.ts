import type { IAnyError } from '@zerospin/error';
import type { Effect } from 'effect';

import type { IAnyOwnerGuard } from '../contracts/ownerGuards.ts';
import type { IServiceContracts } from '../contracts/types.ts';
import type { IDb } from '../drizzle/types.ts';
import type { IActorIdentity } from '../identity/make/makeActorIdentity/makeActorIdentity.ts';
import type { IServiceAuthentication } from '../identity/types.ts';
import type {
  IAnyQueryDbVersion,
  IQuerySelections,
  ISelection,
} from '../models/make/makeQueryDbVersion.ts';
import type { IAnyModels } from '../models/types.ts';
export type IServiceQuerySelections = Readonly<Record<string, ISelection>>;
export type IServiceActorAuthorization<
  CLAIMS = Readonly<Record<string, unknown>>,
  R = never,
> = {
  bivarianceHack(props: {
    claims: CLAIMS;
    sessionName: string;
    db: Readonly<Pick<IDb, 'query'>>;
  }): Effect.Effect<void, IAnyError, R>;
}['bivarianceHack'];
export type IAnyServiceActorRelease = {
  readonly kind: 'service';
  readonly contracts: IServiceContracts;
  readonly guards: Readonly<Record<string, IAnyOwnerGuard | undefined>>;
  readonly name: string;
  readonly version: number;
  readonly db: IAnyQueryDbVersion;
  readonly exposedModels: IAnyModels;
  readonly selections: IQuerySelections;
  readonly capturedSelections: IServiceQuerySelections;
  readonly identity: IActorIdentity;
  readonly authentication: IServiceAuthentication;
  readonly authorize?: {
    bivarianceHack(props: unknown): Effect.Effect<void, IAnyError, unknown>;
  }['bivarianceHack'];
  readonly __authorizeRequirements?: unknown;
};
