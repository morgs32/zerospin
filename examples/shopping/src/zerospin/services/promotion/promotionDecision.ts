import * as Schema from 'effect/Schema';

export const PromotionDecisionSchema = Schema.Struct({
  reservationId: Schema.TemplateLiteral(['prv_', Schema.NonEmptyString]),
  status: Schema.Literals([
    'reserved',
    'denied',
    'committed',
    'released',
    'redeemed',
  ]),
  purchaseId: Schema.NullOr(
    Schema.TemplateLiteral(['pur_', Schema.NonEmptyString]),
  ),
  expiresAt: Schema.NullOr(Schema.Number.check(Schema.isInt())),
});
