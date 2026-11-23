import { makeSharedWorker } from '@zerospin/browser/makeSharedWorker';
import sqliteWasmUrl from '@zerospin/browser/sqlite.wasm?url';

import { shopperSessionDefinition } from './shopperSessionDefinition';

makeSharedWorker({
  sqliteWasmUrl,
  sessionDefinition: shopperSessionDefinition,
});
