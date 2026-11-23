import * as Schema from 'effect/Schema';

import type { IAggregateContractRelease } from '../contracts/types.ts';
import { VersionSchema } from '../declaration/VersionSchema.ts';
import type { IAnyQueryDbVersion } from '../models/make/makeQueryDbVersion.ts';

import {
  compileAgentRelease,
  type IAgentReleaseProps,
} from './compileAgentRelease.ts';
import type { IAgentCommandRefs } from './makeAgentCommandRef.ts';
import type { IAuthoredWakeRules } from './makeAgentWake.ts';
import type { IAggregateAgentRelease } from './types.ts';

const declarations = new WeakSet<object>();
export function isAggregateAgentRelease(
  value: unknown,
): value is IAggregateAgentRelease {
  return typeof value === 'object' && value !== null && declarations.has(value);
}

/** Bind an independently versioned Agent to its exact registered Aggregate release. */
export function makeAggregateAgentRelease<
  const DB extends IAnyQueryDbVersion,
  const PROPS extends IAgentReleaseProps & {
    aggregateName: string;
    aggregateVersion: number;
    db: DB;
    contracts: IAgentCommandRefs<IAggregateContractRelease>;
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
        | 'aggregateName'
        | 'aggregateVersion'
      >,
      never
    >,
) {
  Schema.decodeUnknownSync(VersionSchema)(props.aggregateVersion);
  Schema.decodeUnknownSync(Schema.NonEmptyString)(props.aggregateName);
  const release = compileAgentRelease<PROPS>(props);
  declarations.add(release);
  return release;
}
