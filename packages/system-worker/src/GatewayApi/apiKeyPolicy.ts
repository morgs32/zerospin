/** Credentials selected by the executing Gateway deployment. */
export type IApiKeyPolicy = Readonly<{
  environment: string;
  secretKey: string | undefined;
  publishableKey: string | undefined;
}>;
