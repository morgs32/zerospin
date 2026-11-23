import { useState } from 'react';

import { stageAggregateSessionCommand } from '@zerospin/browser';
import type { IAggregateSession } from '@zerospin/core/aggregateSession/types';

/**
 * Never render pending UI for `stageAggregateSessionCommand({ session, ... })`; it is an immediate local optimistic action.
 * Only Success permits local success UI. Failure leaves no staged command. Delivery and authoritative failures arrive
 * later through the session store failure occurrence.
 *
 * @bad Disable the initiating control while local staging settles.
 * @bad Render loading text or a spinner for the local command journal write.
 * @bad Wait for server push or authoritative finalization before following the local result.
 */
export function CreateItemButton() {
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          const result = stageAggregateSessionCommand({
            session: itemSession,
            contractName: 'createItem',
            payload: {},
          });
          if (result._tag === 'Failure') {
            setError(result.failure.message);
            return;
          }

          navigate(`/items/${result.success.payload.id}`);
        }}
      >
        Create item
      </button>
      {error === null ? null : <p role="alert">{error}</p>}
    </>
  );
}

declare const itemSession: IAggregateSession;
declare function navigate(href: string): void;
