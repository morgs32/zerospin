import { makeZerospinError, mapParseError } from '@zerospin/error';
import { makeEffectSchema } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { mapValues } from 'es-toolkit';

import type { IDb } from '../../drizzle/types.ts';
import { getByKeyOrThrow } from '../../utils/getByKeyOrThrow.ts';
import { getGraph } from '../getGraph.ts';
import { ResourceEnvelopeJsonCodec } from '../ResourceEnvelopeJsonCodec.ts';
import type { IAnyModels, IEncodedResourceShape } from '../types.ts';

/** Read and encode the selected resources from the current resource tables. */
export const readSelectedResources = Effect.fn('readSelectedResources')(
  function* ({
    db,
    models,
    exposedModels,
    requireReferenceClosure,
    selections,
    identity,
  }: Omit<Parameters<typeof getGraph>[0], 'identity' | 'db'> & {
    db: IDb;
    exposedModels: IAnyModels;
    requireReferenceClosure: boolean;
  } & {
    identity?: Parameters<typeof getGraph>[0]['identity'] | undefined;
  }) {
    const selected = getGraph({
      db,
      models,
      selections,
      identity: identity ?? {},
    });
    const nextGraph: IEncodedResourceShape[] = [];
    for (const resource of selected) {
      const model = yield* getByKeyOrThrow({
        record: exposedModels,
        key: resource.modelName,
        recordKind: 'actor exposed models',
      });
      const decodedResource = yield* Schema.decodeUnknownEffect(
        makeEffectSchema(model.propertiesShape),
      )(
        mapValues(
          model.propertiesShape,
          (_descriptor, field) => resource[String(field)],
        ),
      ).pipe(
        Effect.flatMap(row =>
          Schema.decodeUnknownEffect(Schema.toType(model.resourceJsonCodec))(
            row,
          ),
        ),
        mapParseError({
          code: 'projection-projected-resource-invalid',
          prefix: 'Invalid selected aggregate resource',
        }),
      );
      const encoded = yield* Schema.encodeEffect(
        makeEffectSchema(model.propertiesShape),
      )(decodedResource).pipe(
        mapParseError({
          code: 'projection-projected-resource-invalid',
          prefix: 'Invalid selected aggregate resource',
        }),
      );
      nextGraph.push(
        yield* Schema.decodeUnknownEffect(
          Schema.toType(ResourceEnvelopeJsonCodec),
        )(encoded).pipe(
          mapParseError({
            code: 'projection-projected-resource-invalid',
            prefix: 'Invalid selected aggregate resource',
          }),
        ),
      );
    }

    if (!requireReferenceClosure) return nextGraph;
    const resources = new Set(
      nextGraph.map(resource =>
        JSON.stringify([resource.modelName, resource.id]),
      ),
    );
    for (const resource of nextGraph) {
      const model = exposedModels[resource.modelName];
      if (model === undefined) {
        return yield* makeZerospinError(
          'projection-projected-resource-invalid',
        );
      }
      const references = Object.values(
        mapValues(model.propertiesShape, (descriptor, key) => {
          const field = String(key);
          if (descriptor.references === undefined || resource[field] === null) {
            return true;
          }
          return resources.has(
            JSON.stringify([descriptor.references.tableName, resource[field]]),
          );
        }),
      );
      if (references.some(closed => !closed)) {
        return yield* makeZerospinError({
          code: 'projection-projected-resource-invalid',
          message: `Selected actor graph must contain every visible reference from ${resource.modelName}:${resource.id}`,
        });
      }
    }
    return nextGraph;
  },
);
