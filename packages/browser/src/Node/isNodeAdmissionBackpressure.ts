import * as Schema from 'effect/Schema';

const admissionBackpressure = Schema.Struct({
  code: Schema.Literals([
    'aggregate-admission-backlog-full',
    'service-admission-backlog-full',
  ]),
  extra: Schema.Struct({ retryable: Schema.Literal(true) }),
});

/** Chain capacity postpones admission; it does not reject the retained Node command or its authority. */
export const isNodeAdmissionBackpressure = Schema.is(admissionBackpressure);
