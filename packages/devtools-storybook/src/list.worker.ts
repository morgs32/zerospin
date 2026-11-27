import { makeSharedWorker } from '@zerospin/browser/makeSharedWorker';
import sqliteWasmUrl from '@zerospin/browser/sqlite.wasm?url';

import { listSession } from './listSession';

makeSharedWorker({ sqliteWasmUrl, sessionDefinition: listSession });
