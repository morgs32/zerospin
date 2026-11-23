import { PublicFailureSchema } from '@zerospin/error';
import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';

import { VersionSchema } from '../declaration/VersionSchema.ts';

const continuationContract = {
  commandName: Schema.NonEmptyString,
  contractVersion: VersionSchema,
};

const decodePayload = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.JsonObject),
);

export const EncodedContinuationPayloadSchema = Schema.Struct({
  ...continuationContract,
  payload: Schema.String.check(
    Schema.makeFilter(payload =>
      Option.isSome(decodePayload(payload))
        ? undefined
        : 'Expected an encoded command payload object',
    ),
  ),
  failure: Schema.Null,
});

export const FailedContinuationPayloadSchema = Schema.Struct({
  ...continuationContract,
  payload: Schema.Null,
  failure: PublicFailureSchema,
});
