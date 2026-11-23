import type { IAggregateNodeSnapshot } from '@zerospin/core/AggregateNode/AggregateNode';
import type { IBrowserCommand } from '@zerospin/core/contracts/BrowserCommandSchema';
import type { IFailure } from '@zerospin/core/contracts/failureCodec';
import type { ISessionFailureReporter } from '@zerospin/core/sessionFailure/types';
import {
  ensureZerospinError,
  makeZerospinError,
  type IAnyError,
  type IRecognizedFailure,
} from '@zerospin/error';

type IRecognizedCommandFailure = IRecognizedFailure<IAnyError>;

/** A lifetime reports each originating command failure once and suppresses repeated blocked-state notices. */
export function makeSessionFailureObserver(props: {
  isCurrent(): boolean;
  originatingCommands: Map<string, string>;
  reportFailure: ISessionFailureReporter;
  recognizeFailure(
    commandName: string,
    failure: IFailure,
  ): IRecognizedCommandFailure;
}) {
  const { isCurrent, originatingCommands, reportFailure, recognizeFailure } =
    props;
  let blockedNotified = false;
  const notifyCommandFailure = (event: {
    commandId: string;
    commandName: string;
    failure: IFailure;
  }) => {
    const { commandId, commandName, failure } = event;
    if (!isCurrent() || originatingCommands.get(commandId) !== commandName) {
      return;
    }
    let recognized: IRecognizedCommandFailure;
    try {
      recognized = recognizeFailure(commandName, failure);
    } catch (error) {
      reportFailure({ origin: 'session', error });
      return;
    }
    originatingCommands.delete(commandId);
    reportFailure({ origin: 'command', error: recognized });
  };
  return {
    recoveryWarning: (event: { error: unknown }) => {
      if (!isCurrent()) return;
      reportFailure({
        origin: 'recovery',
        error: ensureZerospinError({
          code: 'node-recovery-work-unconfirmed',
          error: event.error,
        }),
      });
    },
    observeCommand: (
      command: Pick<IBrowserCommand, 'commandName' | 'failure'> & {
        id: string;
      },
    ) => {
      if (originatingCommands.get(command.id) !== command.commandName) return;
      if (command.failure !== null) {
        notifyCommandFailure({
          commandId: command.id,
          commandName: command.commandName,
          failure: command.failure,
        });
      } else {
        originatingCommands.delete(command.id);
      }
    },
    observeNodeState: (state: IAggregateNodeSnapshot['state']) => {
      if (!isCurrent()) return;
      if (!state.blockedWork) {
        blockedNotified = false;
        return;
      }
      if (state.localAvailability !== 'failed') {
        if (state.authentication === 'signed-out') return;
        if (state.admissionRejection != null) {
          notifyCommandFailure(state.admissionRejection);
          return;
        }
      }
      if (blockedNotified || !state.failure) return;
      if (state.localAvailability === 'failed') {
        blockedNotified = true;
        reportFailure({
          origin: 'session',
          error: makeZerospinError(state.failure),
        });
      } else if (state.authentication === 'rejected') {
        blockedNotified = true;
        reportFailure({
          origin: 'session',
          error: makeZerospinError(state.failure),
        });
      } else if (
        state.localAvailability === 'available' &&
        state.synchronization === 'blocked'
      ) {
        blockedNotified = true;
        reportFailure({
          origin: 'session',
          error: makeZerospinError(state.failure),
        });
      }
    },
    sharedWorkerConnectionFailed: (event: { error: unknown }) => {
      if (!isCurrent() || blockedNotified) return;
      blockedNotified = true;
      reportFailure({ origin: 'session', error: event.error });
    },
  };
}
