import { createContext, useContext, type ReactNode } from 'react';

import type { IInferModelRow } from '@zerospin/core/models/types';
import { makeZerospinError, type IZerospinError } from '@zerospin/error';
import {
  useSession,
  SessionProvider,
  SessionReady,
  useConnectedServiceSession,
  useLiveQuery,
} from '@zerospin/react';
import type { Effect } from 'effect';

import type { purchaseV1 } from '@/zerospin/aggregates/user/models/purchase/PurchaseV1';
import { applicationLayer } from '@/zerospin/applicationLayer';
import { clerkCredentialsSchema } from '@/zerospin/claims';
import promotionWorkerUrl from '@/zerospin/promotion.worker?sharedworker&url';
import { promotionSessionDefinition } from '@/zerospin/promotionSessionDefinition';
import type { promotionReservationV1 } from '@/zerospin/services/promotion/models/promotionReservation/PromotionReservationV1';

type IPromotionObservationInputs = {
  getCredentials(): Effect.Effect<
    typeof clerkCredentialsSchema.Type,
    IZerospinError
  >;
  renderError(error: IZerospinError, retry: () => void): ReactNode;
};

const PromotionObservation = createContext<IPromotionObservationInputs | null>(
  null,
);

export function PromotionObservationProvider(
  props: IPromotionObservationInputs & { children: ReactNode },
) {
  const { children, ...inputs } = props;
  return (
    <PromotionObservation.Provider value={inputs}>
      {children}
    </PromotionObservation.Provider>
  );
}

interface IPromotionReservationStatusProps {
  reservationId: IInferModelRow<typeof promotionReservationV1>['id'];
  purchaseId?: IInferModelRow<typeof purchaseV1>['id'];
}

export function PromotionReservationStatus(
  props: IPromotionReservationStatusProps,
) {
  const inputs = useContext(PromotionObservation);
  if (inputs === null) {
    throw makeZerospinError('promotion-observation-provider-missing');
  }

  const session = useConnectedServiceSession(promotionSessionDefinition, {
    sharedWorkerUrl: promotionWorkerUrl,
    credentialsSchema: clerkCredentialsSchema,
    layer: applicationLayer,
    getCredentials: inputs.getCredentials,
  });
  return (
    <SessionProvider session={session}>
      <div className="space-y-1 text-sm">
        <SessionReady
          definition={promotionSessionDefinition}
          fallback={
            <p className="text-muted-foreground">
              Opening reservation observation…
            </p>
          }
          renderError={inputs.renderError}
        >
          <ObservedReservationStatus {...props} />
        </SessionReady>
      </div>
    </SessionProvider>
  );
}

function ObservedReservationStatus(props: IPromotionReservationStatusProps) {
  const { reservationId, purchaseId } = props;
  const session = useSession(promotionSessionDefinition);
  const { data: reservation } = useLiveQuery({
    session,
    key: reservationId,
    query: (db, id) =>
      db.query.promotionReservation.findFirst({ where: { id: { eq: id } } }),
  });

  if (!reservation) {
    return (
      <p className="text-muted-foreground" role="status">
        No reservation decision observed.
      </p>
    );
  }

  const decision = {
    reserved:
      reservation.expiresAt === null
        ? 'Promotion reservation held.'
        : `Promotion reservation held until ${new Date(reservation.expiresAt).toLocaleString()}.`,
    denied: 'Promotion unavailable for this application.',
    committed: 'Promotion committed to its purchase.',
    released: 'Promotion reservation released.',
    redeemed: 'Promotion redeemed with payment.',
  }[reservation.status];

  return (
    <div className="space-y-1" role="status">
      <p>{decision}</p>
      {purchaseId &&
      reservation.purchaseId !== null &&
      reservation.purchaseId !== purchaseId ? (
        <p className="text-muted-foreground">
          This reservation belongs to a different purchase.
        </p>
      ) : null}
    </div>
  );
}
