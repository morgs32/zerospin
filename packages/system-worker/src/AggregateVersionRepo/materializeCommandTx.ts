import type { IAnyAggregateRelease } from '@zerospin/core/aggregate/types';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { IResourceDbConfig, ITx } from '@zerospin/core/drizzle/types';
import { provideReleaseLayer } from '@zerospin/core/execution/provideReleaseLayer';
import type { IAnyModels } from '@zerospin/core/models/types';

import type { IAdmittedAggregateCommand } from '../AggregateChain/types.js';
import type { IEvaluatedAggregateCommand } from '../AggregateVersionChain/evaluatedAggregateCommand.js';

import type { aggregateVersionRepoDbConfig } from './aggregateVersionRepoDbConfig.js';
import { executeAggregateCommandTx } from './utils/executeAggregateCommandTx.js';
import { makeEvaluatedAggregateCommand } from './utils/makeEvaluatedAggregateCommand.js';
import { readAggregateCommandTx } from './utils/readAggregateCommandTx.js';
import type { IPreparedAggregateReplayPayload } from './utils/resolveAggregateExecution.js';
import { restoreEvaluatedCommandTx } from './utils/restoreEvaluatedCommandTx.js';
import { retainEvaluatedCommandTx } from './utils/retainEvaluatedCommandTx.js';

/** Execute one ordered admitted command and commit its output, outcome and progress atomically. */
const materialize = makeTx('AggregateVersionRepo.materializeCommandTx')(
  function* (
    tx: ITx<
      IResourceDbConfig<IAnyModels, typeof aggregateVersionRepoDbConfig.tables>
    >,
    props: {
      row: IAdmittedAggregateCommand;
      aggregateRelease: IAnyAggregateRelease;
      key: {
        systemId: string;
        aggregateId: string;
        aggregateName: string;
        aggregateVersion: number;
      };
    } & (
      | {
          mode: 'original';
          retainedCommand?: never;
          preparedReplayPayload?: never;
        }
      | {
          mode: 'replay';
          retainedCommand: IEvaluatedAggregateCommand | null;
          preparedReplayPayload?: IPreparedAggregateReplayPayload | undefined;
        }
    ),
  ) {
    const {
      row,
      aggregateRelease,
      key,
      mode,
      retainedCommand,
      preparedReplayPayload,
    } = props;
    const commandContext = yield* readAggregateCommandTx(tx, row, key, mode);
    if (commandContext === undefined) return;
    if (mode === 'replay' && retainedCommand !== null) {
      return yield* restoreEvaluatedCommandTx(tx, {
        commandContext,
        aggregateRelease,
        retainedCommand,
      });
    }
    const execution = yield* executeAggregateCommandTx(
      tx,
      commandContext,
      aggregateRelease,
      mode,
      preparedReplayPayload,
    );
    const command = yield* makeEvaluatedAggregateCommand(
      commandContext,
      execution,
    );
    return yield* retainEvaluatedCommandTx(tx, command);
  },
);

export function materializeCommandTx(...args: Parameters<typeof materialize>) {
  const [, props] = args;
  const program = materialize(...args);
  if (
    props.row.payload === null ||
    (props.mode === 'replay' && props.retainedCommand !== null)
  ) {
    return program;
  }
  return provideReleaseLayer(props.aggregateRelease, program);
}
