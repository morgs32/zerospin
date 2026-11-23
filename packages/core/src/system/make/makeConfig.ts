import '@zerospin/server-only';
import { makeZerospinError } from '@zerospin/error';
import { runSynchronousExit } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as ManagedRuntime from 'effect/ManagedRuntime';
import * as Schema from 'effect/Schema';

import { NanoIdFactory } from '../../utils/NanoIdFactory.ts';
import { UlidMonotonicFactory } from '../../utils/UlidMonotonicFactory.ts';
import { System } from '../System.ts';
import type {
  ISystem,
  ISystemConfig,
  ISystemId,
  ITelemetryConfig,
} from '../types.ts';
import { ZerospinConfigSchema } from '../ZerospinConfigSchema.ts';

export function makeConfig<SYSTEM extends ISystem>(
  props: Readonly<{
    system: SYSTEM;
    systemId: ISystemId;
    telemetry?: ITelemetryConfig;
    wrangler?: ISystemConfig['wrangler'];
  }>,
): ISystemConfig<SYSTEM> {
  if (Object.hasOwn(props, 'layer')) {
    throw makeZerospinError({
      code: 'zerospin-config-release-layer-required',
      message:
        'Declare application Effect dependencies on the Aggregate or Service release.',
    });
  }
  const { system, systemId, telemetry, wrangler } = props;
  const managedRuntime = ManagedRuntime.make(
    Layer.mergeAll(
      Layer.succeed(System, system),
      NanoIdFactory,
      UlidMonotonicFactory,
    ),
  );
  const runSync: typeof managedRuntime.runSync = program => {
    const exit = runSynchronousExit(program, managedRuntime.runSyncExit);
    return Effect.runSync(exit);
  };
  Object.defineProperty(managedRuntime, 'runSync', { value: runSync });
  const config = Schema.decodeUnknownSync(ZerospinConfigSchema)({
    system,
    systemId,
    managedRuntime,
    ...(telemetry === undefined ? {} : { telemetry }),
    ...(wrangler === undefined ? {} : { wrangler }),
  });
  return { ...config, system };
}
