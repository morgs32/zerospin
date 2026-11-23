import * as Context from 'effect/Context';

/** Capability admission state retained per instance. */
export class Initialized extends Context.Service<
  Initialized,
  {
    systemName: string;
    serviceName: string;
    serviceVersion: number;
    actorName: string;
    actorVersion: number;
    admitted: {
      claims: Readonly<Record<string, unknown>>;
      actorPath: string;
    };
  }
>()('ServiceAccessApi.Initialized') {}
