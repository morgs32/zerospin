import { makeSharedWorker } from '@zerospin/browser/makeSharedWorker';
import sqliteWasmUrl from '@zerospin/browser/sqlite.wasm?url';

import { gameSessionDefinition } from './gameSessionDefinition';

makeSharedWorker({
  sqliteWasmUrl,
  sessionDefinition: gameSessionDefinition,
});
