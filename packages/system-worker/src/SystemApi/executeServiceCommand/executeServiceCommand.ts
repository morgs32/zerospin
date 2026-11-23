import { DirectSystemServiceCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import * as Schema from 'effect/Schema';

import { executeDirectServiceCommand } from '../../executeDirectServiceCommand/executeDirectServiceCommand.js';
import { rpcMethod, rpcRequestSchema } from '../../makeRpcApi/makeRpcApi.js';
import { Initialized } from '../Initialized.js';

/** Schema-backed SystemApi.executeServiceCommand boundary; domain work starts after decoding. */
export const executeServiceCommand = rpcMethod({
  name: 'SystemApi.executeServiceCommand',
  schema: rpcRequestSchema(
    Schema.mutable(
      Schema.Tuple([
        Schema.Struct({
          command: DirectSystemServiceCommandSchema,
        }),
      ]),
    ),
  ),
  parseError: {
    code: 'system-api-arguments-invalid',
    prefix: 'SystemApi.executeServiceCommand received invalid arguments',
  },
  linked: true,
})(
  function* (args) {
    const [{ command }] = args;
    const { systemId } = yield* Initialized;
    return yield* executeDirectServiceCommand({ systemId, command });
  },
  {
    onSuccess: success => ({ _tag: 'Success' as const, success }),
    onFailure: failure => ({ _tag: 'Failure' as const, failure }),
  },
);
