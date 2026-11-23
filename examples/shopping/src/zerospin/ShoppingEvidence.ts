import * as Schema from 'effect/Schema';

export const PaymentEvidence = Schema.Struct({
  key: Schema.String,
  state: Schema.Literals(['paid', 'declined']),
  total: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
  reference: Schema.String,
  evidence: Schema.String,
});

export const LabelEvidence = Schema.Struct({
  key: Schema.String,
  labelReference: Schema.String,
  trackingNumber: Schema.String,
  status: Schema.Literal('pre_transit'),
});

export const TrackingEvidence = Schema.Struct({
  key: Schema.String,
  labelReference: Schema.String,
  sequence: Schema.Number,
  status: Schema.Literals(['in_transit', 'delivered']),
});
