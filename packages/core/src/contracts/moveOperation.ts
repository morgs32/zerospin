import type {
  IInferIdFromAbbreviation,
  IPrimitiveDescriptorDecoded,
  IReference,
  PrimitiveKind,
} from '@zerospin/shapes';

import type { IModel } from '../models/types.ts';

export type IMoveProperty<MODEL extends IModel> = {
  [KEY in keyof MODEL['attributes'] & string]: MODEL['attributes'][KEY] extends
    | { kind: PrimitiveKind.Cursor }
    | { references: IReference }
    ? KEY
    : never;
}[keyof MODEL['attributes'] & string];

export type IMoveOperation<
  MODEL extends IModel,
  PROPERTY extends IMoveProperty<MODEL> = IMoveProperty<MODEL>,
> = {
  readonly model: MODEL;
  readonly modelVersion: number;
  readonly operationName: 'move';
  readonly resourceId: IInferIdFromAbbreviation<MODEL['abbreviation']>;
  readonly body: {
    readonly property: PROPERTY;
    readonly prevId: IPrimitiveDescriptorDecoded<MODEL['attributes'][PROPERTY]>;
    readonly nextId: IPrimitiveDescriptorDecoded<MODEL['attributes'][PROPERTY]>;
  };
};
