import { makeSharedWorker } from '@zerospin/browser/makeSharedWorker';

import {
  installServiceRecoveryBackend,
  serviceHostDefinition,
  serviceHostWasmUrl,
} from './service-host.browser.ts';

installServiceRecoveryBackend(
  new URL(import.meta.url).searchParams.has('finalize'),
);

makeSharedWorker({
  sqliteWasmUrl: serviceHostWasmUrl,
  sessionDefinition: serviceHostDefinition,
});
