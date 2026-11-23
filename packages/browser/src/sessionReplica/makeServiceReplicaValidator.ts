import type { ISessionId } from '@zerospin/core/aggregateSession/types';
import type { IServiceContractRelease } from '@zerospin/core/contracts/types';
import { rehearse } from '@zerospin/core/drizzle/make/makeTx';
import { MonotonicFactory } from '@zerospin/core/services/MonotonicFactory';
import { evaluateServiceSessionCommandTx } from '@zerospin/core/serviceSession/evaluateServiceSessionCommandTx';
import type {
  IServiceSession,
  IServiceSessionDefinition,
  IServiceSessionDrizzleDb,
} from '@zerospin/core/serviceSession/types';
import { makeZerospinError } from '@zerospin/error';
import { CuidFactory } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

/** Guard this replica's identity and rehearse commands with disposable IDs and rolled-back writes. */
export function makeServiceReplicaValidator<
  D extends IServiceSessionDefinition,
>(props: {
  session: IServiceSession<D, D['models'], unknown>;
  sessionId: ISessionId;
  db: IServiceSessionDrizzleDb<D['models']>;
  definition: D;
  current(): boolean;
  getEncodedClaims(): Readonly<Record<string, unknown>>;
}) {
  const { session, sessionId, db, definition, current, getEncodedClaims } =
    props;
  const assertCurrent = () =>
    Effect.gen(function* () {
      const initialized = session.store.getState().initialized;
      if (
        !current() ||
        initialized === null ||
        initialized.sessionId !== sessionId ||
        initialized.db !== db
      ) {
        return yield* makeZerospinError('service-session-not-ready');
      }
      return initialized;
    });
  const validate = (input: {
    contract: IServiceContractRelease;
    payload: unknown;
  }) =>
    Effect.gen(function* () {
      const { contract, payload } = input;
      yield* assertCurrent();
      if (definition.contracts[contract.commandName] !== contract) {
        return yield* makeZerospinError('service-session-contract-unavailable');
      }
      let disposableId = 0;
      yield* rehearse(db, tx =>
        evaluateServiceSessionCommandTx({
          tx,
          definition,
          contract,
          payload,
          claims: Schema.decodeUnknownSync(definition.claimsSchema)(
            getEncodedClaims(),
          ),
        }),
      ).pipe(
        Effect.provideService(CuidFactory, () =>
          Effect.sync(() => 'validation' + ++disposableId),
        ),
        Effect.provideService(MonotonicFactory, () =>
          Effect.sync(() => 'validation' + ++disposableId),
        ),
      );
    });
  return { assertCurrent, validate };
}
