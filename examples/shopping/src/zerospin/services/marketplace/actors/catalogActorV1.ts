import { RoutePattern } from '@remix-run/route-pattern';
import * as sdk from '@zerospin/sdk';
import * as Effect from 'effect/Effect';

import { clerkCredentialsSchema, userClaims } from '../../../claims';
import { verifyClerkIdentity } from '../../../verifyClerkIdentity';
import { createProductV1 } from '../contracts/createProduct/CreateProductV1';
import { deleteProductV1 } from '../contracts/deleteProduct/DeleteProductV1';
import { productV1 } from '../models/product/ProductV1';

const db = sdk.makeQueryDbVersion({ models: { product: productV1 } });
export const catalogActorV1 = sdk.makeServiceActorRelease(
  sdk.defineServiceActor({ name: 'catalog' }),
  {
    version: 1,
    db,
    exposedModels: db.models,
    identity: sdk.makeActorIdentity({
      claims: userClaims,
      actorPath: RoutePattern.parse('/:clerkUserId'),
    }),
    authentication: {
      credentialsSchema: clerkCredentialsSchema,
      authenticate: ({ credentials }) =>
        verifyClerkIdentity(credentials).pipe(
          Effect.map(clerkUserId => ({ clerkUserId })),
        ),
    },
    contracts: {
      createProduct: createProductV1,
      deleteProduct: deleteProductV1,
    },
    selections: { product: db.query.product.findMany({}) },
  },
);
