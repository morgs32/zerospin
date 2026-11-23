import { DirectSystemAggregateCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import * as Schema from 'effect/Schema';

import { executeDirectSystemAggregateCommand } from '../../executeDirectSystemAggregateCommand/executeDirectSystemAggregateCommand.js';
import { rpcMethod, rpcRequestSchema } from '../../makeRpcApi/makeRpcApi.js';
import { Initialized } from '../Initialized.js';

/** Schema-backed SystemApi.executeAggregateCommand boundary; domain work starts after decoding. */
export const executeAggregateCommand = rpcMethod({
  name: 'SystemApi.executeAggregateCommand',
  schema: rpcRequestSchema(
    Schema.mutable(
      Schema.Tuple([
        Schema.Struct({
          command: DirectSystemAggregateCommandSchema,
        }),
      ]),
    ),
  ),
  parseError: {
    code: 'system-api-arguments-invalid',
    prefix: 'SystemApi.executeAggregateCommand received invalid arguments',
  },
  linked: true,
})(
  function* (args) {
    const [{ command }] = args;
    const authResults = yield* Initialized;
    // Admit the original administrative command and recover its canonical result.
    return yield* executeDirectSystemAggregateCommand({
      systemId: authResults.systemId,
      command,
    });
  },
  {
    onSuccess: success => ({ _tag: 'Success' as const, success }),
    onFailure: failure => ({ _tag: 'Failure' as const, failure }),
  },
);
