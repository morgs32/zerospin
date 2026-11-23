import { makeFn } from '@zerospin/logger';

import type { AggregateNode } from '../AggregateNode/AggregateNode.ts';

import { executeStandaloneCommand } from './executeStandaloneCommand.ts';
import { executeStandaloneNext } from './executeStandaloneNext.ts';

/** Drain retained accepted commands through the real Node transaction and authored executor. */
export const drainStandaloneCommands = makeFn(
  'StandaloneNode.drainStandaloneCommands',
)(function* (
  props: Omit<
    Parameters<typeof executeStandaloneCommand>[0],
    'command' | 'checkpoint'
  > & { node: AggregateNode; manual?: boolean; expectedNodeId?: string },
) {
  const {
    node,
    sessionDefinition,
    db,
    readDb,
    aggregateId,
    manual,
    expectedNodeId,
  } = props;
  let executed = false;
  for (;;) {
    const appended = yield* executeStandaloneNext({
      node,
      ...(manual === undefined ? {} : { manual }),
      ...(expectedNodeId === undefined ? {} : { expectedNodeId }),
      execute: (command, checkpoint) =>
        executeStandaloneCommand({
          sessionDefinition,
          db,
          readDb,
          aggregateId,
          command,
          checkpoint,
        }),
    });
    if (!appended) return executed;
    executed = true;
    if (manual) return true;
  }
});
