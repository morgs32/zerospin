import type {
  IAnyError,
  IRecognizedFailure,
  IZerospinError,
} from '@zerospin/error';

export type ISessionStatus =
  | 'idle'
  | 'initializing'
  | 'ready'
  | 'disposed'
  | 'failed';
export type ISessionLifecycleState = {
  status: ISessionStatus;
  failure: IZerospinError | null;
};
export type ISessionFailureReport =
  | { origin: 'command'; error: IRecognizedFailure<IAnyError> }
  | { origin: 'recovery'; error: unknown }
  | { origin: 'session'; error: unknown };
export type ISessionFailureReporter = (report: ISessionFailureReport) => void;
