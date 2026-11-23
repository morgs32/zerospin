import type { IAnyError } from '@zerospin/error';
import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';

import {
  type LabelEvidence,
  type PaymentEvidence,
  type TrackingEvidence,
} from './ShoppingEvidence';

export class ShoppingProviders extends Context.Service<
  ShoppingProviders,
  {
    pay(payload: {
      key: string;
      total: number;
    }): Effect.Effect<typeof PaymentEvidence.Type, IAnyError>;
    createLabel(payload: {
      key: string;
    }): Effect.Effect<typeof LabelEvidence.Type, IAnyError>;
    refresh(payload: {
      key: string;
      labelReference: string;
      sequence: number;
    }): Effect.Effect<typeof TrackingEvidence.Type, IAnyError>;
  }
>()('ShoppingProviders') {}
