import { mapValues } from 'es-toolkit';

import type { IDb } from '../drizzle/types.ts';

import type { ISelection } from './make/makeQueryDbVersion.ts';
import type { IAnyModels } from './types.ts';
export type { ISelection } from './make/makeQueryDbVersion.ts';
export type ISelectionDb = Pick<IDb, '_'>;

export function assertSelectionQueryModels(props: {
  selection: ISelection;
  models: IAnyModels;
}): void {
  const { selection, models } = props;

  mapValues(selection.models, (model, name) => {
    if (models[name] !== model) {
      throw new Error(
        `Selection database model ${name} differs from the registered model`,
      );
    }
  });
}

export function selectAllFromSelection(props: {
  db: ISelectionDb;
  models: IAnyModels;
  selection: ISelection;
  identity: Readonly<Record<string, string>>;
}) {
  assertSelectionQueryModels(props);
  const { selection, db, identity } = props;

  return { all: () => selection.all(db, identity) };
}
