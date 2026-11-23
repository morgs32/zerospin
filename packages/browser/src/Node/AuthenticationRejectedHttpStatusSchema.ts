import * as Schema from 'effect/Schema';

export const AuthenticationRejectedHttpStatusSchema = Schema.Literals([
  401, 403,
]);
