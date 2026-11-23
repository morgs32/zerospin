import { makeSharedWorker } from '@zerospin/browser/makeSharedWorker';
import sqliteWasmUrl from '@zerospin/browser/sqlite.wasm?url';

import { usernameStorySessionDefinition } from './usernameStorySessionDefinition';

makeSharedWorker({
  sqliteWasmUrl,
  sessionDefinition: usernameStorySessionDefinition,
});
