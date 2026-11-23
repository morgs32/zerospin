import * as Schema from 'effect/Schema';

export const TriggerPositionSchema = Schema.Literals([
  'bottom-right',
  'bottom-left',
  'top-right',
  'top-left',
  'middle-right',
  'middle-left',
]);
