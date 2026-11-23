import * as Schema from 'effect/Schema';

import {
  selectAllFromSelection,
  type ISelection,
  type ISelectionDb,
} from './makeSelection.ts';
import { ResourceEnvelopeJsonCodec } from './ResourceEnvelopeJsonCodec.ts';
import type { IAnyModels, IEncodedResourceShape, IModel } from './types.ts';

export const getGraph = (props: {
  db: ISelectionDb;
  identity: Readonly<Record<string, string>>;
  models: IAnyModels;
  selections: Record<string, ISelection<IModel>>;
}): IEncodedResourceShape[] => {
  const { db, identity, models, selections } = props;
  return Object.values(selections).flatMap(selection =>
    Schema.decodeUnknownSync(
      Schema.Array(Schema.toType(ResourceEnvelopeJsonCodec)),
    )(selectAllFromSelection({ db, models, selection, identity }).all()),
  );
};
