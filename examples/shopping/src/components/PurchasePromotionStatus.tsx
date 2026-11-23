import type { IInferModelRow } from '@zerospin/core/models/types';
import { useSession, useLiveQuery } from '@zerospin/react';

import { PromotionReservationStatus } from './PromotionReservationStatus';

import type { purchaseV1 } from '@/zerospin/aggregates/user/models/purchase/PurchaseV1';
import { shopperSessionDefinition } from '@/zerospin/shopperSessionDefinition';

interface IPurchasePromotionStatusProps {
  purchaseId: IInferModelRow<typeof purchaseV1>['id'];
}

export function PurchasePromotionStatus({
  purchaseId,
}: IPurchasePromotionStatusProps) {
  const session = useSession(shopperSessionDefinition);
  const { data: purchase } = useLiveQuery({
    session,
    key: purchaseId,
    query: (db, id) =>
      db.query.purchase.findFirst({ where: { id: { eq: id } } }),
  });

  if (!purchase?.reservationId) return null;

  const currency = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  });

  return (
    <section className="space-y-2 rounded-md border p-3">
      <p className="font-medium">Purchase promotion</p>
      {purchase.subtotal !== null ? (
        <p className="text-sm">
          Quoted subtotal: {currency.format(purchase.subtotal / 100)}
        </p>
      ) : null}
      {purchase.discount !== null && purchase.total !== null ? (
        <p className="text-sm">
          Discount: {currency.format(purchase.discount / 100)} · Payment amount:{' '}
          {currency.format(purchase.total / 100)}
        </p>
      ) : null}
      <PromotionReservationStatus
        reservationId={purchase.reservationId}
        purchaseId={purchase.id}
      />
    </section>
  );
}
