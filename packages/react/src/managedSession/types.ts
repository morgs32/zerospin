import type { IBrowserSessionInitializeOptions } from '@zerospin/browser/browserSession/types';
import type { IAggregateSessionDefinition } from '@zerospin/core/aggregateSession/types';
import type { IServiceSessionDefinition } from '@zerospin/core/serviceSession/types';
import type {
  ISessionFailureReporter,
  ISessionLifecycleState,
} from '@zerospin/core/sessionFailure/types';
import type { IZerospinError } from '@zerospin/error';

export type ISessionDefinition =
  | IAggregateSessionDefinition
  | IServiceSessionDefinition;
export type ISessionOptions<OPTIONS> =
  | OPTIONS
  | null
  | undefined
  | false
  | ''
  | (() => OPTIONS | null | undefined | false | '');
export type ISessionObservers = { onFailure?: (error: IZerospinError) => void };
export type ISessionState = {
  readonly isEnabled: boolean;
  readonly isReady: boolean;
  readonly error: IZerospinError | null;
  readonly retry: () => void;
};
export type IManagedFacade = {
  readonly sessionDefinition: ISessionDefinition;
  readonly reportFailure: ISessionFailureReporter;
  readonly store: {
    subscribe(listener: () => void): () => void;
    getState(): ISessionLifecycleState & { initialized: object | null };
  };
  initialize(options?: IBrowserSessionInitializeOptions): Promise<void>;
  dispose(): Promise<void>;
  clearAuthentication?(): Promise<void>;
};

export const sessionAttempt = Symbol('managedSessionAttempt');
export type IManagedSession<SESSION extends IManagedFacade = IManagedFacade> =
  ISessionState & {
    readonly definition: SESSION['sessionDefinition'];
    readonly session: SESSION | null;
    readonly [sessionAttempt]: {
      readonly session: SESSION | null;
      readonly generation: number;
      readonly clearAuthentication: () => Promise<void>;
    };
  };
