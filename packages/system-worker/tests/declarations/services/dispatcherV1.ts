import { makeServiceRelease } from '@zerospin/core/service/make/makeServiceRelease';

export const dispatcherV1 = makeServiceRelease(
  { name: 'dispatcher' },
  {
    version: 1,
    models: {},
    actors: {},
    system: {},
    external: {},
  },
);
