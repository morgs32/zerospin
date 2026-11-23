import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { IResourceDbConfig, ITx } from '@zerospin/core/drizzle/types';
import { provideReleaseLayer } from '@zerospin/core/execution/provideReleaseLayer';
import type { IAnyModels } from '@zerospin/core/models/types';
import type { IAnyServiceRelease } from '@zerospin/core/service/types';
import type { IServiceCommandOccurrence } from '@zerospin/system-worker/ServiceChain/types';
import type { IPreparedServiceReplayInput } from '@zerospin/system-worker/serviceReplayAdapter/prepareServiceReplaySource';
import type { IEvaluatedServiceCommand } from '@zerospin/system-worker/ServiceVersionChain/evaluatedServiceCommand';

import type { serviceVersionRepoDbConfig } from './serviceVersionRepoDbConfig.js';
import { executeServiceOccurrence } from './utils/executeServiceOccurrence.js';
import { makeEvaluatedServiceCommand } from './utils/makeEvaluatedServiceCommand.js';
import { readServiceOccurrenceTx } from './utils/readServiceOccurrenceTx.js';
import { restoreEvaluatedCommandTx } from './utils/restoreEvaluatedCommandTx.js';
import { retainEvaluatedCommandTx } from './utils/retainEvaluatedCommandTx.js';

/** Execute one ordered occurrence and commit its output, outcome and progress atomically. */
const materialize = makeTx('ServiceVersionRepo.materializeCommandTx')(
  function* (
    tx: ITx<
      IResourceDbConfig<IAnyModels, typeof serviceVersionRepoDbConfig.tables>
    >,
    props: {
      row: IServiceCommandOccurrence;
      serviceRelease: IAnyServiceRelease;
      key: { systemId: string; serviceName: string; serviceVersion: number };
    } & (
      | {
          mode: 'original';
          retainedCommand?: never;
          preparedReplayInput?: never;
        }
      | {
          mode: 'replay';
          retainedCommand: IEvaluatedServiceCommand | null;
          preparedReplayInput?: IPreparedServiceReplayInput | undefined;
        }
    ),
  ) {
    const { row, serviceRelease, key, mode, retainedCommand } = props;
    const occurrence = yield* readServiceOccurrenceTx(tx, row, key, mode);
    if (occurrence === undefined) return;
    if (mode === 'replay' && retainedCommand !== null) {
      return yield* restoreEvaluatedCommandTx(tx, {
        occurrence,
        serviceRelease,
        retainedCommand,
      });
    }
    const execution = yield* executeServiceOccurrence(
      tx,
      occurrence,
      serviceRelease,
      mode,
      props.preparedReplayInput,
    );
    const command = yield* makeEvaluatedServiceCommand(occurrence, execution);
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
  return provideReleaseLayer(props.serviceRelease, program);
}
