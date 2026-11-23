import { makeNodeCommandId } from '@zerospin/core/contracts/commandIds';
import type { INodeCommandCoverage } from '@zerospin/core/Node/NodeCommandCoverage';
import { sessionSubmissionKey } from '@zerospin/core/Node/sessionSubmissionKey';

export function retainOriginatingCommand(
  originatingCommands: Map<string, string>,
  retained: Pick<
    INodeCommandCoverage<unknown>,
    'sessionId' | 'sessionIndex' | 'nodeId' | 'pushIndex'
  >,
) {
  if (retained.nodeId === null || retained.pushIndex === null) return;
  const key = sessionSubmissionKey(retained);
  const commandName = originatingCommands.get(key);
  if (commandName === undefined) return;
  originatingCommands.delete(key);
  originatingCommands.set(
    makeNodeCommandId(retained.nodeId, retained.pushIndex),
    commandName,
  );
}
