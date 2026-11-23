import type { IServiceSessionLock } from '@zerospin/core/serviceSession/ServiceSessionLockSchema';
import type { ISystemId } from '@zerospin/core/system/types';
import * as Context from 'effect/Context';

/** Authorized identity retained privately by one session capability. */
export class Initialized extends Context.Service<
  Initialized,
  {
    readonly claims: Readonly<Record<string, unknown>>;
    readonly actorPath: string;
    readonly sessionName: string;
    readonly serviceSessionLock: IServiceSessionLock;
    readonly serviceName: string;
    serviceVersion: number;
    readonly systemId: ISystemId;
  }
>()('ServiceSessionApi.Initialized') {}
