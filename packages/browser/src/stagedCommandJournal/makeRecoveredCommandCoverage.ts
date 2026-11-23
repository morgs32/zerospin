import { makeNodeCommandId } from '@zerospin/core/contracts/commandIds';
import {
  NodeRetentionSchema,
  type INodeCommandCoverage,
  type INodeRetention,
} from '@zerospin/core/Node/NodeCommandCoverage';
import { sessionSubmissionKey } from '@zerospin/core/Node/sessionSubmissionKey';
import { makeZerospinError } from '@zerospin/error';
import * as Schema from 'effect/Schema';
import { isEqual } from 'es-toolkit';

type IRecoveryCommand = {
  sessionId: string;
  sessionIndex: number;
  commandName: string;
};
type IRecoveryResolution = { id: string; commandName: string };
type IRecoveryRecord<COMMAND, RESOLUTION> = {
  command: COMMAND;
  retention: INodeRetention | null;
  resolution: RESOLUTION | null;
};

/** Validate recovered interests separately from current-session command rows. */
export function makeRecoveredCommandCoverage<
  COMMAND extends IRecoveryCommand,
  RESOLUTION extends IRecoveryResolution,
>(props: { nodeId: string; resolutionIndex(resolution: RESOLUTION): number }) {
  const { nodeId, resolutionIndex } = props;
  const records = new Map<string, IRecoveryRecord<COMMAND, RESOLUTION>>();
  const checkRetention = (
    record: IRecoveryRecord<COMMAND, RESOLUTION>,
    retention: INodeRetention,
  ) => {
    if (
      retention.nodeId !== nodeId ||
      (record.retention !== null && !isEqual(record.retention, retention))
    ) {
      throw makeZerospinError('session-staged-coordinate-conflict');
    }
  };
  return {
    resetResolutions() {
      for (const record of records.values()) record.resolution = null;
    },
    register(command: COMMAND) {
      const key = sessionSubmissionKey(command);
      const previous = records.get(key);
      if (previous !== undefined) {
        if (!isEqual(previous.command, command)) {
          throw makeZerospinError('node-command-input-conflict');
        }
        return;
      }
      records.set(key, {
        command: structuredClone(command),
        retention: null,
        resolution: null,
      });
    },
    retain(input: INodeRetention) {
      const retention = Schema.decodeUnknownSync(NodeRetentionSchema)(input, {
        onExcessProperty: 'error',
      });
      const record = records.get(sessionSubmissionKey(retention));
      if (record === undefined) {
        throw makeZerospinError('session-snapshot-pending-partition-invalid');
      }
      checkRetention(record, retention);
      record.retention = retention;
    },
    validate(
      coverage: readonly INodeCommandCoverage<RESOLUTION>[],
      checkpoint: {
        sessionId: string;
        nodeIndex: number;
        checkpointIndex: number;
      },
    ) {
      const current: INodeCommandCoverage<RESOLUTION>[] = [];
      const recovered: INodeCommandCoverage<RESOLUTION>[] = [];
      const seen = new Set<string>();
      const updates: {
        record: IRecoveryRecord<COMMAND, RESOLUTION>;
        retention: INodeRetention;
        resolution: RESOLUTION | null;
      }[] = [];
      for (const entry of coverage) {
        const key = sessionSubmissionKey(entry);
        if (seen.has(key)) {
          throw makeZerospinError('session-snapshot-pending-partition-invalid');
        }
        seen.add(key);
        if (entry.sessionId === checkpoint.sessionId) {
          current.push(entry);
          continue;
        }
        const record = records.get(key);
        if (
          record === undefined ||
          record.command.commandName !== entry.commandName
        ) {
          throw makeZerospinError('session-snapshot-pending-partition-invalid');
        }
        if (entry.nodeId !== null) {
          const retention = Schema.decodeUnknownSync(NodeRetentionSchema)({
            sessionId: entry.sessionId,
            sessionIndex: entry.sessionIndex,
            nodeId: entry.nodeId,
            nodeIndex: entry.nodeIndex,
            pushIndex: entry.pushIndex,
          });
          checkRetention(record, retention);
          if (retention.nodeIndex > checkpoint.nodeIndex) {
            throw makeZerospinError('session-staged-coordinate-conflict');
          }
          const resolution = entry.resolution;
          if (resolution !== null) {
            const index = resolutionIndex(resolution);
            if (
              resolution.id !==
                makeNodeCommandId(retention.nodeId, retention.pushIndex) ||
              resolution.commandName !== record.command.commandName ||
              !Number.isSafeInteger(index) ||
              index < 1 ||
              index > checkpoint.checkpointIndex ||
              (record.resolution !== null &&
                !isEqual(record.resolution, resolution))
            ) {
              throw makeZerospinError('session-snapshot-receipt-invalid');
            }
          }
          updates.push({
            record,
            retention,
            resolution:
              resolution === null ? null : structuredClone(resolution),
          });
        } else if (entry.resolution !== null) {
          throw makeZerospinError('session-staged-coordinate-conflict');
        }
        recovered.push(entry);
      }
      return {
        current,
        recovered,
        commit() {
          // Installation may notify observers; recheck before changing recovery facts.
          for (const { record, retention, resolution } of updates) {
            checkRetention(record, retention);
            if (
              record.resolution !== null &&
              resolution !== null &&
              !isEqual(record.resolution, resolution)
            ) {
              throw makeZerospinError('session-snapshot-receipt-invalid');
            }
          }
          for (const { record, retention, resolution } of updates) {
            record.retention = retention;
            if (resolution !== null) record.resolution = resolution;
          }
        },
      };
    },
  };
}
