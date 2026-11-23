import {
  isZerospinError,
  makeZerospinError,
  type IAnyError,
} from '@zerospin/error';
import { decodeSync, makeShapeCodecs } from '@zerospin/shapes';
import * as Cause from 'effect/Cause';
import * as Clock from 'effect/Clock';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';

import { buildExternalContinuation } from '../../contracts/externalExecution/buildExternalContinuation.ts';
import { executeExternalRequest } from '../../contracts/externalExecution/executeExternalRequest.ts';
import { makeExternalOutcome } from '../../contracts/externalExecution/makeExternalOutcome.ts';
import type { makeOwnerReleaseLayerProvider } from '../../execution/provideReleaseLayer.ts';

import type { IHarnessWork } from './executionTypes.ts';
import type { IHarnessExecutor } from './makeHarnessExecutor.ts';

/** Run the real request and execute the ordinary continuation from its recorded observation. */
export const runHarnessExternal = Effect.fn('systemHarness.runExternal')(
  function* (props: {
    work: Extract<IHarnessWork, { kind: 'external' }>;
    executor: IHarnessExecutor;
    countExecution: (invocation: string) => Effect.Effect<void, IAnyError>;
    provideReleaseLayer: ReturnType<typeof makeOwnerReleaseLayerProvider>;
  }) {
    const { work, executor, countExecution, provideReleaseLayer } = props;
    yield* countExecution(work.contract.commandName);
    const payload = yield* decodeSync(
      makeShapeCodecs(work.contract.payload).portableCompleteCodec,
      work.payload,
      { onExcessProperty: 'error' },
    ).pipe(
      Effect.mapError(() => makeZerospinError('external-payload-invalid')),
    );
    const request = yield* provideReleaseLayer(
      work.store.release,
      Effect.exit(
        executeExternalRequest({ external: work.contract.external, payload }),
      ),
    );
    if (Exit.isFailure(request)) {
      const reason = request.cause.reasons[0];
      if (
        request.cause.reasons.length !== 1 ||
        reason === undefined ||
        !Cause.isFailReason(reason) ||
        !(
          Cause.isTimeoutError(reason.error) ||
          (isZerospinError(reason.error) &&
            reason.error.code === 'external-request-failed')
        )
      ) {
        return yield* Effect.failCause(request.cause);
      }
    }
    const externalOutcome = makeExternalOutcome(
      request,
      new Date(yield* Clock.currentTimeMillis),
    );
    const continuation = yield* provideReleaseLayer(
      work.store.release,
      buildExternalContinuation(work.store.release, {
        externalContractName: work.contract.commandName,
        externalContractVersion: work.contract.version,
        payload: work.payload,
        externalOutcome,
      }),
    );
    return yield* executor.executeContinuation(work.store, {
      ...continuation,
      id: work.id,
    });
  },
);
