import { makeSharedWorker } from '@zerospin/browser/makeSharedWorker';
import sqliteWasmUrl from '@zerospin/browser/sqlite.wasm?url';

import { listStorySessionDefinition } from './listStorySessionDefinition';

makeSharedWorker({
  sqliteWasmUrl,
  sessionDefinition: listStorySessionDefinition,
});
