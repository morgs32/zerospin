import {
  useSession,
  makeAggregateSessionModelId,
  stageAggregateSessionCommand,
  useLiveQuery,
  validateAggregateSessionCommand,
} from '@zerospin/react';

import { PromotionReservationStatus } from './PromotionReservationStatus';
import { Button } from './ui/button';

import { promotionReservationV1 } from '@/zerospin/services/promotion/models/promotionReservation/PromotionReservationV1';
import { shopperSessionDefinition } from '@/zerospin/shopperSessionDefinition';

export function PromotionControls() {
  const session = useSession(shopperSessionDefinition);
  const { data: cart } = useLiveQuery({
    session,
    query: db => db.query.cart.findFirst({}),
  });

  if (!cart) return null;

  const promotion = cart.promotion;
  const newApplicationRefused =
    validateAggregateSessionCommand({
      session,
      contractName: 'applyPromotion',
      payload: { cartId: cart.id, reservationId: 'prv_preview' },
    })._tag === 'Failure';
  const removeRefused =
    validateAggregateSessionCommand({
      session,
      contractName: 'removePromotion',
      payload: { cartId: cart.id },
    })._tag === 'Failure';

  return (
    <section className="space-y-2 rounded-md border p-3">
      <p className="font-medium">50% promotion</p>
      <p className="text-muted-foreground text-xs">
        Limited to 100 lifetime redemptions. Reservations last ten minutes until
        committed to a purchase.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={newApplicationRefused}
          onClick={() =>
            stageAggregateSessionCommand({
              session,
              contractName: 'applyPromotion',
              payload: {
                cartId: cart.id,
                reservationId: makeAggregateSessionModelId({
                  session,
                  model: promotionReservationV1,
                }),
              },
            })
          }
        >
          {promotion?.action === 'apply'
            ? 'Apply new reservation'
            : 'Apply promotion'}
        </Button>
        {promotion?.action === 'apply' ? (
          <Button
            variant="outline"
            size="sm"
            disabled={removeRefused}
            onClick={() =>
              stageAggregateSessionCommand({
                session,
                contractName: 'removePromotion',
                payload: { cartId: cart.id },
              })
            }
          >
            Remove promotion
          </Button>
        ) : null}
      </div>
      {promotion ? (
        <>
          <p className="text-muted-foreground text-xs">
            After denial, expiry or cancellation, apply a new reservation. An
            earlier active hold can prevent another reservation.
          </p>
          {promotion.action === 'remove' ? (
            <p className="text-sm">
              Promotion removed from the cart selection.
            </p>
          ) : null}
          <PromotionReservationStatus reservationId={promotion.reservationId} />
        </>
      ) : null}
    </section>
  );
}
