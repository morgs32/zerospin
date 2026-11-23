import { assertSessionClaims } from '@zerospin/core/identity/assertSessionClaims';
import { NodeRetentionSchema } from '@zerospin/core/Node/NodeCommandCoverage';
import { sessionKey } from '@zerospin/core/Node/sessionKey';
import type { ServiceNode } from '@zerospin/core/ServiceNode/ServiceNode';
import { ServiceNodeCommandSchema } from '@zerospin/core/ServiceNode/ServiceNodeCommandSchema';
import type {
  IServiceNodeCommand,
  IServiceNodeIdentity,
} from '@zerospin/core/ServiceNode/types';
import { isZerospinError, makeZerospinError } from '@zerospin/error';
import { RpcStub } from 'capnweb';
import * as Schema from 'effect/Schema';

import { awaitConnectionStep } from '../Node/awaitConnectionStep.ts';
import { publicRpcError, restoreRpcError } from '../Node/publicRpcError.ts';
import { makeStagedCommandJournal } from '../stagedCommandJournal/makeStagedCommandJournal.ts';

import { makeServiceNodeDefinition } from './makeServiceNodeDefinition.ts';
import type { IServiceNodeRequest } from './serviceNodeRequest.ts';

const ReadSchema = Schema.Struct({
  claims: Schema.Record(Schema.String, Schema.Unknown),
  nodeId: Schema.NonEmptyString,
  offset: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
});
const PageSchema = Schema.Struct({
  commands: Schema.Array(ServiceNodeCommandSchema),
  done: Schema.Boolean,
});
const RetentionsSchema = Schema.Array(NodeRetentionSchema);
const pageSize = 100;

export type IServiceNodeUpgradeJournal = {
  read(input: unknown): Promise<typeof PageSchema.Type>;
  acknowledge(input: unknown): Promise<void>;
};

/** The initializing page strictly snapshots only its verified identity and producer. */
export function makeServiceNodeUpgradeJournal(props: {
  request: IServiceNodeRequest;
  expectedClaims: Readonly<Record<string, unknown>> | undefined;
  isCurrent(): boolean;
}): RpcStub<IServiceNodeUpgradeJournal> {
  const { request, expectedClaims, isCurrent } = props;
  const retiredProducers = new Set<string>();
  let selected:
    | {
        identityKey: string;
        nodeId: string;
        journal: ReturnType<
          typeof makeStagedCommandJournal<IServiceNodeCommand>
        >;
        commands: readonly IServiceNodeCommand[];
        issued: Set<string>;
      }
    | undefined;
  const check = () => {
    if (!isCurrent()) throw makeZerospinError('node-tab-detached');
  };
  return new RpcStub<IServiceNodeUpgradeJournal>({
    async read(input) {
      try {
        check();
        const read = Schema.decodeUnknownSync(ReadSchema)(input, {
          onExcessProperty: 'error',
        });
        const definition = await makeServiceNodeDefinition(
          request,
          read.claims,
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
        if (selected?.nodeId !== read.nodeId) {
          if (read.offset !== 0) {
            throw makeZerospinError('node-storage-upgrade-journal-invalid');
          }
          // Registration may discover a successor after the first journal read.
          if (selected) retiredProducers.add(selected.nodeId);
          const journal = makeStagedCommandJournal({
            prefix: 'service',
            identityKey,
            nodeId: read.nodeId,
            decode: input =>
              Schema.decodeUnknownSync(ServiceNodeCommandSchema)(input, {
                onExcessProperty: 'error',
              }),
          });
          selected = {
            identityKey,
            nodeId: read.nodeId,
            journal,
            commands: journal.read(),
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

/** Retain journal originals locally before acknowledging their original session coordinates. */
export async function recoverServiceTabJournal(props: {
  node: ServiceNode;
  identity: IServiceNodeIdentity;
  journal: IServiceNodeUpgradeJournal;
  signal: AbortSignal;
  assertCurrent(): void;
}) {
  const { node, identity, journal, signal, assertCurrent } = props;
  assertCurrent();
  const snapshot = await awaitConnectionStep(
    node.snapshot({ authoritative: true }),
    signal,
  );
  let offset = 0;
  for (;;) {
    const page = Schema.decodeUnknownSync(PageSchema)(
      await awaitConnectionStep(
        journal
          .read({
            claims: identity.claims,
            nodeId: snapshot.metadata.nodeId,
            offset,
          })
          .catch(restoreRpcError),
        signal,
      ),
      { onExcessProperty: 'error' },
    );
    if (
      page.commands.length > pageSize ||
      (!page.done && page.commands.length === 0)
    ) {
      throw makeZerospinError('node-storage-upgrade-journal-invalid');
    }
    const retentions = [];
    for (const command of page.commands) {
      assertCurrent();
      if (
        command.id !== null ||
        command.nodeId !== null ||
        command.nodeIndex !== null ||
        command.pushIndex !== null
      ) {
        throw makeZerospinError('node-storage-upgrade-journal-invalid');
      }
      retentions.push(
        await node.accept(command, snapshot.metadata.nodeId, assertCurrent),
      );
    }
    await awaitConnectionStep(
      journal.acknowledge(retentions).catch(restoreRpcError),
      signal,
    );
    offset += page.commands.length;
    if (page.done) break;
  }
}
