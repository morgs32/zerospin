import type { ComponentProps } from 'react';

import type { ISystemSpec } from '@zerospin/core/system/types';
import { PrimitiveKind } from '@zerospin/shapes';
import type { DeclarationCard, SystemOutline } from '@zerospin/system-diagrams';

export const actorCard = {
  id: 'mentor',
  type: 'actor',
  name: 'mentor',
  versions: [1],
} satisfies ComponentProps<typeof DeclarationCard>['card'];
export const agentCard = {
  id: 'notification',
  type: 'agent',
  name: 'notification',
  versions: [1],
} satisfies ComponentProps<typeof DeclarationCard>['card'];
export const modelCard = {
  id: 'channel',
  type: 'model',
  name: 'channel',
  versions: [1],
  models: [
    {
      modelName: 'channel',
      abbreviation: 'chn',
      version: 1,
      attributes: [],
      attributesShape: {},
      indexes: [],
      propertiesShape: {
        id: {
          kind: PrimitiveKind.Id,
          abbreviation: 'chn',
          primaryKey: true,
          nullable: false,
          unique: true,
        },
        name: {
          kind: PrimitiveKind.Text,
          primaryKey: false,
          nullable: false,
          unique: false,
        },
        archivedAt: {
          kind: PrimitiveKind.Date,
          primaryKey: false,
          nullable: true,
          unique: false,
        },
      },
    },
  ],
} satisfies ComponentProps<typeof DeclarationCard>['card'];
export const contractCard = {
  id: 'createChannel',
  type: 'contract',
  name: 'createChannel',
  versions: [1],
  contracts: [
    {
      commandName: 'createChannel',
      version: 1,
      payloadShape: {
        name: {
          kind: PrimitiveKind.Text,
          primaryKey: false,
          nullable: false,
          unique: false,
        },
      },
      claimsJsonSchema: {},
      failureJsonSchema: {},
      resultJsonSchema: {},
      models: {},
      operations: [],
      operationsJsonSchema: {},
    },
  ],
} satisfies ComponentProps<typeof DeclarationCard>['card'];
export const board = {
  aggregates: [
    {
      id: 'organization',
      name: 'organization',
      declarations: [actorCard, modelCard, contractCard],
    },
    { id: 'user', name: 'user', declarations: [] },
  ],
  services: [
    {
      id: 'directMessageChannels',
      name: 'directMessageChannels',
      declarations: [],
    },
    {
      id: 'organizationMembership',
      name: 'organizationMembership',
      declarations: [],
    },
  ],
} satisfies ComponentProps<typeof SystemOutline>['board'];

type IStoryModel =
  ISystemSpec['aggregates'][string]['modelVersions'][string][number];
type IStoryActor =
  ISystemSpec['aggregates'][string]['actorVersions'][string][number];
type IStoryContract =
  ISystemSpec['aggregates'][string]['contractVersions'][string][number];

const textProperty = {
  kind: PrimitiveKind.Text,
  primaryKey: false,
  nullable: false,
  unique: false,
} satisfies IStoryModel['propertiesShape'][string];
const rosterV1 = {
  modelName: 'roster',
  abbreviation: 'rst',
  version: 1,
  attributes: [],
  attributesShape: {},
  indexes: [],
  propertiesShape: { displayName: textProperty, privateNote: textProperty },
} satisfies IStoryModel;
const rosterV2 = {
  ...rosterV1,
  version: 2,
  propertiesShape: { ...rosterV1.propertiesShape, email: textProperty },
} satisfies IStoryModel;
const auditModel = {
  ...rosterV1,
  modelName: 'audit',
  abbreviation: 'aud',
  propertiesShape: { auditMessage: textProperty },
} satisfies IStoryModel;
const digestModel = {
  ...rosterV1,
  modelName: 'digest',
  abbreviation: 'dgt',
  propertiesShape: { queuedMessage: textProperty },
} satisfies IStoryModel;
const updateRosterV1 = {
  commandName: 'updateRoster',
  version: 1,
  payloadShape: { reason: textProperty },
  claimsJsonSchema: null,
  failureJsonSchema: {},
  resultJsonSchema: {},
  models: {},
  operations: [],
  operationsJsonSchema: {},
} satisfies IStoryContract;
const updateRosterV2 = {
  ...updateRosterV1,
  version: 2,
  payloadShape: { message: textProperty },
} satisfies IStoryContract;
const sendDigestV1 = {
  ...updateRosterV1,
  commandName: 'sendDigest',
  payloadShape: { recipient: textProperty },
} satisfies IStoryContract;
const mentorV1 = {
  name: 'mentor',
  version: 1,
  identity: { claimsJsonSchema: {}, identityJsonSchema: {}, pattern: '/:id' },
  authentication: { credentialsJsonSchema: {} },
  exposedModels: {
    roster: {
      modelName: 'roster',
      abbreviation: 'rst',
      version: 1,
      attributes: [],
      attributesShape: {},
      propertiesShape: { displayName: textProperty },
      indexes: [],
    },
  },
  contracts: {},
  selections: {},
} satisfies IStoryActor;
const mentorV2 = {
  ...mentorV1,
  version: 2,
  exposedModels: {
    roster: {
      ...mentorV1.exposedModels.roster,
      version: 2,
      propertiesShape: { displayName: textProperty, email: textProperty },
    },
  },
  contracts: { updateRoster: 2 },
} satisfies IStoryActor;
const administratorV1 = {
  ...mentorV1,
  name: 'administrator',
  contracts: { updateRoster: 1 },
} satisfies IStoryActor;
const digestWorkerV1 = {
  name: 'digestWorker',
  agentVersion: 1,
  sessionName: 'digestWorkerSession',
  selectionSemantics: 'selected-rows',
  models: { digest: digestModel },
  contracts: { sendDigest: 1 },
  selections: {},
  ownerReleaseVersion: 1,
  wakeRules: {},
} satisfies ISystemSpec['aggregates'][string]['agentVersions'][string][number];

const organizationReleaseV2 = {
  name: 'organization',
  version: 2,
  rebuildFrom: 1,
  models: { roster: 2, audit: 1 },
  actors: { mentor: 2 },
  contracts: { updateRoster: 2, sendDigest: 1 },
  system: {},
  external: {},
} satisfies ISystemSpec['aggregates'][string]['releases'][number];

export const filteringSystemSpec = {
  systemName: 'Filtering example',
  hash: '0'.repeat(64),
  aggregates: {
    organization: {
      releases: {
        1: {
          name: 'organization',
          version: 1,
          models: { roster: 1, audit: 1, digest: 1 },
          actors: { mentor: 1, administrator: 1 },
          contracts: { updateRoster: 1, sendDigest: 1 },
          system: {},
          external: {},
        },
        2: organizationReleaseV2,
        3: {
          ...organizationReleaseV2,
          version: 3,
          rebuildFrom: 2,
        },
      },
      modelVersions: {
        roster: { 1: rosterV1, 2: rosterV2 },
        audit: { 1: auditModel },
        digest: { 1: digestModel },
      },
      actorVersions: {
        mentor: { 1: mentorV1, 2: mentorV2 },
        administrator: { 1: administratorV1 },
      },
      agentVersions: { digestWorker: { 1: digestWorkerV1 } },
      contractVersions: {
        updateRoster: { 1: updateRosterV1, 2: updateRosterV2 },
        sendDigest: { 1: sendDigestV1 },
      },
    },
  },
  services: {},
  aggregateAgents: {},
  serviceAgents: {},
} satisfies ISystemSpec;
