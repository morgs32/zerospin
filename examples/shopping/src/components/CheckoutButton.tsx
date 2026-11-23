import {
  useSession,
  makeAggregateSessionModelId,
  stageAggregateSessionCommand,
  useLiveQuery,
} from '@zerospin/react';

import { Button } from './ui/button';

import { purchaseV1 } from '@/zerospin/aggregates/user/models/purchase/PurchaseV1';
import { shopperSessionDefinition } from '@/zerospin/shopperSessionDefinition';

export function CheckoutButton() {
  const session = useSession(shopperSessionDefinition);
  const { data: cart } = useLiveQuery({
    session,
    query: db =>
      db.query.cart.findFirst({
        with: { items: true, checkoutPurchase: true },
      }),
  });
  const paymentState = cart?.checkoutPurchase?.paymentState;
  const pending = paymentState === 'preparing' || paymentState === 'pending';
  const blocked = pending || paymentState === 'needs_reconciliation';
  const message = paymentState
    ? {
        preparing: 'Checking out…',
        pending: 'Checking out…',
        paid: 'Payment complete.',
        declined: 'Payment declined. Your cart is ready to edit.',
        refused: 'Checkout could not be prepared. Your cart is ready to edit.',
        needs_reconciliation: 'Payment needs review. Checkout is paused.',
      }[paymentState]
    : null;

  return (
    <div className="space-y-2">
      <Button
        className="w-full"
        disabled={!cart?.items.length || blocked}
        onClick={() => {
          if (!cart) return;
          stageAggregateSessionCommand({
            session,
            contractName: 'checkout',
            payload: {
              cartId: cart.id,
              purchaseId: makeAggregateSessionModelId({
                session,
                model: purchaseV1,
              }),
              reservationId:
                cart.promotion?.action === 'apply'
                  ? cart.promotion.reservationId
                  : null,
            },
          });
        }}
      >
        {pending
          ? 'Checking out…'
          : paymentState === 'needs_reconciliation'
            ? 'Checkout paused'
            : 'Checkout'}
      </Button>
      {message ? (
        <p role="status" className="text-sm">
          {message}
        </p>
      ) : null}
    </div>
  );
}
