import type { MonotonicFactory } from '@zerospin/core/services/MonotonicFactory';
import type { TelemetryCollector } from '@zerospin/logger';
import type { CuidFactory } from '@zerospin/shapes';

export type ISessionRuntimeServices =
  | CuidFactory
  | MonotonicFactory
  | TelemetryCollector;
