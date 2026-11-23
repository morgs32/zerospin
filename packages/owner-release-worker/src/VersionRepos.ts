import { AggregateVersionRepo } from './AggregateVersionRepo/AggregateVersionRepo.js';
import { ServiceVersionRepo } from './ServiceVersionRepo/ServiceVersionRepo.js';

export { AggregateVersionRepo, ServiceVersionRepo };

export type IAggregateVersionRepoInstance = InstanceType<
  typeof AggregateVersionRepo
>;
export type IServiceVersionRepoInstance = InstanceType<
  typeof ServiceVersionRepo
>;
