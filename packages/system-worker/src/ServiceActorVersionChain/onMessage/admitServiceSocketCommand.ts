import type { IServiceSocketClientMessage } from '@zerospin/core/serviceSession/ServiceSocketProtocolSchema';
import { encodeRpcOutcome } from '@zerospin/core/utils/encodeRpcOutcome';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import { isEqual } from 'es-toolkit';
import type { Connection } from 'partyserver';

import { getServiceChain } from '../../ServiceChain/getServiceChain.js';
import type { IServiceProjectionKey } from '../../serviceProjection/resolveServiceActorView.js';
import type { IServiceConnectionState } from '../connectionState.js';

/** Claim before admission suspension, validate its complete admitted command, and release on every exit. */
export const admitServiceSocketCommand = Effect.fn(
  'ServiceSession.admitSocketCommand',
)(function* (props: {
  connection: Connection<IServiceConnectionState>;
  key: IServiceProjectionKey;
  contractVersions: Readonly<Record<string, number>>;
  command: Extract<
    IServiceSocketClientMessage,
    { type: 'pushServiceCommand' }
  >['command'];
}) {
  const { connection, key, contractVersions, command } = props;
  const state = connection.state;
  if (
    state?.phase !== 'live' ||
    state.admissionCommandId !== null ||
    connection.readyState !== 1
  ) {
    return yield* makeZerospinError('service-command-phase-invalid');
  }
  connection.setState({ ...state, admissionCommandId: command.id });
  const ownsClaim = () =>
    connection.readyState === 1 &&
    connection.state?.phase === 'live' &&
    connection.state.admissionCommandId === command.id &&
    connection.state.nodeId === state.nodeId;
  const result = yield* Effect.gen(function* () {
    const { kind, nodeId, sessionName, pushIndex } = command;
    if (
      kind !== 'actor' ||
      nodeId !== state.nodeId ||
      command.actorName !== key.actorName ||
      command.actorVersion !== key.actorVersion ||
      sessionName !== state.sessionName ||
      !isEqual(command.claims, state.claims) ||
      command.serviceName !== key.serviceName ||
      command.serviceVersion !== key.serviceVersion ||
      !Object.hasOwn(contractVersions, command.commandName) ||
      contractVersions[command.commandName] !== command.contractVersion
    ) {
      return yield* makeZerospinError('service-command-capability-mismatch');
    }
    const chain = yield* getServiceChain({ key });
    const admittedCommands = yield* Effect.promise(() =>
      chain.admitServiceCommands({ commands: [command] }),
    ).pipe(Effect.flatMap(readRpcEnvelope));
    const admittedCommand = admittedCommands[0];
    if (
      admittedCommands.length !== 1 ||
      admittedCommand === undefined ||
      !Number.isSafeInteger(admittedCommand.serviceIndex) ||
      admittedCommand.serviceIndex < 1
    ) {
      return yield* makeZerospinError('service-admission-receipt-invalid');
    }
    const { serviceIndex: _serviceIndex, ...immutable } = admittedCommand;
    if (admittedCommand.kind !== 'actor' || !isEqual(immutable, command)) {
      return yield* makeZerospinError('service-admission-receipt-invalid');
    }
    return {
      id: command.id,
      pushIndex,
    };
  }).pipe(
    encodeRpcOutcome,
    Effect.tap(result =>
      Effect.sync(() => {
        if (!ownsClaim()) {
          return;
        }
        connection.send(
          JSON.stringify(
            result._tag === 'Success'
              ? { type: 'serviceCommandAdmission', ...result.success }
              : {
                  type: 'serviceCommandAdmissionFailed',
                  id: command.id,
                  failure: result.failure,
                },
          ),
        );
      }),
    ),
    Effect.ensuring(
      Effect.sync(() => {
        if (ownsClaim()) {
          connection.setState({ ...state, admissionCommandId: null });
        }
      }),
    ),
  );
  return result;
});
