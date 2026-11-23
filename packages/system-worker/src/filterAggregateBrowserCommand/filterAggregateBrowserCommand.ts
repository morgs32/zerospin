import type { IAggregateExposedCommand } from '@zerospin/core/aggregateSession/types';
import * as Effect from 'effect/Effect';

/** Select the readable model deltas while retaining the exposed command. */
export const filterAggregateBrowserCommand = Effect.fn(
  'filterAggregateBrowserCommand',
)(function* (props: {
  modelNames: readonly string[];
  output: IAggregateExposedCommand;
}) {
  const { output, modelNames } = props;
  return {
    aggregateIndex: output.aggregateIndex,
    dispositionChainHash: output.dispositionChainHash,
    id: output.id,
    commandName: output.commandName,
    failure: output.failure,
    delta: {
      upserted: output.delta.upserted.filter(resource =>
        modelNames.includes(resource.modelName),
      ),
      deleted: output.delta.deleted.filter(resource =>
        modelNames.includes(resource.modelName),
      ),
    },
  };
});
