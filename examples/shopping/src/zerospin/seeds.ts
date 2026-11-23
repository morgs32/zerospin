import * as sdk from '@zerospin/sdk';
import * as Effect from 'effect/Effect';

import { marketplaceServiceReleaseV1 } from './services/marketplace/marketplaceServiceReleaseV1';
import { productV1 } from './services/marketplace/models/product/ProductV1';

const products = [
  {
    id: sdk.prefixId(productV1, 'seed-1'),
    description: 'Classic cotton tee, comfortable everyday wear',
    name: 'Basic T-Shirt',
    price: 2000,
  },
  {
    id: sdk.prefixId(productV1, 'seed-2'),
    description: 'Sturdy canvas backpack with laptop sleeve',
    name: 'Canvas Backpack',
    price: 5000,
  },
  {
    id: sdk.prefixId(productV1, 'seed-3'),
    description: 'Wireless over-ear headphones, 30hr battery',
    name: 'Wireless Headphones',
    price: 9000,
  },
  {
    id: sdk.prefixId(productV1, 'seed-4'),
    description: 'Insulated stainless steel, keeps drinks cold 24hrs',
    name: 'Water Bottle',
    price: 2500,
  },
  {
    id: sdk.prefixId(productV1, 'seed-5'),
    description: 'A5 hardcover, 192 pages, acid-free paper',
    name: 'Lined Notebook',
    price: 1200,
  },
  {
    id: sdk.prefixId(productV1, 'seed-6'),
    description: '12oz ceramic mug, dishwasher safe',
    name: 'Ceramic Coffee Mug',
    price: 1400,
  },
  {
    id: sdk.prefixId(productV1, 'seed-7'),
    description: 'Dimmable warm/cool light with USB charging port',
    name: 'LED Desk Lamp',
    price: 4500,
  },
  {
    id: sdk.prefixId(productV1, 'seed-8'),
    description: 'Large stitched-edge cloth pad for work and play',
    name: 'Mouse Pad',
    price: 1800,
  },
  {
    id: sdk.prefixId(productV1, 'seed-9'),
    description: 'Braided USB-C to USB-C, 100W rated',
    name: 'USB-C Cable (2m)',
    price: 1600,
  },
  {
    id: sdk.prefixId(productV1, 'seed-10'),
    description: 'Midweight fleece, relaxed fit, front pouch',
    name: 'Fleece Hoodie',
    price: 5500,
  },
  {
    id: sdk.prefixId(productV1, 'seed-11'),
    description: 'UV400 protection, lightweight frames',
    name: 'Polarized Sunglasses',
    price: 3500,
  },
  {
    id: sdk.prefixId(productV1, 'seed-12'),
    description: 'Non-slip 5mm TPE, carry strap included',
    name: 'Yoga Mat',
    price: 3200,
  },
] as const;

/** Sequential create-only seeds stop at the first failure; prior successes stay committed. */
export const seeds: sdk.ISeedProgram = api =>
  Effect.gen(function* () {
    for (const payload of products) {
      const outcome = yield* api.executeServiceCommand(
        marketplaceServiceReleaseV1,
        {
          contractName: 'createProduct',
          payload,
        },
      );
      if (outcome.result._tag === 'Failure') {
        return yield* Effect.fail(outcome.result.failure);
      }
    }
  });
