import { makeZerospinError, mapParseError } from '@zerospin/error';
import * as Clock from 'effect/Clock';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { resolveAgentCommand } from '../../agent/makeAgentCommandRef.ts';
import { applyOperationTx } from '../../contracts/applyOperationTx.ts';
import { DownAdapterRefused } from '../../contracts/DownAdapterRefused.ts';
import { encodePayload } from '../../contracts/encodePayload.ts';
import {
  evaluatePreparedContract,
  isOrdinaryContract,
} from '../../contracts/make/constructContractRelease.ts';
import { makeActorContractReadDb } from '../../contracts/make/makeActorContractReadDb.ts';
import { makeContractReadDb } from '../../contracts/make/makeContractReadDb.ts';
import { prepareAggregateInvocation } from '../../contracts/prepare/prepareAggregateInvocation.ts';
import { prepareServiceInvocation } from '../../contracts/prepare/prepareServiceInvocation.ts';
import { encodeContractResult } from '../../contracts/resultCodec.ts';
import type {
  IAggregateCommand,
  IContractFailure,
  IContractRelease,
  IEncodedCommand,
  IServiceCommand,
} from '../../contracts/types.ts';
import { validateAggregateCommand } from '../../contracts/validateAggregateCommand.ts';
import { validateServiceCommand } from '../../contracts/validateServiceCommand.ts';
import { makeTx } from '../../drizzle/make/makeTx.ts';
import type { ITx } from '../../drizzle/types.ts';
import type { ISystem } from '../../system/types.ts';
import { getByKeyOrThrow } from '../../utils/getByKeyOrThrow.ts';

import type { IHarnessStore } from './executionTypes.ts';
import { prepareHarnessOutput } from './prepareHarnessOutput.ts';
import type { ISystemHarnessCommand } from './types.ts';

/** Resolve an explicit invocation grant and decode the captured Actor claims. */
const resolveHarnessPrincipal = Effect.fn('systemHarness.resolvePrincipal')(
  function* (
    store: IHarnessStore,
    command: ISystemHarnessCommand,
    contract: IContractRelease,
    framework: boolean,
    system: ISystem,
  ) {
    const forbidden = () =>
      makeZerospinError({
        code: 'system-harness-command-forbidden',
        message: `No ${command.kind} grant for ${command.commandName}@${command.contractVersion}`,
      });
    if (command.kind === 'actor') {
      const actor = store.release.actors[command.actorName];
      if (
        actor === undefined ||
        actor.version !== command.actorVersion ||
        actor.contracts[command.commandName] !== contract ||
        !isOrdinaryContract(contract)
      ) {
        return yield* forbidden();
      }
      const claims = yield* Schema.decodeUnknownEffect(
        actor.identity.claimsSchema,
      )(command.claims, { onExcessProperty: 'error' }).pipe(
        mapParseError({
          code: 'command-claims-unsupported',
          prefix: 'Invalid harness Actor claims',
        }),
      );
      if (
        store.kind === 'aggregate' &&
        claims.aggregateId !== store.aggregateId
      ) {
        return yield* makeZerospinError('aggregate-command-scope-mismatch');
      }
      return { actor, claims };
    }
    if (command.kind === 'agent') {
      const agent =
        store.kind === 'aggregate'
          ? system.aggregateAgents[store.release.name]?.[command.agentName]
              ?.releases[command.agentVersion]
          : system.serviceAgents[store.release.name]?.[command.agentName]
              ?.releases[command.agentVersion];
      if (
        agent === undefined ||
        agent.agentVersion !== command.agentVersion ||
        ('aggregateVersion' in agent
          ? agent.aggregateVersion
          : agent.serviceVersion) !== store.release.version ||
        resolveAgentCommand<IContractRelease>(
          agent.contracts[command.commandName],
          store.release.contracts,
        ) !== contract
      ) {
        return yield* forbidden();
      }
    } else if (command.kind === 'system') {
      if (
        (store.release.system[command.commandName] !== contract &&
          !framework) ||
        !isOrdinaryContract(contract) ||
        contract.claims !== undefined
      ) {
        return yield* forbidden();
      }
    } else {
      return yield* forbidden();
    }
    return { actor: undefined, claims: undefined };
  },
);

const evaluateAggregate = Effect.fn('evaluateHarnessAggregateCommand')(
  function* (
    tx: ITx,
    store: Extract<IHarnessStore, { kind: 'aggregate' }>,
    command: IAggregateCommand,
    framework: boolean,
    system: ISystem,
  ) {
    const contract = yield* getByKeyOrThrow({
      record: store.release.contracts,
      key: command.commandName,
      recordKind: 'aggregate contracts',
    });
    if (contract.version !== command.contractVersion) {
      return yield* makeZerospinError('contract-payload-version-unsupported');
    }
    const { actor, claims } = yield* resolveHarnessPrincipal(
      store,
      command,
      contract,
      framework,
      system,
    );
    if (!isOrdinaryContract(contract)) {
      return yield* makeZerospinError('external-contract-kind-mismatch');
    }
    const invocation = yield* prepareAggregateInvocation({
      contract,
      command,
      claims,
    });
    yield* validateAggregateCommand({
      aggregateRelease: store.release,
      actorName: actor?.name,
      contract,
      db: tx,
      command: invocation.command,
      payload: invocation.payload,
      claims,
    });
    const db =
      actor === undefined || command.kind !== 'actor'
        ? makeContractReadDb({ db: tx, models: store.release.models })
        : makeActorContractReadDb({
            db: tx,
            actor,
            identity: yield* Schema.decodeUnknownEffect(
              actor.identity.identitySchema,
            )(command.claims).pipe(
              mapParseError({
                code: 'command-claims-unsupported',
                prefix: 'Invalid harness Actor identity',
              }),
            ),
          });
    const evaluated = yield* evaluatePreparedContract(invocation, db);
    return {
      ...evaluated,
      payload: invocation.payload,
      claims: invocation.claims,
      encodedResult: yield* encodeContractResult(contract, evaluated.result),
    };
  },
);

const evaluateService = Effect.fn('evaluateHarnessServiceCommand')(function* (
  tx: ITx,
  store: Extract<IHarnessStore, { kind: 'service' }>,
  command: IServiceCommand,
  framework: boolean,
  system: ISystem,
) {
  const contract = yield* getByKeyOrThrow({
    record: store.release.contracts,
    key: command.commandName,
    recordKind: 'service contracts',
  });
  if (contract.version !== command.contractVersion) {
    return yield* makeZerospinError('contract-payload-version-unsupported');
  }
  const { actor, claims } = yield* resolveHarnessPrincipal(
    store,
    command,
    contract,
    framework,
    system,
  );
  if (!isOrdinaryContract(contract)) {
    return yield* makeZerospinError('external-contract-kind-mismatch');
  }
  const invocation = yield* prepareServiceInvocation({
    contract,
    command,
    claims,
  });
  yield* validateServiceCommand({
    serviceRelease: store.release,
    actorName: actor?.name,
    contract,
    db: tx,
    command: invocation.command,
    payload: invocation.payload,
    claims,
  });
  const db =
    actor === undefined || command.kind !== 'actor'
      ? makeContractReadDb({ db: tx, models: store.release.models })
      : makeActorContractReadDb({
          db: tx,
          actor,
          identity: yield* Schema.decodeUnknownEffect(
            actor.identity.identitySchema,
          )(command.claims).pipe(
            mapParseError({
              code: 'command-claims-unsupported',
              prefix: 'Invalid harness Actor identity',
            }),
          ),
        });
  const evaluated = yield* evaluatePreparedContract(invocation, db);
  return {
    ...evaluated,
    payload: invocation.payload,
    claims: invocation.claims,
    encodedResult: yield* encodeContractResult(contract, evaluated.result),
  };
});

/** Evaluate, freeze emitted work and apply every model operation in one synchronous transaction. */
const executeCommandTx = makeTx('executeHarnessCommand')(function* (
  tx: ITx,
  props: {
    system: ISystem;
    store: IHarnessStore;
    command: ISystemHarnessCommand;
    framework: boolean;
  },
) {
  const { system, store, command, framework } = props;
  const evaluated = yield* Effect.gen(function* (): Effect.fn.Return<
    Effect.Success<ReturnType<typeof evaluateAggregate>>,
    IContractFailure | typeof DownAdapterRefused,
    unknown
  > {
    if (store.kind === 'aggregate' && 'aggregateName' in command) {
      return yield* evaluateAggregate(tx, store, command, framework, system);
    }
    if (store.kind === 'service' && 'serviceName' in command) {
      return yield* evaluateService(tx, store, command, framework, system);
    }
    return yield* makeZerospinError('contract-family-mismatch');
  }).pipe(
    Effect.mapError(failure =>
      failure === DownAdapterRefused
        ? makeZerospinError('contract-down-adapter-refused')
        : failure,
    ),
  );
  const prepared = yield* prepareHarnessOutput({
    store,
    command,
    operations: evaluated.operations,
  });
  const appliedAt = new Date(yield* Clock.currentTimeMillis);
  const work = [...prepared.work];
  for (const { operation } of prepared.modelOperations) {
    yield* applyOperationTx({
      tx,
      operation,
      appliedAt,
    });
  }
  const extension =
    store.kind === 'aggregate'
      ? store.release.extensions[command.commandName]
      : undefined;
  if (
    extension !== undefined &&
    store.kind === 'aggregate' &&
    'aggregateName' in command
  ) {
    const operations = yield* extension.evaluate({
      aggregateId: command.aggregateId,
      command,
      payload: evaluated.payload,
      claims: evaluated.claims,
      db: makeContractReadDb({ db: tx, models: store.release.models }),
    });
    const extensionOutput = yield* prepareHarnessOutput({
      store,
      command,
      operations,
      extension: true,
    });
    for (const { operation } of extensionOutput.modelOperations) {
      yield* applyOperationTx({ tx, operation, appliedAt });
    }
    work.push(...extensionOutput.work);
  }
  return {
    value: evaluated.result,
    encodedResult: evaluated.encodedResult,
    work,
  };
});

/** Keep decoded SDK inputs at the interface and freeze command identity and original outcomes. */
export const encodeHarnessCommand = Effect.fn('encodeHarnessCommand')(
  function* (store: IHarnessStore, command: ISystemHarnessCommand) {
    const entry = store.release.contracts[command.commandName];
    if (entry === undefined) {
      return yield* makeZerospinError('system-harness-contract-unregistered');
    }
    const contract = entry;
    const payload = yield* encodePayload(contract, {
      version: command.contractVersion,
      payload: command.payload,
    });
    return { ...command, payload };
  },
);

export function executeHarnessCommand(props: {
  system: ISystem;
  store: IHarnessStore;
  command: ISystemHarnessCommand;
  framework: boolean;
}) {
  return executeCommandTx(props.store.db, props);
}
