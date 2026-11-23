import { AggregateExposedCommandSchema } from '@zerospin/core/aggregateSession/AggregateActorCommandSchema/AggregateActorCommandSchema';
import type { IAggregateExposedCommand } from '@zerospin/core/aggregateSession/types';
import type { IDb } from '@zerospin/core/drizzle/types';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import { desc, lte } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { isEqual } from 'es-toolkit';

import type { AggregateActorHistory } from '../../AggregateActorVersionChain/AggregateActorHistory.js';
import type { IAggregateProjectionKey } from '../../aggregateProjection/resolveAggregateProjectionView.js';
import { aggregateAgentSessionChainDbConfig } from '../aggregateSessionChainDbConfig.js';
import { readExposedCommands } from '../readExposedCommands.js';

import {
  validateNodeReplayPrefix,
  validateOwnedCompletionIndex,
} from './validateNodeReplay.js';

const methodName = 'AggregateSessionChain.getBrowserCommands';

/*
 * Read one ordered union of missing execution and owned results from the retained
 * ActorVAC log. Both cursors advance independently; historical results do not
 * move execution progress. Execution-only callers receive browser commands.
 *
 * 1. Validate the cursors and require admitted context for node replay.
 * 2. Scan candidates until 64 selected outputs or the end of the log.
 * 3. Decode ownership structurally and check execution contiguity.
 * 4. Select readable models and redact other nodes' private completion fields.
 * 5. Return the whole-log publication tip independently of the page.
 */
export type IAggregateBrowserReplayProps = {
  history?: AggregateActorHistory | undefined;
  db: IDb;
  key: IAggregateProjectionKey;
  afterAggregateIndex: number;
  definition?: {
    name: string;
    modelNames: readonly string[];
  } & (
    | {
        actorName: string;
        actorVersion: number;
        claims: Readonly<Record<string, unknown>>;
      }
    | { actorName?: never; actorVersion?: never; claims?: never }
  );
  nodeId?: string;
  afterPushIndex?: number;
  /** Bound recovery to the state captured by a snapshot, excluding later completions. */
  throughAggregateIndex?: number;
};

/** Execution replay cannot ask for private node recovery. */
export type IAggregateExecutionReplayProps = Omit<
  IAggregateBrowserReplayProps,
  'nodeId' | 'afterPushIndex'
> & { nodeId?: never; afterPushIndex?: never };

const validateReplayCursors = makeFn(
  'AggregateSessionChain.validateReplayCursors',
)(function* (props: IAggregateBrowserReplayProps) {
  const {
    afterAggregateIndex,
    throughAggregateIndex,
    nodeId,
    afterPushIndex,
    definition,
    key,
  } = props;

  // 1 — node replay needs both cursor fields and the admitted definition
  if (
    !Number.isSafeInteger(afterAggregateIndex) ||
    afterAggregateIndex < 0 ||
    (throughAggregateIndex !== undefined &&
      (!Number.isSafeInteger(throughAggregateIndex) ||
        throughAggregateIndex < afterAggregateIndex)) ||
    ((nodeId !== undefined || afterPushIndex !== undefined) &&
      (nodeId === undefined ||
        afterPushIndex === undefined ||
        !Number.isSafeInteger(afterPushIndex) ||
        afterPushIndex < 0 ||
        definition === undefined))
  ) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'session-replay-cursor-invalid',
        message:
          'Replay requires nonnegative cursors and admitted node context',
      }),
    );
  }
  if (
    definition !== undefined &&
    'actorName' in key &&
    (definition.actorName !== key.actorName ||
      definition.actorVersion !== key.actorVersion ||
      definition.claims === undefined)
  ) {
    return yield* makeZerospinError('node-recovery-caller-mismatch');
  }
  if (
    (nodeId !== undefined || afterPushIndex !== undefined) &&
    !('actorName' in key)
  ) {
    return yield* makeZerospinError('node-recovery-caller-mismatch');
  }
});

/** Shared storage traversal preserves validation order for both replay modes. */
function readBrowserCommandPage<E>(
  props: IAggregateBrowserReplayProps & {
    onOwnedCompletion: (props: {
      pushIndex: number;
      pushThrough: number;
    }) => Effect.Effect<void, E>;
  },
) {
  const onOwnedCompletion = props.onOwnedCompletion.bind(props);
  const { onOwnedCompletion: _onOwnedCompletion, ...replay } = props;
  const {
    db,
    key,
    afterAggregateIndex,
    afterPushIndex,
    nodeId,
    definition,
    throughAggregateIndex,
  } = replay;
  return makeFn('AggregateSessionChain.readBrowserCommandPage')(function* () {
    // 2 — keep scanning after rejected ownership candidates, without short pages
    const outputs: IAggregateExposedCommand[] = [];
    let scannedThrough = 0;
    let aggregateThrough = afterAggregateIndex;
    let pushThrough = afterPushIndex ?? 0;
    let bytes = 0;
    let byteLimitReached = false;
    while (outputs.length < 64) {
      const rows = yield* readExposedCommands({
        ...replay,
        afterScannedIndex: scannedThrough,
        limit: 64,
      }).pipe(
        mapParseError({
          code: 'session-replay-invalid',
          prefix: 'Invalid retained output',
        }),
      );
      for (const row of rows) {
        const rowBytes = new TextEncoder().encode(
          JSON.stringify(row),
        ).byteLength;
        if (outputs.length > 0 && bytes + rowBytes > 1024 * 1024) {
          byteLimitReached = true;
          break;
        }
        bytes += rowBytes;
        if (row.aggregateIndex === null) {
          return yield* Effect.fail(
            makeZerospinError({
              code: 'session-replay-invalid',
              message: 'Retained output is missing its execution position',
            }),
          );
        }
        scannedThrough = row.aggregateIndex;
        const resolution = row.commandResolution;
        const ownsCompletion =
          nodeId !== undefined &&
          definition !== undefined &&
          resolution !== null &&
          resolution.nodeId === nodeId &&
          resolution.sessionName === definition.name &&
          'actorName' in key &&
          definition.actorName === key.actorName &&
          definition.actorVersion === key.actorVersion &&
          isEqual(resolution.claims, definition.claims);
        if (row.aggregateIndex <= afterAggregateIndex && !ownsCompletion) {
          continue;
        }
        if (row.aggregateIndex > aggregateThrough) {
          if (row.aggregateIndex !== aggregateThrough + 1) {
            return yield* Effect.fail(
              makeZerospinError({
                code: 'session-replay-gap',
                message: 'Session replay has a gap',
              }),
            );
          }
          aggregateThrough = row.aggregateIndex;
        }
        const command = yield* Schema.decodeUnknownEffect(
          Schema.toType(AggregateExposedCommandSchema),
        )({
          aggregateIndex: row.aggregateIndex,
          dispositionChainHash: row.dispositionChainHash,
          id: row.id,
          commandName: row.commandName,
          delta: row.delta,
          failure: resolution?.failure ?? null,
        }).pipe(
          mapParseError({
            code: 'session-replay-invalid',
            prefix: 'Invalid retained output',
          }),
        );
        // 4 — project public resources and expose only the owning completion
        const modelNames = definition?.modelNames;
        const delta = {
          upserted: command.delta.upserted.filter(
            resource =>
              modelNames === undefined ||
              modelNames.includes(resource.modelName),
          ),
          deleted: command.delta.deleted.filter(
            resource =>
              modelNames === undefined ||
              modelNames.includes(resource.modelName),
          ),
        };
        if (
          ownsCompletion &&
          resolution !== null &&
          resolution.pushIndex > pushThrough
        ) {
          yield* onOwnedCompletion({
            pushIndex: resolution.pushIndex,
            pushThrough,
          });
          pushThrough = resolution.pushIndex;
        }
        outputs.push({
          aggregateIndex: command.aggregateIndex,
          dispositionChainHash: command.dispositionChainHash,
          id: command.id,
          commandName: command.commandName,
          delta,
          failure: ownsCompletion ? command.failure : null,
        });
        if (outputs.length === 64) {
          break;
        }
      }
      if (rows.length === 0 || byteLimitReached) {
        break;
      }
    }

    // 5 — read the whole-log maximum independently of the returned page
    const table = aggregateAgentSessionChainDbConfig.schema.exposedCommands;
    return {
      commands: outputs,
      pushThrough,
      tip:
        props.history !== undefined
          ? Math.min(
              props.history.readHead().aggregateIndex,
              throughAggregateIndex ?? Number.MAX_SAFE_INTEGER,
            )
          : (db
              .select({
                index: table.aggregateIndex,
              })
              .from(table)
              .where(
                throughAggregateIndex === undefined
                  ? undefined
                  : lte(table.aggregateIndex, throughAggregateIndex),
              )
              .orderBy(desc(table.aggregateIndex))
              .limit(1)
              .get()?.index ?? 0),
    };
  })();
}

export const getExecutionBrowserCommands = makeFn(methodName)(function* (
  props: IAggregateExecutionReplayProps,
) {
  yield* validateReplayCursors(props);
  return yield* readBrowserCommandPage({
    ...props,
    onOwnedCompletion: () => Effect.void,
  });
});

export const readNodeBrowserCommandPage = makeFn(
  'AggregateSessionChain.readNodeBrowserCommandPage',
)(function* (props: IAggregateBrowserReplayProps) {
  yield* validateReplayCursors(props);
  return yield* readBrowserCommandPage({
    ...props,
    onOwnedCompletion: validateOwnedCompletionIndex,
  });
});

const getNodeRecoveryBrowserCommands = makeFn(methodName)(function* (
  props: IAggregateBrowserReplayProps,
) {
  yield* validateReplayCursors(props);
  yield* validateNodeReplayPrefix(props);
  return yield* readNodeBrowserCommandPage(props);
});

/** The RPC request mode selects the precise production procedure and error union. */
export function getBrowserCommands(
  props: IAggregateExecutionReplayProps,
): ReturnType<typeof getExecutionBrowserCommands>;
export function getBrowserCommands(
  props: IAggregateBrowserReplayProps,
): ReturnType<typeof getNodeRecoveryBrowserCommands>;
export function getBrowserCommands(props: IAggregateBrowserReplayProps) {
  const { nodeId, afterPushIndex, ...execution } = props;
  if (nodeId !== undefined || afterPushIndex !== undefined) {
    return getNodeRecoveryBrowserCommands(props);
  }
  return getExecutionBrowserCommands(execution);
}

Object.defineProperty(getBrowserCommands, 'name', { value: methodName });
