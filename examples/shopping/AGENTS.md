# Shopping testing restrictions

- Do not add or run browser tests, Playwright tests, or browser-driven verification for Shopping, including manual browser journeys and automated UI checks.
- Verify Shopping behavior with unit tests, contract tests, and Workerd integration tests instead.
- This restriction applies to Shopping only.

## Development sign-in

Use only this repository's existing, configured Portless `.localhost` URLs and
`__dev` sign-in routes for local development and permitted browser verification.
Reuse the documented URLs and running services; start or restart those same
configured services when needed. Do not substitute raw `localhost:PORT` or
`127.0.0.1:PORT` URLs, create extra aliases or subdomains for verification, or
start parallel app servers merely to obtain a fresh browser origin. Keep any
authorized storage isolation behind the existing URLs and follow this
repository's storage rules. Use a different origin only when the user explicitly
requests it.

Open this URL in the browser you use manually for development:

- [Shopping sign-in](https://shopping.zerospin.localhost/__dev/log-me-in/morgan.intrator%40gmail.com?returnTo=/)

The route is `/__dev/log-me-in/<email>?returnTo=<path>`. Use an existing email in
Shopping's Clerk development application and URL-encode it.

The Shopping frontend's ignored `.env.local` needs matching development
`VITE_CLERK_PUBLISHABLE_KEY` and server-only `CLERK_SECRET_KEY` values. The login
page loads Clerk independently of Shopping's Aggregate and Service sessions.
A same-origin POST finds the existing Clerk user and reuses the current identity
or issues a 60-second sign-in ticket. Switching ends the active Clerk session
before activation. Unknown users are never created; application permissions and
Actor authentication remain unchanged.

Tickets stay out of URLs and responses are uncached. Only safe relative return
paths are accepted; missing or unsafe values fall back to `/`. Login routes and
handler code are excluded from production builds, where GET and POST return 404.
`curl` does not sign in the browser. The browser-verification restriction above
still applies to agent work: use the existing Shopping Nx checks and HTTP checks.

## Start from first principles

In design discussions and implementation, name the required behavior and sketch
the simplest end-to-end flow you’d build today before using existing code as a
starting point. Show the underlying calls. Keep a wrapper, state, or handoff only
if you can name the problem it solves. Remove machinery the design no longer needs.
