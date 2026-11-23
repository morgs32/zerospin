type IPaymentLine = {
  id: string;
  productId: string;
  quantity: number;
};

export function matchesPaymentCheckout({
  aggregateId,
  payload,
  purchase,
  cart,
}: {
  aggregateId: string;
  payload: { key: string; total: number };
  purchase: {
    id: string;
    cartId: string;
    paymentState: string;
    total: number | null;
    items: readonly IPaymentLine[];
  };
  cart: { id: string; items: readonly IPaymentLine[] };
}) {
  return (
    purchase.cartId === cart.id &&
    purchase.paymentState === 'pending' &&
    Number.isSafeInteger(payload.total) &&
    payload.total >= 0 &&
    purchase.total === payload.total &&
    payload.key === `shopping:${aggregateId}:${purchase.id}:payment` &&
    cart.items.length === purchase.items.length &&
    cart.items.every(item =>
      purchase.items.some(
        line =>
          line.id === `pit_${purchase.id.slice(4)}_${item.id.slice(4)}` &&
          line.productId === item.productId &&
          line.quantity === item.quantity,
      ),
    )
  );
}
