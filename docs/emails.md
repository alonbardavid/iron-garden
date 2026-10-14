# Emails

Transactional email is react-email components rendered to HTML in the Worker and sent
through Cloudflare's `send_email` binding. Every target binds `SEND_EMAIL`; whether email is
used is an instance setting, **off by default**. Runtime rendering adds ~184 kB gzip to the
Worker (react, react-dom/server, `@react-email/*`) — accepted over a build-time template
pipeline.

## Turning email on

**Admin › Email sending** (`/admin/email`) has Disabled / Enabled, a sender email with a "Send
test email" button (greyed out while disabled), and an info icon with the domain setup
steps; Save stores the choice and the sender as the `email.enabled` and
`email.sender` instance settings (`saveEmailSettings` in `@lib/capabilities`). The test
(`sendTestEmail` in `@lib/email-service`) mails the admin from the typed sender and saves
nothing. Enabling needs a sender. The sender must be on a domain onboarded to Cloudflare
Email Service (Workers Paid); otherwise sends fail at runtime, not at deploy.

`getEmailSettings()` reads the settings on every call, since an admin changes them at
runtime. `getCapabilities()` reports `email: true` when enabled with a sender, and answers
`GET /api/capabilities` for the SPA.

## When email is off

Sign-up is always off. With `email: false`, the login screen hides the forgot-password link
and routes, and better-auth's email endpoints are refused (its senders stay configured, since
email can come on at runtime). Admins create users with temporary passwords instead of
invites. `sendEmail` throws rather than silently dropping a message.

## Packages

- `@lib/email-ds` — the email design system: `EmailLayout`, `renderEmail(template, props)`,
  the `EmailTemplate` / `RenderedEmail` types, and `emailGlobals` (the product name, from
  `PRODUCT_DISPLAY_NAME`). Separate from `@lib/ds`, which is the Mantine app UI.
- `@lib/email-service` — `sendEmail({ to, subject, html, text?, fromName?, from? })`, from
  the instance's sender unless `from` is given. It stays product-agnostic; the caller
  passes `fromName`. Also `sendTestEmail`, the admin page's test.
- A template lives with the service that sends it: `libs/identity/src/emails/` for auth
  mail, `libs/email-service/src/emails/` for the test email.

## Templates

A template file default-exports a component built from `@react-email/components` with
**inline `style` objects** — never the `<Tailwind>` component, which trips workerd's script
startup CPU limit. It also exports a `subject` and sets `Component.PreviewProps`. Only
per-send data (`name`, `url`) are props; brand constants come from `emailGlobals`.

To add one: create `<service>/src/emails/<name>.tsx`, export it typed from that folder's
`index.ts`, and add a re-export shim in root `emails/` so `pnpm email:dev`
(http://localhost:3100) previews it.

## Invites and password reset

When email is on, the admin Users page creates a user with no password, and the
`/admin/create-user` after-hook in `auth.ts` sends `invite`: a reset-password token that lasts 7
days instead of 1 hour, so better-auth's own `/reset-password` redeems it and creates the
credential account. Its link lands on `/reset-password?invite=1`. The user's `invited` flag
shows them as "Invitation pending" until any password is set (`passwordSet` in
`users.ts`), which also clears `mustChangePassword`. Redeeming an invite signs the user in:
the `/reset-password` before-hook notes an invited user's token, and the after-hook creates
their session. Creating a user with no password while
email is off is refused. With a password, the user starts on a temporary one, as without
email.

When email is on, sign-up requires email verification: `POST /api/auth/sign-up/email` creates an unverified
user and sends `verify-email`; the link verifies and signs the user in. An unverified
sign-in gets `403 EMAIL_NOT_VERIFIED`, and a duplicate email gets `422 USER_ALREADY_EXISTS`
from a `hooks.before` guard. Forgot-password sends `reset-password`. Verification tokens are
stateless JWTs signed with `BETTER_AUTH_SECRET`.

## Local and e2e

Local `vite dev` (miniflare) simulates sends and writes `.eml` files under
`<os-tmpdir>/miniflare-*/email/`. The e2e helpers in `tests/e2e/email/` parse them with
`postal-mime`, matching on the recipient, and mount the HTML in a Playwright page so specs use
ordinary locators. `tests/global-setup.ts` turns email on from `noreply@iron-garden.local`;
local dev starts with it off, like any instance.
