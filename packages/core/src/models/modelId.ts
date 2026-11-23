import { captureDescriptor, PrimitiveKind } from '@zerospin/shapes';
import * as Schema from 'effect/Schema';

export type IModelIdOptions = {
  model: Readonly<{ name: string; abbreviation: string }>;
  nullable?: boolean | undefined;
  unique?: boolean | undefined;
};

/** Describe a stable model's ID value without a local relationship. */
export function modelId<const PROPS extends IModelIdOptions>(props: PROPS) {
  Schema.decodeUnknownSync(
    Schema.Struct({
      model: Schema.Struct({
        name: Schema.NonEmptyString,
        abbreviation: Schema.NonEmptyString,
      }),
      nullable: Schema.optionalKey(Schema.UndefinedOr(Schema.Boolean)),
      unique: Schema.optionalKey(Schema.UndefinedOr(Schema.Boolean)),
    }),
    { onExcessProperty: 'error' },
  )(props);
  const { model, ...options } = props;
  const abbreviation: PROPS['model']['abbreviation'] = model.abbreviation;
  return captureDescriptor({
    ...options,
    kind: PrimitiveKind.Id,
    abbreviation,
  });
}
