import * as Context from 'effect/Context';

/** Aggregate release and Actor selected by the Gateway. */
export class Initialized extends Context.Service<
  Initialized,
  {
    systemName: string;
    aggregateName: string;
    aggregateVersion: number;
    actorName: string;
    actorVersion: number;
  }
>()('AggregateApi.Initialized') {}
