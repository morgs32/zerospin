/**
 * Declare primitives inline at every use site; never assign a primitive descriptor
 * to a variable. This applies to application code, framework code, and fixtures.
 * Reuse an Effect schema when needed, but inline its primitives.json wrapper.
 * Tests that inspect or mutate an authored shape should access its properties.
 *
 * @bad const purchaseId = sdk.modelId({ model: purchase });
 * @bad const expectedPurchase = sdk.primitives.json({ schema: ExpectedPurchaseSchema });
 */
const requestPayment = sdk.makeAggregateContractRelease(identity, {
  payload: {
    purchaseId: sdk.modelId({ model: purchase }),
    expected: sdk.primitives.json({ schema: ExpectedPurchaseSchema }),
  },
});
