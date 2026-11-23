import { makeZerospinError } from '@zerospin/error';
import { PrimitiveKind } from '@zerospin/shapes';
import * as Schema from 'effect/Schema';
import { mapValues } from 'es-toolkit';

import { ResourceEnvelopeJsonCodec } from '../models/ResourceEnvelopeJsonCodec.ts';
import type { IEncodedResourceShape, IModel } from '../models/types.ts';

/** Validate the complete envelope before SQLite writes; retain JSON column bytes. */
export function makeEncodedRowFromResource(
  resource: Readonly<Record<string, unknown>>,
  model: IModel,
) {
  const {
    modelName: _modelName,
    version: _version,
    ...row
  } = validateResourceEnvelope(resource, model);
  return row;
}

/** Bind a stored row to its model before publishing the complete envelope. */
export function makeResourceFromEncodedRow(
  row: Readonly<Record<string, unknown>>,
  model: IModel,
): IEncodedResourceShape {
  if (
    ('modelName' in row && row.modelName !== model.modelName) ||
    ('version' in row && row.version !== model.version)
  ) {
    throw makeZerospinError('node-resource-model-invalid');
  }
  return validateResourceEnvelope(
    { ...row, modelName: model.modelName, version: model.version },
    model,
  );
}

function validateResourceEnvelope(
  resource: Readonly<Record<string, unknown>>,
  model: IModel,
): IEncodedResourceShape {
  if (
    resource.modelName !== model.modelName ||
    resource.version !== model.version
  ) {
    throw makeZerospinError('node-resource-model-invalid');
  }
  const portable = mapValues(resource, (value, key) =>
    model.propertiesShape[key]?.kind === PrimitiveKind.Date &&
    value instanceof Date &&
    Number.isFinite(value.getTime())
      ? value.toISOString()
      : value,
  );
  const decoded = Schema.decodeUnknownOption(model.resourceJsonCodec, {
    onExcessProperty: 'error',
  })(portable);
  if (decoded._tag === 'None') throw makeZerospinError('node-resource-invalid');
  const row = mapValues(resource, (value, key) =>
    model.propertiesShape[key]?.kind === PrimitiveKind.Date
      ? Reflect.get(decoded.value, key)
      : value,
  );
  return Schema.decodeUnknownSync(Schema.toType(ResourceEnvelopeJsonCodec))(
    row,
  );
}
