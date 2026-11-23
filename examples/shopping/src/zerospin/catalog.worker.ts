import { makeSharedWorker } from '@zerospin/browser/makeSharedWorker';
import sqliteWasmUrl from '@zerospin/browser/sqlite.wasm?url';

import { catalogSessionDefinition } from './catalogSessionDefinition';

makeSharedWorker({
  sqliteWasmUrl,
  sessionDefinition: catalogSessionDefinition,
});
