import type { IShape } from '@zerospin/shapes';

import { makeModelVersion } from './makeModelVersion.ts';

export function makeLimitedModelVersion<
  MODEL_NAME extends string,
  ABBREVIATION extends string,
  ATTRIBUTES extends IShape,
  const VERSION extends number,
>(
  identity: Readonly<{ name: MODEL_NAME; abbreviation: ABBREVIATION }>,
  props: Parameters<
    typeof makeModelVersion<MODEL_NAME, ABBREVIATION, ATTRIBUTES, VERSION>
  >[1],
) {
  if (Object.hasOwn(props, 'propertiesShape')) {
    throw new Error(
      'Limited models expose authored attributes and framework fields only',
    );
  }
  return makeModelVersion<MODEL_NAME, ABBREVIATION, ATTRIBUTES, VERSION>(
    identity,
    props,
  );
}
