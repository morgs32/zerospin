import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { makeAbbreviationIdSchema } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

/** Reject foreign system storage before resolving database configuration. */
export const validateRepoSystemId = Effect.fn(
  'SystemRepo.validateRepoSystemId',
)(function* (props: { key: object; configuredSystemId: string }) {
  const { key, configuredSystemId } = props;

  const systemId = yield* Schema.decodeUnknownEffect(
    makeAbbreviationIdSchema(coreAbbreviations.system),
  )(Reflect.get(key, 'systemId')).pipe(
    mapParseError({
      code: 'repo-system-id-invalid',
      prefix: 'Invalid system Repo system ID',
    }),
  );
  if (systemId !== configuredSystemId) {
    return yield* makeZerospinError({
      code: 'repo-system-id-mismatch',
      message: 'System Repo must belong to the configured system',
    });
  }
});
