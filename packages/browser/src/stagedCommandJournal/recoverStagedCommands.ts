import { makeNodeCommandId } from '@zerospin/core/contracts/commandIds';
import {
  NodeRetentionSchema,
  type INodeCommandCoverage,
  type INodeRetention,
} from '@zerospin/core/Node/NodeCommandCoverage';
import { sessionSubmissionKey } from '@zerospin/core/Node/sessionSubmissionKey';
import { makeOutboxDelivery } from '@zerospin/core/outbox/makeOutboxDelivery';
import { makeZerospinError } from '@zerospin/error';
import * as Cause from 'effect/Cause';
import * as Deferred from 'effect/Deferred';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { awaitConnectionStep } from '../Node/awaitConnectionStep.ts';
import { isBrowserOffline } from '../Node/isBrowserOffline.ts';
import { nodeRpcErrorFor } from '../Node/nodeRpcErrorFor.ts';
import type { IStagedCommandAttachment } from '../outbox/makeSessionCommandHandoff.ts';

import { makeRecoveredCommandCoverage } from './makeRecoveredCommandCoverage.ts';
import { makeStagedCommandJournal } from './makeStagedCommandJournal.ts';

type IOriginalCommand = {
  sessionId: string;
  sessionIndex: number;
  commandName: string;
  id: string | null;
  nodeId: string | null;
  nodeIndex: number | null;
  pushIndex: number | null;
};
type IResolution = { id: string; commandName: string };

function releaseSubscriber(subscriber: object) {
  if (Symbol.dispose in subscriber) {
    const dispose = subscriber[Symbol.dispose];
    if (typeof dispose === 'function') dispose.call(subscriber);
  }
}

// Sibling sessions share delivery ownership; Node retention deduplicates across tabs.
const recoveringScopes = new Map<
  string,
  ReturnType<typeof Deferred.makeUnsafe<void>>
>();

/** Own one replica's journal scope and old-session delivery without staging again. */
export function recoverStagedCommands<
  COMMAND extends IOriginalCommand,
  RESOLUTION extends IResolution,
>(props: {
  prefix: string;
  sessionId: string;
  identityKey(): string | undefined;
  decode(input: unknown): COMMAND;
  resolutionIndex(resolution: RESOLUTION): number;
  attachment(nodeId: string): IStagedCommandAttachment<COMMAND> | null;
  isActive(): boolean;
  originating(command: COMMAND): void;
  retained(records: readonly INodeRetention[]): void;
}) {
  const {
    prefix,
    sessionId,
    identityKey,
    decode,
    resolutionIndex,
    attachment,
    isActive,
    originating,
  } = props;
  const makeScope = (key: string, nodeId: string) => ({
    nodeId,
    journal: makeStagedCommandJournal({
      prefix,
      identityKey: key,
      nodeId,
      decode,
    }),
    coverage: makeRecoveredCommandCoverage<COMMAND, RESOLUTION>({
      nodeId,
      resolutionIndex,
    }),
    pending: new Map<string, COMMAND>(),
    interests: new Map<string, COMMAND>(),
    scanned: false,
  });
  let scope: ReturnType<typeof makeScope> | undefined;
  const bind = (nodeId: string) => {
    const key = identityKey();
    if (key === undefined) return undefined;
    if (scope === undefined || scope.nodeId !== nodeId) {
      scope = makeScope(key, nodeId);
    }
    // Capture the original Node incarnation rather than a later mutable binding.
    const journal = scope.journal;
    return (command: COMMAND) => journal.write(command);
  };
  const retainInScope = (
    selected: ReturnType<typeof makeScope>,
    record: INodeRetention,
  ) => {
    if (record.nodeId !== selected.nodeId) {
      throw makeZerospinError('session-staged-coordinate-conflict');
    }
    const key = sessionSubmissionKey(record);
    const command = selected.interests.get(key);
    if (command !== undefined) {
      selected.interests.set(key, {
        ...command,
        id: makeNodeCommandId(record.nodeId, record.pushIndex),
        nodeId: record.nodeId,
        nodeIndex: record.nodeIndex,
        pushIndex: record.pushIndex,
      });
    }
    selected.journal.remove(record);
    selected.pending.delete(key);
  };
  const acknowledge = (records: readonly INodeRetention[]) => {
    const selected = scope;
    if (selected === undefined) return;
    for (const record of records) retainInScope(selected, record);
  };
  const partition = (
    coverage: readonly INodeCommandCoverage<RESOLUTION>[],
    checkpoint: {
      nodeIndex: number;
      checkpointIndex: number;
    },
  ) => {
    const selected = scope;
    if (selected === undefined) {
      return {
        current: coverage,
        commit() {
          // A replica without a journal has no recovery metadata to commit.
        },
      };
    }
    const validated = selected.coverage.validate(coverage, {
      sessionId,
      ...checkpoint,
    });
    return {
      current: validated.current,
      commit() {
        validated.commit();
        for (const entry of coverage) {
          if (entry.nodeId === null) continue;
          retainInScope(selected, entry);
          if (entry.resolution !== null) {
            selected.interests.delete(sessionSubmissionKey(entry));
          }
        }
      },
    };
  };
  const drain = Effect.gen(function* () {
    const selected = scope;
    if (selected === undefined || !isActive()) return;
    for (;;) {
      const running = recoveringScopes.get(selected.journal.key);
      if (running === undefined) break;
      yield* Deferred.await(running);
      if (scope !== selected || !isActive()) return;
    }
    yield* Effect.acquireUseRelease(
      Effect.sync(() => {
        const completed = Deferred.makeUnsafe<void>();
        recoveringScopes.set(selected.journal.key, completed);
        return completed;
      }),
      () =>
        Effect.gen(function* () {
          if (!selected.scanned) {
            selected.scanned = true;
            const commands = selected.journal
              .read()
              .filter(command => command.sessionId !== sessionId);
            commands.sort(
              (left, right) =>
                left.sessionId.localeCompare(right.sessionId) ||
                left.sessionIndex - right.sessionIndex,
            );
            for (const command of commands) {
              selected.pending.set(sessionSubmissionKey(command), command);
            }
          }
          const deferredSessions = new Set<string>();
          const active = () => scope === selected && isActive();
          const delivery = makeOutboxDelivery({
            name: 'stagedCommandOutbox',
            retryTransport: isBrowserOffline,
            isActive: active,
            hasPending: () => selected.pending.size > 0,
            readPage: () =>
              [...selected.pending.values()]
                .filter(command => !deferredSessions.has(command.sessionId))
                .slice(0, 1)
                .map(row => ({ row, index: row.sessionIndex })),
            prepare: rows =>
              Effect.sync(() => {
                for (const command of rows) {
                  selected.coverage.register(command);
                  const key = sessionSubmissionKey(command);
                  if (!selected.interests.has(key)) {
                    selected.interests.set(key, structuredClone(command));
                  }
                  originating(command);
                }
                return rows;
              }),
            subscriber: () =>
              Effect.tryPromise({
                try: async signal => {
                  const attached = attachment(selected.nodeId);
                  if (attached === null) {
                    throw makeZerospinError('node-connection-unavailable');
                  }
                  const acquiring = Promise.resolve(attached.subscriber());
                  const subscriber = await awaitConnectionStep(
                    acquiring,
                    signal,
                  ).catch(error => {
                    void acquiring
                      .then(releaseSubscriber, () => undefined)
                      .catch(() => undefined);
                    throw error;
                  });
                  if (!active() || !attached.isCurrent()) {
                    releaseSubscriber(subscriber);
                    throw makeZerospinError('outbox-source-inactive');
                  }
                  receiptCurrent = () => active() && attached.isCurrent();
                  return subscriber;
                },
                catch: nodeRpcErrorFor([
                  'node-connection-unavailable',
                  'outbox-source-inactive',
                ]),
              }),
            release: releaseSubscriber,
            acknowledge: (page, input: readonly INodeRetention[]) =>
              Effect.sync(() => {
                if (!receiptCurrent()) {
                  throw makeZerospinError('outbox-source-inactive');
                }
                const records = Schema.decodeUnknownSync(
                  Schema.Array(NodeRetentionSchema),
                )(input);
                const command = page[0]?.row;
                const record = records[0];
                if (
                  command === undefined ||
                  record === undefined ||
                  records.length !== 1 ||
                  record.sessionId !== command.sessionId ||
                  record.sessionIndex !== command.sessionIndex
                ) {
                  throw makeZerospinError('node-retention-reply-invalid');
                }
                selected.coverage.retain(record);
                acknowledge(records);
                props.retained(records);
              }),
            recordFailure: page =>
              Effect.sync(() => {
                for (const entry of page) {
                  deferredSessions.add(entry.row.sessionId);
                }
              }),
          });
          let receiptCurrent = () => false;
          while (
            active() &&
            [...selected.pending.values()].some(
              command => !deferredSessions.has(command.sessionId),
            )
          ) {
            // A refused old session must not block live handoff or other old sessions.
            yield* delivery.drain().pipe(Effect.catch(() => Effect.void));
          }
        }),
      completed =>
        Effect.sync(() => {
          recoveringScopes.delete(selected.journal.key);
          Deferred.doneUnsafe(completed, Effect.void);
        }),
    );
  }).pipe(
    Effect.catchCause(cause =>
      Cause.hasInterruptsOnly(cause) ? Effect.interrupt : Effect.void,
    ),
  );
  return {
    bind,
    acknowledge,
    partition,
    drain,
    journalChanged: (key: string | null) => {
      if (
        scope === undefined ||
        key === null ||
        !key.startsWith(scope.journal.key)
      )
        return false;
      scope.scanned = false;
      return true;
    },
    pendingCommands: (): readonly COMMAND[] =>
      scope === undefined ? [] : [...scope.interests.values()],
    reset: (options?: { preservePending?: boolean }) => {
      if (options?.preservePending === true) {
        scope?.coverage.resetResolutions();
      } else {
        scope = undefined;
      }
    },
  };
}

export type IStagedCommandRecovery<
  COMMAND extends IOriginalCommand,
  RESOLUTION extends IResolution,
> = ReturnType<typeof recoverStagedCommands<COMMAND, RESOLUTION>>;
