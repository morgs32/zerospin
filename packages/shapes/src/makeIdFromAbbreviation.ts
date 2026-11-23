import * as Effect from 'effect/Effect';

import { CuidFactory } from './CuidFactory.ts';

export const makeIdFromAbbreviation = Effect.fn('makeIdFromAbbreviation')(
  function* <const ABBREVIATION extends string>(props: {
    abbreviation: ABBREVIATION;
  }): Effect.fn.Return<`${ABBREVIATION}_${string}`, never, CuidFactory> {
    const { abbreviation } = props;
    const makeId = yield* CuidFactory;
    return `${abbreviation}_${yield* makeId()}`;
  },
);
