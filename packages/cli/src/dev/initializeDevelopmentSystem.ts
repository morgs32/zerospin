import type { ISystemGatewayRpc } from '@zerospin/core/systemApi/ISystemGatewayRpc';
import { getApi } from '@zerospin/core/utils/getApi/getApi';
import {
  isZerospinError,
  makeZerospinError,
  prettyUnknownFailure,
} from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Terminal from 'effect/Terminal';

export const initializeDevelopmentSystem = Effect.fn(
  'initializeDevelopmentSystem',
)(function* (apiUrl: string) {
  const terminal = yield* Terminal.Terminal;
  const systemApi = yield* getApi<ISystemGatewayRpc>(apiUrl)(gatewayApi =>
    gatewayApi.getSystemApi({ zerospinSecretKey: 'sk_dev' }),
  );
  yield* systemApi.acceptSystemSpec().pipe(
    Effect.timeout('30 seconds'),
    Effect.mapError(cause =>
      isZerospinError(cause)
        ? cause
        : makeZerospinError({
            code: 'zerospin-dev-system-spec-check-failed',
            message:
              'The development SystemWorker did not accept its SystemSpec.',
            cause: prettyUnknownFailure(cause),
          }),
    ),
  );
  yield* systemApi.initialize().pipe(
    Effect.mapError(cause =>
      makeZerospinError({
        code: 'zerospin-dev-initialization-failed',
        message: 'Failed to initialize the local System.',
        cause: prettyUnknownFailure(cause),
      }),
    ),
  );
  yield* terminal.display(`Ready on ${apiUrl} (system spec accepted)\n`).pipe(
    Effect.mapError(cause =>
      makeZerospinError({
        code: 'zerospin-dev-wrangler-output-failed',
        message: 'Failed to display development Worker status.',
        cause: prettyUnknownFailure(cause),
      }),
    ),
  );
});
