import * as Schema from 'effect/Schema';

import type { IAnyMachine } from '../types.js';

import { decodeMachineData } from './decodeMachineData.js';
import { CanonicalMachineSchema } from './Machine.js';

export const validateMachine: (
  input: unknown,
) => asserts input is IAnyMachine = input => {
  Schema.decodeUnknownSync(CanonicalMachineSchema)(input);
  decodeMachineData(input, true);
};
