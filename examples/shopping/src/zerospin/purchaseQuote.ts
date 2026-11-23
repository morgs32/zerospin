import * as Schema from 'effect/Schema';

const PurchaseLine = Schema.Struct({
  id: Schema.TemplateLiteral(['pit_', Schema.String]),
  productId: Schema.TemplateLiteral(['prd_', Schema.String]),
  quantity: Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0)),
});

export const PurchaseSnapshot = Schema.Struct({
  cartId: Schema.TemplateLiteral(['crt_', Schema.String]),
  purchaseId: Schema.TemplateLiteral(['pur_', Schema.String]),
  items: Schema.Array(PurchaseLine),
});

export const PurchaseQuote = Schema.Struct({
  ...PurchaseSnapshot.fields,
  items: Schema.Array(
    Schema.Struct({
      ...PurchaseLine.fields,
      name: Schema.String,
      price: Schema.Number.check(
        Schema.isInt(),
        Schema.isGreaterThanOrEqualTo(0),
      ),
    }),
  ),
  subtotal: Schema.Number.check(
    Schema.isInt(),
    Schema.isGreaterThanOrEqualTo(0),
  ),
});

export const PurchaseQuoteResult = Schema.Union([
  Schema.Struct({ state: Schema.Literal('quoted'), quote: PurchaseQuote }),
  Schema.Struct({
    state: Schema.Literal('refused'),
    purchaseId: Schema.TemplateLiteral(['pur_', Schema.String]),
    message: Schema.String,
  }),
]);
