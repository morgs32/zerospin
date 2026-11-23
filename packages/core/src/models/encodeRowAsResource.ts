import { makeZerospinError, mapParseError } from '@zerospin/error';
import { makeEffectSchema } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { IInferEncodedResource, IInferModelRow, IModel } from './types.ts';

export const encodeRowAsResource = Effect.fn('models.encodeRowAsResource')(
  function* <MODEL extends IModel>(
    model: MODEL,
    row: IInferModelRow<NoInfer<MODEL>>,
  ) {
    const { modelName, version } = model;
    const resource = { modelName, version, ...row };
    if (resource.modelName !== modelName || resource.version !== version) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'model-current-resource-identity-invalid',
          message: `Current resource must identify ${modelName}@${version}`,
          extra: {
            modelName,
            modelVersion: version,
            resourceModelName: resource.modelName,
            resourceVersion: resource.version,
          },
        }),
      );
    }
    const currentResource = yield* Schema.decodeUnknownEffect(
      Schema.toType(model.resourceJsonCodec),
    )(resource, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'model-current-resource-invalid',
        prefix: `Failed to validate current resource for ${modelName}@${version}`,
        extra: { modelName, modelVersion: version },
      }),
    );

    const encoded: IInferEncodedResource<MODEL> = yield* Schema.encodeEffect(
      makeEffectSchema(model.propertiesShape),
    )(currentResource, {
      onExcessProperty: 'error',
    }).pipe(
      mapParseError({
        code: 'model-resource-encode-invariant-failed',
        prefix: `Failed to encode resource for ${modelName}@${version}`,
        extra: {
          modelName,
          modelVersion: version,
        },
      }),
    );
    return encoded;
  },
);
