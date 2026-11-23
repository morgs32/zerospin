/** Routes a render failure through nested owners without changing its diagnostics. */
export class SessionQueryError extends Error {
  constructor(
    readonly session: object,
    readonly error: unknown,
  ) {
    super('Session query failed.', { cause: error });
  }
}
