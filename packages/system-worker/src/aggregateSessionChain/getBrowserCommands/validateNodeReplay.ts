import { makeZerospinError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';

import type { IAggregateBrowserReplayProps } from './getBrowserCommands.js';

/** Validate the private completion prefix before traversing the retained page. */
export const validateNodeReplayPrefix = makeFn(
  'AggregateSessionChain.validateNodeReplayPrefix',
)(function* (props: IAggregateBrowserReplayProps) {
  const { key, nodeId, definition, afterPushIndex, throughAggregateIndex } =
    props;

  if (
    'actorName' in key &&
    nodeId !== undefined &&
    definition !== undefined &&
    definition.claims !== undefined &&
    afterPushIndex !== undefined
  ) {
    const history = props.history;
    if (history === undefined) {
      return yield* makeZerospinError('aggregate-actor-history-required');
    }
    const resolvedThrough = yield* history.getResolvedThrough({
      nodeId,
      sessionName: definition.name,
      actorName: definition.actorName,
      actorVersion: definition.actorVersion,
      claims: definition.claims,
      throughAggregateIndex:
        throughAggregateIndex ?? history.readHead().aggregateIndex,
    });
    if (afterPushIndex > resolvedThrough) {
      return yield* makeZerospinError('node-recovery-prefix-invalid');
    }
  }
});

/** Keep completion contiguity validation in its original traversal position. */
export const validateOwnedCompletionIndex = makeFn(
  'AggregateSessionChain.validateOwnedCompletionIndex',
)(function* (props: { pushIndex: number; pushThrough: number }) {
  const { pushIndex, pushThrough } = props;

  if (pushIndex !== pushThrough + 1) {
    return yield* makeZerospinError('node-outcome-gap');
  }
});
