import * as Schema from 'effect/Schema';

/** A request stopped without a usable response; the remote result may be unknown. */
export const ExternalRequestFailureSchema = Schema.Struct({
  _tag: Schema.Literal('ExternalRequestFailure'),
  code: Schema.Literal('external-request-failed'),
  message: Schema.String,
});
export type IExternalRequestFailure = typeof ExternalRequestFailureSchema.Type;

export const ExternalOutcomeSchema = Schema.Union([
  Schema.Struct({
    _tag: Schema.Literal('Success'),
    success: Schema.Json,
    recordedAt: Schema.DateFromString,
  }),
  Schema.Struct({
    _tag: Schema.Literal('Failure'),
    failure: ExternalRequestFailureSchema,
    recordedAt: Schema.DateFromString,
  }),
]);

/** The retained provider observation used to choose an ordinary continuation. */
export type IExternalOutcome<RESPONSE = typeof Schema.Json.Type> =
  | Readonly<{ _tag: 'Success'; success: RESPONSE; recordedAt: Date }>
  | Readonly<{
      _tag: 'Failure';
      failure: IExternalRequestFailure;
      recordedAt: Date;
    }>;
export type IEncodedExternalOutcome = typeof ExternalOutcomeSchema.Encoded;
