import * as Schema from 'effect/Schema';

export const ClerkUserIdSchema = Schema.String.check(
  Schema.isMinLength(1),
).pipe(Schema.brand('ClerkUserId'));
export type IClerkUserId = typeof ClerkUserIdSchema.Type;
export const clerkCredentialsSchema = Schema.Struct({ token: Schema.String });
export const userClaims = Schema.Struct({ clerkUserId: ClerkUserIdSchema });
export const userAggregateClaims = Schema.Struct({
  ...userClaims.fields,
  aggregateId: ClerkUserIdSchema,
});
