import type { AggregateNode } from '@zerospin/core/AggregateNode/AggregateNode';
import { AggregateNodeCommandSchema } from '@zerospin/core/AggregateNode/AggregateNodeCommandSchema';
import type { IAggregateJournalOriginal } from '@zerospin/core/AggregateNode/storage/adoptPublishedAggregateCommandStorageTx';
import type { IAggregateNodeIdentity } from '@zerospin/core/AggregateNode/types';
import { assertSessionClaims } from '@zerospin/core/identity/assertSessionClaims';
import { NodeRetentionSchema } from '@zerospin/core/Node/NodeCommandCoverage';
import { sessionKey } from '@zerospin/core/Node/sessionKey';
import { isZerospinError, makeZerospinError } from '@zerospin/error';
import { RpcStub } from 'capnweb';
import * as Schema from 'effect/Schema';

import { awaitConnectionStep } from '../Node/awaitConnectionStep.ts';
import { publicRpcError, restoreRpcError } from '../Node/publicRpcError.ts';
import { makeStagedCommandJournal } from '../stagedCommandJournal/makeStagedCommandJournal.ts';

import type { IAggregateNodeRequest } from './aggregateNodeRequest.ts';
import { makeAggregateNodeDefinition } from './makeAggregateNodeDefinition.ts';

const ReadSchema = Schema.Struct({
  requireComplete: Schema.optionalKey(Schema.Literal(true)),
  claims: Schema.Record(Schema.String, Schema.Unknown),
  nodeId: Schema.NonEmptyString,
  offset: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
});
// 48.0.0 wrote the predecessor beside the unallocated command in localStorage.
const JournalOriginalSchema = Schema.Struct({
  ...AggregateNodeCommandSchema.members[0].fields,
  dependsOn: Schema.optionalKey(
    Schema.Struct({
      sessionId: NodeRetentionSchema.fields.sessionId,
      sessionIndex: NodeRetentionSchema.fields.sessionIndex,
    }),
  ),
});
const PageSchema = Schema.Struct({
  commands: Schema.Array(JournalOriginalSchema),
  done: Schema.Boolean,
});
const RetentionsSchema = Schema.Array(NodeRetentionSchema);
const pageSize = 100;

export type IAggregateNodeUpgradeJournal = {
  read(input: unknown): Promise<typeof PageSchema.Type>;
  acknowledge(input: unknown): Promise<void>;
};

/** The initializing page strictly snapshots only its verified identity and producer. */
export function makeAggregateNodeUpgradeJournal(props: {
  request: IAggregateNodeRequest;
  aggregateId: string;
  expectedClaims: Readonly<Record<string, unknown>> | undefined;
  isCurrent(): boolean;
}): RpcStub<IAggregateNodeUpgradeJournal> {
  const { request, aggregateId, expectedClaims, isCurrent } = props;
  const retiredProducers = new Set<string>();
  let selected:
    | {
        complete: boolean;
        identityKey: string;
        nodeId: string;
        journal: ReturnType<
          typeof makeStagedCommandJournal<IAggregateJournalOriginal>
        >;
        commands: readonly IAggregateJournalOriginal[];
        issued: Set<string>;
      }
    | undefined;
  const check = () => {
    if (!isCurrent()) throw makeZerospinError('node-tab-detached');
  };
  return new RpcStub<IAggregateNodeUpgradeJournal>({
    async read(input) {
      try {
        check();
        const read = Schema.decodeUnknownSync(ReadSchema)(input, {
          onExcessProperty: 'error',
        });
        const definition = await makeAggregateNodeDefinition(
          request,
          read.claims,
          aggregateId,
        );
        assertSessionClaims(expectedClaims, definition.identity.claims);
        const identityKey = await sessionKey(definition.identity);
        check();
        if (
          retiredProducers.has(read.nodeId) ||
          (selected && selected.identityKey !== identityKey)
        ) {
          throw makeZerospinError('node-storage-upgrade-journal-invalid');
        }
        if (
          selected?.nodeId !== read.nodeId ||
          (read.requireComplete && !selected.complete)
        ) {
          if (read.offset !== 0) {
            throw makeZerospinError('node-storage-upgrade-journal-invalid');
          }
          // Registration may discover a successor after the first journal read.
          if (selected && selected.nodeId !== read.nodeId)
            retiredProducers.add(selected.nodeId);
          const journal = makeStagedCommandJournal({
            prefix: 'aggregate',
            identityKey,
            nodeId: read.nodeId,
            decode: Schema.decodeUnknownSync(JournalOriginalSchema, {
              onExcessProperty: 'error',
            }),
          });
          selected = {
            identityKey,
            nodeId: read.nodeId,
            journal,
            complete: read.requireComplete === true,
            commands: read.requireComplete
              ? journal.readForUpgrade()
              : journal.read(),
            issued: new Set(),
          };
        }
        if (read.offset > selected.commands.length) {
          throw makeZerospinError('node-storage-upgrade-journal-invalid');
        }
        const commands = selected.commands.slice(
          read.offset,
          read.offset + pageSize,
        );
        for (const command of commands) {
          selected.issued.add(`${command.sessionId}:${command.sessionIndex}`);
        }
        return {
          commands,
          done: read.offset + commands.length === selected.commands.length,
        };
      } catch (error) {
        throw publicRpcError(
          isZerospinError(error)
            ? error
            : makeZerospinError('node-storage-upgrade-journal-invalid'),
        );
      }
    },
    async acknowledge(input) {
      try {
        check();
        const retentions = Schema.decodeUnknownSync(RetentionsSchema)(input, {
          onExcessProperty: 'error',
        });
        if (
          selected === undefined ||
          retiredProducers.has(selected.nodeId) ||
          retentions.length > pageSize
        ) {
          throw makeZerospinError('node-storage-upgrade-journal-invalid');
        }
        for (const retained of retentions) {
          const key = `${retained.sessionId}:${retained.sessionIndex}`;
          if (
            retained.nodeId !== selected.nodeId ||
            !selected.issued.has(key)
          ) {
            throw makeZerospinError('node-storage-upgrade-journal-invalid');
          }
          selected.journal.remove(retained);
        }
      } catch (error) {
        throw publicRpcError(
          isZerospinError(error)
            ? error
            : makeZerospinError('node-storage-upgrade-journal-invalid'),
        );
      }
    },
  });
}

/** Read and validate every scoped original. The legacy format preflight leaves every original in place. */
export async function readAggregateTabJournal(
  journal: IAggregateNodeUpgradeJournal,
  claims: IAggregateNodeIdentity['claims'],
  nodeId: string,
  signal: AbortSignal,
  visitPage: (commands: readonly IAggregateJournalOriginal[]) => Promise<void>,
  options?: { requireComplete: true },
): Promise<void> {
  let offset = 0;
  for (;;) {
    const result = await awaitConnectionStep(
      journal
        .read({ claims, nodeId, offset, ...options })
        .catch(restoreRpcError),
      signal,
    );
    const decoded = Schema.decodeUnknownOption(PageSchema, {
      onExcessProperty: 'error',
    })(result);
    if (decoded._tag === 'None') {
      throw makeZerospinError('node-storage-upgrade-journal-invalid');
    }
    const { commands, done } = decoded.value;
    if (
      commands.length > pageSize ||
      (!done && commands.length === 0) ||
      commands.some(command => command.id !== null)
    ) {
      throw makeZerospinError('node-storage-upgrade-journal-invalid');
    }
    await visitPage(commands);
    if (done) return;
    offset += commands.length;
  }
}

/** Retain journal originals locally before acknowledging their original session coordinates. */
export async function recoverAggregateTabJournal(props: {
  node: AggregateNode;
  identity: IAggregateNodeIdentity;
  journal: IAggregateNodeUpgradeJournal;
  signal: AbortSignal;
  assertCurrent(): void;
}) {
  const { node, identity, journal, signal, assertCurrent } = props;
  assertCurrent();
  const snapshot = await awaitConnectionStep(
    node.snapshot({ authoritative: true }),
    signal,
  );
  await readAggregateTabJournal(
    journal,
    identity.claims,
    snapshot.metadata.nodeId,
    signal,
    async commands => {
      const retentions = [];
      for (const command of commands) {
        assertCurrent();
        retentions.push(
          await node.acceptJournalOriginal(
            command,
            snapshot.metadata.nodeId,
            assertCurrent,
          ),
        );
      }
      await awaitConnectionStep(
        journal.acknowledge(retentions).catch(restoreRpcError),
        signal,
      );
    },
  );
}
