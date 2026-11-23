import { makeSharedWorker } from '@zerospin/browser/makeSharedWorker';
import sqliteWasmUrl from '@zerospin/browser/sqlite.wasm?url';

import { promotionSessionDefinition } from './promotionSessionDefinition';

makeSharedWorker({
  sqliteWasmUrl,
  sessionDefinition: promotionSessionDefinition,
});
