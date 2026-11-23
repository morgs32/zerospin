import { makeZerospinError } from '@zerospin/error';
import { sql } from 'drizzle-orm';
import * as Effect from 'effect/Effect';

import type { ITx } from '../drizzle/types.ts';
import type { IAnyModels, IEncodedResourceShape } from '../models/types.ts';

import { makeEncodedRowFromResource } from './resourceEnvelope.ts';

/** Rebuild derived model tables only; command and authoritative baseline ownership stays outside. */
export const rebuildOptimisticResourcesTx = Effect.fn(
  'rebuildOptimisticResourcesTx',
)(function* <COMMAND, R>(props: {
  tx: ITx;
  models: IAnyModels;
  resources: readonly IEncodedResourceShape[];
  commands: readonly COMMAND[];
  replay(tx: ITx, command: COMMAND): Effect.Effect<unknown, unknown, R>;
}) {
  const replay = props.replay.bind(props);
  const { tx, models, resources, commands } = props;
  tx.run(sql.raw('PRAGMA defer_foreign_keys = ON'));
  for (const model of Object.values(models)) {
    tx.delete(model.drizzleSchema).run();
  }
  for (const resource of resources) {
    const model = models[resource.modelName];
    if (model === undefined) {
      return yield* makeZerospinError('node-resource-model-invalid');
    }
    tx.insert(model.drizzleSchema)
      .values(makeEncodedRowFromResource(resource, model))
      .run();
  }
  for (const command of commands) yield* replay(tx, command);
});
