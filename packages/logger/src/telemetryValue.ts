import { toStringUnknown } from 'effect/Inspectable';
import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';

/** Diagnostics cannot make an otherwise settled RPC response unserializable. */
export const telemetryValue = (value: unknown): Schema.Json => {
  try {
    const json = Schema.decodeUnknownOption(Schema.Json)(value);
    return Option.isSome(json) ? json.value : toStringUnknown(value);
  } catch {
    return '[unserializable diagnostic]';
  }
};
