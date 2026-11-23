import { makeZerospinErrorFactory } from './makeZerospinError.js';

export const makeNodeClosedError = makeZerospinErrorFactory({
  code: 'node-closed',
  message: 'Node is closing or closed',
});
export const makeNodeCommandInputConflictError = makeZerospinErrorFactory({
  code: 'node-command-input-conflict',
  message: 'Command ID already retains different immutable input',
});
