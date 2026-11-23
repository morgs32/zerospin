import type { IInferResource } from '@zerospin/sdk';

import type {
  PurchaseQuote,
  PurchaseQuoteResult,
  PurchaseSnapshot,
} from '../../../../purchaseQuote';
import type { productV1 } from '../../../../services/marketplace/models/product/ProductV1';

/** Price the frozen lines from one canonical Product selection. */
export function quotePurchase({
  snapshot,
  products,
}: {
  snapshot: typeof PurchaseSnapshot.Type;
  products: readonly Pick<
    IInferResource<typeof productV1>,
    'id' | 'name' | 'price'
  >[];
}): typeof PurchaseQuoteResult.Type {
  const items: (typeof PurchaseQuote.Type.items)[number][] = [];
  for (const line of snapshot.items) {
    const product = products.find(product => product.id === line.productId);
    if (
      !product ||
      !Number.isSafeInteger(product.price) ||
      product.price < 0 ||
      !Number.isSafeInteger(line.quantity) ||
      line.quantity <= 0
    ) {
      return {
        state: 'refused',
        purchaseId: snapshot.purchaseId,
        message: 'A checkout product or quantity is unavailable.',
      };
    }
    items.push({ ...line, name: product.name, price: product.price });
  }
  const subtotal = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );
  if (
    items.length === 0 ||
    new Set(items.map(item => item.id)).size !== items.length ||
    !Number.isSafeInteger(subtotal)
  ) {
    return {
      state: 'refused',
      purchaseId: snapshot.purchaseId,
      message:
        'The purchase quote exceeds the supported range or contains invalid lines.',
    };
  }
  return { state: 'quoted', quote: { ...snapshot, items, subtotal } };
}
