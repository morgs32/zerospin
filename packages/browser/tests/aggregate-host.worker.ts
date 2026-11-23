import { AggregateBrowserSessionApi } from '@zerospin/browser/AggregateNode/AggregateBrowserSessionApi';
import { makeSharedWorker } from '@zerospin/browser/makeSharedWorker';

import {
  definition,
  installAggregateRecoveryBackend,
  sqliteWasmUrl,
  standaloneDefinition,
} from './aggregate-host.browser.ts';

const workerName: unknown = Reflect.get(globalThis, 'name');
const scenario = new URL(import.meta.url).searchParams;
if (scenario.has('hold-staged')) {
  const getSubscriber =
    AggregateBrowserSessionApi.prototype.getStagedCommandSubscriber;
  AggregateBrowserSessionApi.prototype.getStagedCommandSubscriber = function (
    input: unknown,
  ) {
    const subscriber = getSubscriber.call(this, input);
    const receive = subscriber.receive.bind(subscriber);
    // Capnweb exposes prototype methods, never own RpcTarget properties.
    Object.defineProperty(Object.getPrototypeOf(subscriber), 'receive', {
      value: async (commands: unknown) => {
        const gates = await caches.open('zerospin-test-journal-handoff');
        const gateUrl = new URL(
          `/__zerospin-test__/journal-handoff/${encodeURIComponent(String(input))}`,
          globalThis.location.origin,
        );
        if (await gates.match(gateUrl)) {
          // This old call never forwards, even after the next document removes the gate.
          return new Promise<never>(() => undefined);
        }
        return receive(commands);
      },
    });
    return subscriber;
  };
}
if (
  typeof workerName === 'string' &&
  workerName.startsWith('/zerospin/standalone/')
) {
  makeSharedWorker({ sessionDefinition: standaloneDefinition, sqliteWasmUrl });
} else {
  installAggregateRecoveryBackend(scenario.has('finalize'));
  makeSharedWorker({ sessionDefinition: definition, sqliteWasmUrl });
}
