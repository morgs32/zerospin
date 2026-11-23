import type { IDevelopmentHistory } from '@zerospin/core/Node/DevelopmentHistorySchema';
import { hashNodeValue, sessionKey } from '@zerospin/core/Node/sessionKey';
import { makeZerospinError } from '@zerospin/error';
import * as Schema from 'effect/Schema';

import {
  makeDiscoveryTransaction,
  resolveDiscoveredDatabase,
} from '../Node/makeDiscoveryTransaction.ts';
import {
  RememberedDevelopmentStorage,
  selectDevelopmentStorage,
} from '../Node/selectDevelopmentStorage.ts';

import { makeServiceNodeDefinition } from './makeServiceNodeDefinition.ts';
import {
  ServiceNodeRequestSchema,
  type IServiceNodeRequest,
} from './serviceNodeRequest.ts';

const entrySchema = Schema.Struct({
  key: Schema.String,
  request: ServiceNodeRequestSchema,
  claims: Schema.Record(Schema.String, Schema.Unknown),
  developmentStorage: Schema.optional(RememberedDevelopmentStorage),
  eligible: Schema.Boolean,
  invalidatedAt: Schema.Number,
});

const transaction = makeDiscoveryTransaction('zerospin:service:discovery');

export const serviceSessionDiscovery = {
  revision: () =>
    transaction<number>('readonly', (store, done, fail) => {
      const request = store.get('revision');
      request.onsuccess = () => {
        try {
          done(
            request.result === undefined
              ? 0
              : Schema.decodeUnknownSync(Schema.Number)(request.result),
          );
        } catch (error) {
          fail(error);
        }
      };
    }),
  async find(
    request: IServiceNodeRequest,
    claims: Readonly<Record<string, unknown>>,
  ) {
    const entries = await transaction<readonly (typeof entrySchema.Type)[]>(
      'readonly',
      (store, done, fail) => {
        const read = store.getAll();
        read.onsuccess = () => {
          try {
            done(
              Schema.decodeUnknownSync(Schema.Array(entrySchema))(
                read.result.filter(value => typeof value !== 'number'),
              ),
            );
          } catch (error) {
            fail(error);
          }
        };
      },
    );
    const locator = await hashNodeValue({ request, claims });
    const matches = [];
    for (const entry of entries) {
      if (
        entry.eligible &&
        (await hashNodeValue({
          request: entry.request,
          claims: entry.claims,
        })) === locator
      ) {
        matches.push(entry);
      }
    }
    if (matches.length !== 1 || matches[0] === undefined) {
      throw makeZerospinError({
        code:
          matches.length === 0
            ? 'node-offline-identity-missing'
            : 'node-offline-identity-ambiguous',
      });
    }
    return matches[0];
  },
  resolveDatabase(
    key: string,
    revision: number,
    online: boolean,
    proof?: IDevelopmentHistory,
  ) {
    return resolveDiscoveredDatabase(
      transaction,
      Schema.decodeUnknownSync(entrySchema),
      key,
      revision,
      online,
      proof,
    );
  },
  async check(key: string, revision: number, offline: boolean) {
    await transaction<void>('readonly', (store, done, fail) => {
      const read = store.get(key);
      read.onsuccess = () => {
        try {
          const entry =
            read.result === undefined
              ? undefined
              : Schema.decodeUnknownSync(entrySchema)(read.result);
          if (
            (entry?.invalidatedAt ?? 0) > revision ||
            (offline && !entry?.eligible)
          ) {
            throw makeZerospinError({ code: 'node-authentication-cancelled' });
          }
          done(undefined);
        } catch (error) {
          fail(error);
        }
      };
    });
  },
  async update(
    request: IServiceNodeRequest,
    claims: Readonly<Record<string, unknown>>,
    revision: number,
    eligible: boolean,
    proof?: IDevelopmentHistory,
  ) {
    const key = await sessionKey(
      (await makeServiceNodeDefinition(request, claims)).identity,
    );
    await transaction<void>('readwrite', (store, done, fail) => {
      const read = store.get(key);
      read.onsuccess = () => {
        try {
          const prior =
            read.result === undefined
              ? undefined
              : Schema.decodeUnknownSync(entrySchema)(read.result);
          if (eligible) {
            if ((prior?.invalidatedAt ?? 0) > revision) {
              throw makeZerospinError({
                code: 'node-authentication-cancelled',
              });
            }
            store.put(
              {
                key,
                request,
                claims,
                eligible,
                developmentStorage: selectDevelopmentStorage(
                  prior?.developmentStorage,
                  proof,
                  true,
                ),
                invalidatedAt: prior?.invalidatedAt ?? 0,
              },
              key,
            );
            done(undefined);
          } else {
            const counter = store.get('revision');
            counter.onsuccess = () => {
              try {
                const next =
                  (counter.result === undefined
                    ? 0
                    : Schema.decodeUnknownSync(Schema.Number)(counter.result)) +
                  1;
                store.put(next, 'revision');
                store.put(
                  {
                    key,
                    request,
                    claims,
                    eligible,
                    developmentStorage: prior?.developmentStorage,
                    invalidatedAt: next,
                  },
                  key,
                );
                done(undefined);
              } catch (error) {
                fail(error);
              }
            };
          }
        } catch (error) {
          fail(error);
        }
      };
    });
  },
};
