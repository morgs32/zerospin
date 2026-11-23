import type { INodeRetention } from '@zerospin/core/Node/NodeCommandCoverage';
import { mapParseError } from '@zerospin/error';
import { makeFn, makeRpcEnvelope } from '@zerospin/logger';
import { RpcTarget } from 'capnweb';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import {
  nodeRpcErrorFor,
  snapshotFailureCodes,
} from '../Node/nodeRpcErrorFor.ts';

export const makeOutboxSubscriber = <ROW>(props: {
  schema: Schema.ConstraintDecoder<ROW>;
  check(): void;
  receive(rows: readonly ROW[]): Promise<readonly INodeRetention[]>;
}) => {
  const { schema, check, receive } = props;
  const pageSchema = Schema.Array(schema);
  const failure = nodeRpcErrorFor([
    'node-command-invalid',
    'node-command-input-conflict',
    'outbox-source-replaced',
    'node-signed-out',
    'node-tab-detached',
    ...snapshotFailureCodes,
    'node-staging-blocked',
    'node-command-identity-mismatch',
    'node-index-invalid',
    'standalone-capability-stale',
  ]);
  class OutboxSubscriber extends RpcTarget {
    async receive(input: unknown) {
      return Effect.runPromise(
        makeFn('OutboxSubscriber.receive')(
          function* () {
            yield* Effect.try({ try: check, catch: failure });
            const rows = yield* Schema.decodeUnknownEffect(pageSchema)(input, {
              onExcessProperty: 'error',
            }).pipe(
              mapParseError({
                code: 'node-command-invalid',
                prefix: 'Invalid OutboxSubscriber.receive command page',
              }),
            );
            return yield* Effect.tryPromise({
              try: async () => {
                check();
                const receipt = await receive(rows);
                check();
                return receipt;
              },
              catch: failure,
            });
          },
          effect => makeRpcEnvelope(effect),
        )(),
      );
    }
  }
  return new OutboxSubscriber();
};
