import type { IAnyError } from '@zerospin/error';
import type { CuidFactory } from '@zerospin/shapes';
import type { Effect, Schema } from 'effect';

export type IClaimsSchema = Schema.Struct<
  Readonly<Record<string, Schema.Codec<unknown, unknown>>>
>;

export type IServiceAuthentication<
  C extends Schema.Codec<unknown, unknown> = Schema.Codec<unknown, unknown>,
  I extends IClaimsSchema = IClaimsSchema,
> =
  | 'none'
  | Readonly<{
      credentialsSchema: C;
      authenticate(props: {
        credentials: C['Type'];
      }): Effect.Effect<I['Type'], IAnyError, CuidFactory>;
    }>;

export type IAggregateAuthentication<
  C extends Schema.Codec<unknown, unknown> = Schema.Codec<unknown, unknown>,
  I extends IClaimsSchema = IClaimsSchema,
> = Readonly<{
  credentialsSchema: C;
  authenticate(props: {
    aggregateId: string;
    credentials: C['Type'];
  }): Effect.Effect<I['Type'], IAnyError, CuidFactory>;
}>;

export type ISessionInitialization<
  I extends IClaimsSchema,
  C extends Schema.Codec<unknown, unknown> | undefined,
> =
  C extends Schema.Codec<unknown, unknown>
    ? {
        getCredentials: () => Effect.Effect<C['Type'], IAnyError>;
        claims?: never;
        expectedClaims?: I['Type'];
      }
    : { claims: I['Type']; getCredentials?: never; expectedClaims?: never };

export type IAdmissionRequest =
  | { claims: unknown; credentials?: never }
  | { credentials: unknown; claims?: never };

export type IAggregateAuthenticationRequest = {
  aggregateId: string;
  credentials: unknown;
  claims?: never;
};
