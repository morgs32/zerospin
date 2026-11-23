import { makeNodeCommandId } from '@zerospin/core/contracts/commandIds';
import { assertSameNodeCommand } from '@zerospin/core/Node/assertSameNodeCommand';
import type {
  INodeCommandCoverage,
  INodeRetention,
  NodeCommandAllocationSchema,
} from '@zerospin/core/Node/NodeCommandCoverage';
import { sessionSubmissionKey } from '@zerospin/core/Node/sessionSubmissionKey';

/** Attachment-local interests retain exact commands across lost retention replies. */
export function makeNodeCommandInterests<
  COMMAND extends typeof NodeCommandAllocationSchema.Type & {
    sessionId: string;
    sessionIndex: number;
  },
>() {
  const commands = new Map<string, COMMAND>();
  return {
    add(inputs: readonly COMMAND[]) {
      for (const command of inputs) {
        const key = sessionSubmissionKey(command);
        const previous = commands.get(key);
        if (previous !== undefined) {
          assertSameNodeCommand(previous, command);
        }
        if (previous === undefined || command.nodeId !== null) {
          commands.set(key, command);
        }
      }
    },
    retained(retentions: readonly INodeRetention[]) {
      for (const retention of retentions) {
        const key = sessionSubmissionKey(retention);
        const command = commands.get(key);
        if (command !== undefined) {
          commands.set(key, {
            ...command,
            id: makeNodeCommandId(retention.nodeId, retention.pushIndex),
            nodeId: retention.nodeId,
            nodeIndex: retention.nodeIndex,
            pushIndex: retention.pushIndex,
          });
        }
      }
    },
    acknowledge(coverage: readonly INodeCommandCoverage<unknown>[]) {
      for (const entry of coverage) {
        if (entry.resolution !== null) {
          commands.delete(sessionSubmissionKey(entry));
        }
      }
    },
    read: () => [...commands.values()],
    clear: () => commands.clear(),
  };
}
