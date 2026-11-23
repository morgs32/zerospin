import type {
  IAggregateSession,
  IAggregateSessionDefinition,
  ISessionId,
  IAggregateSessionSqliteDb,
} from '@zerospin/core/aggregateSession/types';
import type { ILiveRelationalQuery } from '@zerospin/core/drizzle/types';
import type {
  IServiceSession,
  IServiceSessionDefinition,
  IServiceSessionSqliteDb,
} from '@zerospin/core/serviceSession/types';
import type { IResult, IZerospinErrorJson } from '@zerospin/error';
import type { ITelemetryBatch } from '@zerospin/logger';

import type { TriggerPositionSchema } from './TriggerPositionSchema.js';

export type IModifierKey = 'Alt' | 'Control' | 'Meta' | 'Shift' | 'CtrlOrMeta';
export type IKeyboardKey = IModifierKey | (string & {});
export type IZerospinDevtoolsTheme = 'light' | 'dark';

export type ITriggerPosition = typeof TriggerPositionSchema.Type;

export type IZerospinDevtoolsConfig = {
  defaultOpen?: boolean;
  hideUntilHover?: boolean;
  position?: ITriggerPosition;
  panelLocation?: 'top' | 'bottom';
  openHotkey?: readonly IKeyboardKey[];
  theme?: IZerospinDevtoolsTheme;
  triggerHidden?: boolean;
};

export type IDevtoolsStore = {
  settings: {
    defaultOpen: boolean;
    hideUntilHover: boolean;
    position: ITriggerPosition;
    panelLocation: 'top' | 'bottom';
    openHotkey: readonly IKeyboardKey[];
    theme: IZerospinDevtoolsTheme;
    triggerHidden: boolean;
  };
  state: {
    height: number;
    persistOpen: boolean;
  };
};

export interface IDevtoolsAggregateSessionEntry {
  readonly sessionId: ISessionId;
  readonly sessionDefinition: IAggregateSessionDefinition;
  readonly subscribe: (listener: () => void) => () => void;
  readonly getCommandDb: () => Pick<
    IAggregateSessionSqliteDb,
    'select' | '$client'
  > | null;
  readonly getClaims: () => Readonly<Record<string, unknown>> | null;
  readonly getInitialized: () => object | null;
  readonly getNodeState: () => ReturnType<
    IAggregateSession['store']['getState']
  >['nodeState'];
  readonly getAggregateIndex: () => number | null;
  readonly getPushIndex: () => number | null;
  readonly getTelemetry: () => ITelemetryBatch;
  readonly getModelAttributes: (
    modelName: string,
  ) => Readonly<Record<string, unknown>> | undefined;
  readonly getModelQuery: (modelName: string) => ILiveRelationalQuery;
  readonly clearTelemetry: () => void;
  readonly getPushPaused?: () => Promise<IResult<boolean, IZerospinErrorJson>>;
  readonly setPushPaused?: (props: {
    pushPaused: boolean;
  }) => Promise<IResult<void, IZerospinErrorJson>>;
  readonly pushNow?: () => Promise<
    IResult<
      | Readonly<{ status: 'empty' }>
      | Readonly<{ status: 'pushed' }>
      | Readonly<{
          status: 'retry-exhausted';
          failure: IZerospinErrorJson;
        }>,
      IZerospinErrorJson
    >
  >;
}

/**
 * Generic-erased, read-only service session view retained by DevTools.
 * Every callback closes over the original typed service session, so the
 * heterogeneous registry never widens its invariant Zustand StoreApi.
 */
export interface IDevtoolsServiceSessionEntry {
  readonly sessionId: ISessionId;
  readonly serviceName: string;
  readonly actorName: string;
  readonly sessionName: string;
  readonly modelNames: readonly string[];
  readonly subscribe: (listener: () => void) => () => void;
  readonly getCommandDb: () => Pick<
    IServiceSessionSqliteDb,
    'query' | 'select' | '$client'
  > | null;
  readonly getClaims: () => Readonly<Record<string, unknown>> | null;
  readonly getInitialized: () => object | null;
  readonly getNodeState: () => ReturnType<
    IServiceSession['store']['getState']
  >['nodeState'];

  readonly getTelemetry: () => ITelemetryBatch;
  readonly getServiceIndex: () => number | null;
  readonly getModelAttributes: (
    modelName: string,
  ) => Readonly<Record<string, unknown>> | undefined;
  readonly readModelRows: (modelName: string) => unknown;
  readonly clearTelemetry: () => void;
}

export type IZerospinDevtoolsStoreState = {
  readonly aggregateSessionsById: ReadonlyMap<
    ISessionId,
    IDevtoolsAggregateSessionEntry
  >;
  readonly serviceSessionsById: ReadonlyMap<
    ISessionId,
    IDevtoolsServiceSessionEntry
  >;
  addAggregateSession: <D extends IAggregateSessionDefinition, SERVICES>(
    entry: {
      readonly sessionId: ISessionId;
      readonly session: IAggregateSession<D, SERVICES>;
    } & Pick<
      IDevtoolsAggregateSessionEntry,
      'getPushPaused' | 'setPushPaused' | 'pushNow'
    >,
  ) => void;
  removeAggregateSession: (sessionId: ISessionId) => void;
  addServiceSession: <DEFINITION extends IServiceSessionDefinition>(entry: {
    readonly sessionId: ISessionId;
    readonly session: IServiceSession<DEFINITION>;
  }) => void;
  removeServiceSession: (sessionId: ISessionId) => void;
};
