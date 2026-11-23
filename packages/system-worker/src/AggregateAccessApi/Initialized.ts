import * as Context from 'effect/Context';

/** Authenticated Actor state retained per instance. */
export class Initialized extends Context.Service<
  Initialized,
  {
    systemName: string;
    aggregateName: string;
    aggregateVersion: number;
    authenticatedActor: {
      claims: Readonly<Record<string, unknown>>;
      actorName: string;
      actorVersion: number;
      actorPath: string;
    };
  }
>()('AggregateAccessApi.Initialized') {}
