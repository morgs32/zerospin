import type { IAggregateActorSessionLock } from '@zerospin/core/aggregateSession/AggregateSessionLockSchema';
import type { IAggregateId } from '@zerospin/core/models/types';
import type { ISystemId } from '@zerospin/core/system/types';
import * as Context from 'effect/Context';

/** Authorized identity retained privately by one session capability. */
export class Initialized extends Context.Service<
  Initialized,
  {
    readonly aggregateId: IAggregateId;
    readonly aggregateName: string;
    aggregateVersion: number;
    readonly claims: Readonly<Record<string, unknown>>;
    actorName: string;
    actorVersion: number;
    readonly actorPath: string;
    readonly sessionName: string;
    readonly aggregateSessionLock: IAggregateActorSessionLock;
    readonly systemId: ISystemId;
  }
>()('AggregateSessionApi.Initialized') {}
