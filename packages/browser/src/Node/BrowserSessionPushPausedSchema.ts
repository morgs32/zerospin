import * as Schema from 'effect/Schema';

export const BrowserSessionPushPausedSchema = Schema.Struct({
  pushPaused: Schema.Boolean,
});
