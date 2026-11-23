import { ServiceVersionRepo } from '@zerospin/owner-release-worker/ServiceVersionRepo/ServiceVersionRepo';
import { WorkerEntrypoint } from 'cloudflare:workers';
import { sql } from 'drizzle-orm';

import {
  reservationWorkEvaluations,
  resetReservationWorkEvaluations,
} from '../declarations/contracts/performReservationWorkV1.ts';
import {
  recordReservationWorkFailures,
  recordReservationWorkRequests,
  resetRecordReservationWork,
} from '../declarations/contracts/recordReservationWorkV1.ts';

import {
  externalProbeControls,
  externalProbePayloadBuilds,
  holdExternalProbeDeadlines,
  resetExternalProbeControls,
} from './externalProbeControls.ts';

/** Control only the synthetic provider and authored programs in this release. */
export class ExternalDeliveryControls extends WorkerEntrypoint {
  getProbeAttempts() {
    return externalProbeControls.map(({ attempt }) => attempt);
  }

  getProbePayloadBuilds() {
    return externalProbePayloadBuilds;
  }

  holdProbeDeadlines() {
    holdExternalProbeDeadlines();
  }

  releaseProbeFinalizer(reservationId: string) {
    const control = externalProbeControls.find(
      ({ attempt }) => attempt.payload.reservationId === reservationId,
    );
    if (control === undefined || !control.attempt.finalizing) {
      throw new Error('Probe finalizer is not waiting');
    }
    control.finalizerReleased = true;
  }

  getReservationWorkRequests() {
    return recordReservationWorkRequests;
  }

  getReservationWorkEvaluations() {
    return reservationWorkEvaluations;
  }

  refuseReservationWork(reservationId: string) {
    recordReservationWorkFailures.add(reservationId);
  }

  resetExternalDelivery() {
    resetExternalProbeControls();
    resetRecordReservationWork();
    resetReservationWorkEvaluations();
  }
}

/** Fault the same Repo transaction used by the reservation release. */
export class ExternalDeliveryRepo extends ServiceVersionRepo {
  readonly #activation = crypto.randomUUID();

  getActivationId() {
    return this.#activation;
  }

  setObservationCommitFault(enabled: boolean) {
    if (enabled) {
      this.db.run(sql`
        CREATE TRIGGER fixture_external_commit BEFORE INSERT ON serviceVersionChainOutbox
        WHEN NEW.commandName = 'recordReservationObservation'
        BEGIN SELECT RAISE(ABORT, 'fixture-external-commit'); END
      `);
    } else {
      this.db.run(sql`DROP TRIGGER fixture_external_commit`);
    }
  }
}
