import { mapValues } from 'es-toolkit';

import type { IModel } from '../../../models/types.ts';
import type { ISystem } from '../../types.ts';

/** Prevent different services from owning the same source model object. */
export function validateServiceModelOwnership(system: ISystem): void {
  const serviceNameBySourceModel = new Map<IModel, string>();
  mapValues(system.services, (serviceRegistry, serviceName) => {
    mapValues(serviceRegistry.releases, serviceRelease => {
      mapValues(serviceRelease.models, (model, modelName) => {
        const priorServiceName = serviceNameBySourceModel.get(model);
        if (
          priorServiceName !== undefined &&
          priorServiceName !== serviceName
        ) {
          throw new Error(
            `Service ${serviceName} model ${modelName} reuses a source model already owned by service "${priorServiceName}"`,
          );
        }
        serviceNameBySourceModel.set(model, serviceName);
      });
    });
  });
}
