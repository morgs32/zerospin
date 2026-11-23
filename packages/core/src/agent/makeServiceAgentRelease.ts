import * as Schema from 'effect/Schema';

import type { IServiceContractRelease } from '../contracts/types.ts';
import { VersionSchema } from '../declaration/VersionSchema.ts';
import type { IAnyQueryDbVersion } from '../models/make/makeQueryDbVersion.ts';

import {
  compileAgentRelease,
  type IAgentReleaseProps,
} from './compileAgentRelease.ts';
import type { IAgentCommandRefs } from './makeAgentCommandRef.ts';
import type { IAuthoredWakeRules } from './makeAgentWake.ts';
import type { IServiceAgentRelease } from './types.ts';

const declarations = new WeakSet<object>();
export function isServiceAgentRelease(
  value: unknown,
): value is IServiceAgentRelease {
  return typeof value === 'object' && value !== null && declarations.has(value);
}

/** Bind an independently versioned Agent to its exact registered Service release. */
export function makeServiceAgentRelease<
  const DB extends IAnyQueryDbVersion,
  const PROPS extends IAgentReleaseProps & {
    serviceName: string;
    serviceVersion: number;
    db: DB;
    contracts: IAgentCommandRefs<IServiceContractRelease>;
  },
>(
  props: PROPS & {
    db: DB;
    wakeRules?: IAuthoredWakeRules<NoInfer<DB['models']>>;
  } & Record<
      Exclude<
        keyof PROPS,
        | keyof IAgentReleaseProps
        | 'wakeRules'
        | 'serviceName'
        | 'serviceVersion'
      >,
      never
    >,
) {
  Schema.decodeUnknownSync(VersionSchema)(props.serviceVersion);
  Schema.decodeUnknownSync(Schema.NonEmptyString)(props.serviceName);
  const release = compileAgentRelease<PROPS>(props);
  declarations.add(release);
  return release;
}
