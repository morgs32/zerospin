import { makeMigratableDORepoConfig } from '../makeMigratableDORepo/makeMigratableDORepoConfig.js';

import {
  serviceChainBaseline,
  serviceChainDbConfig,
  serviceChainWithSerializedReceipts,
} from './serviceChainDbConfig.js';
import { serviceChainName } from './serviceChainName.js';
export const serviceChainMigratableDORepoConfig = makeMigratableDORepoConfig({
  migrations: [
    {
      id: 1,
      name: 'retain hosted Service Agent admission receipts',
      sql: [
        'CREATE TABLE "agentCommandReceipts" ("commandId" text PRIMARY KEY NOT NULL, "command" text NOT NULL, "serviceIndex" integer NOT NULL);',
      ],
      sourceTables: serviceChainBaseline.definition.provisioning,
    },
    {
      id: 2,
      name: 'store Service Agent receipt command fields',
      sql: [
        'ALTER TABLE "agentCommandReceipts" RENAME TO "serializedAgentCommandReceipts";',
        'CREATE TABLE "agentCommandReceipts" ("commandId" text PRIMARY KEY NOT NULL, "commandName" text NOT NULL, "payload" text NOT NULL, "contractVersion" integer NOT NULL, "serviceVersion" integer NOT NULL, "agentName" text NOT NULL, "agentVersion" integer NOT NULL, "serviceIndex" integer NOT NULL);',
        `INSERT INTO "agentCommandReceipts"
      SELECT "commandId", json_extract("command", '$.commandName'), json_extract("command", '$.payload'),
             json_extract("command", '$.contractVersion'), json_extract("command", '$.serviceVersion'),
             json_extract("command", '$.agentName'), json_extract("command", '$.agentVersion'), "serviceIndex"
      FROM "serializedAgentCommandReceipts";`,
        'DROP TABLE "serializedAgentCommandReceipts";',
      ],
      sourceTables: serviceChainWithSerializedReceipts.definition.provisioning,
    },
  ],
  ...serviceChainName,
  dbConfig: serviceChainDbConfig,
});
