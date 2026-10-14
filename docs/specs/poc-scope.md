# POC scope: screens and settings

The smallest product a designer needs to cover for the IronGarden POC. Basics match GitHub;
the only extra capability is **grouped PRs**, whose screens are being designed in the
_Code review UI designs_ thread (streamlined canvas in `designs/streamlined/`). This file
lists everything around it.

Defaults marked **(default)** are what we build unless Alon says otherwise. Open questions are
at the end.

## How the POC is built

| Area        | Decision                                                                                                                                                                                                                                                                                                                                |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin       | better-auth's **admin plugin**. An admin is an ordinary user with the `admin` role who also sees the Admin pages and actions. There is no separate admin app or admin login                                                                                                                                                             |
| Sign-in     | better-auth email + password, plus its **username plugin** so people sign in with either. The username is also the git login                                                                                                                                                                                                            |
| API keys    | better-auth's **API key plugin**. Every key belongs to a user. A key's `metadata.kind` says what it is: `user` for a person's own key (prefix `cgit_pat_`), `agent` for an agent's key (prefix `cgit_agt_`, with `metadata.agentId`). Keys are stored hashed and shown once                                                             |
| Git storage | **Cloudflare Artifacts**: each repository is an Artifacts repo in the instance's namespace. People clone and push through `/<name>.git` on the instance with an API key; the Worker checks access and proxies to Artifacts with a short-lived repo token. Artifacts needs the Workers Paid plan                                         |
| Agent work  | Agents start a **session** through the API and get their own forked session repository, a git token for it and instructions; they open pull requests through the API and group the change themselves with a prompt the admin can edit. See _POC: session start and pull requests_ in [agent-collaboration.md](./agent-collaboration.md) |

## 1. First run

| Screen | What it does                                                                                                                                                 |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Setup  | Shown only while no admin exists. Asks for the setup token typed into the deploy button, then admin email, name and password. Disappears for good once used. |

Decided: setup screen guarded by the `SETUP_TOKEN` secret the deploy button asks for. The
button prompts for it once at first deploy and stores it as a Worker secret.

## 2. Signed in, every user

| Screen              | What it does                                                                                                                                                                        |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login               | Username or email + password. "Forgot password?" only when email is enabled (otherwise "Ask your admin").                                                                           |
| Set new password    | Forced after the first login with an admin-set password, and after an admin reset.                                                                                                  |
| Repositories (home) | Repos the user can access, with an empty state: "No repos yet" (admins get a create button, users get "Ask an admin for access").                                                   |
| Repo: empty         | Clone URL, the push commands, and how to authenticate (username + API key).                                                                                                         |
| Repo: code          | File tree, file view, README, branch picker, commit list. Read-only.                                                                                                                |
| Repo: pull requests | List (processing / open / merged / closed). Pull requests are opened by agents through the session API; a New PR form for people comes later.                                       |
| PR                  | Conversation, Files, Groups, approve, merge (merge commit only). Designed in the review thread.                                                                                     |
| Account: profile    | Name, email (read-only unless admin).                                                                                                                                               |
| Account: password   | Change password.                                                                                                                                                                    |
| Account: API keys   | The user's own keys for git from their machine. List (name, created, last used, expiry), create, revoke. The key is shown once with a copy button and a ready-to-use clone example. |
| Account: agents     | Agents the user owns. Create an agent (name), pick which of the user's repos it can reach and at what level (never above the user's own), deactivate.                               |
| Agent detail        | The agent's repo access and its API keys (same create/revoke dialog as personal keys).                                                                                              |

## 3. Repo settings (repo admins)

| Screen  | What it does                                                                            |
| ------- | --------------------------------------------------------------------------------------- |
| General | Rename, description, default branch, delete (type the name to confirm).                 |
| Access  | Add a user with a level: **Read, Write, Admin (default levels)**; change level; remove. |

## 4. Admin (instance admins)

| Screen         | What it does                                                                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| New repository | Admins only. Name, optional description, then straight to the Access screen to add members.                                                         |
| Users          | List with role and status; create user (name, email, temporary password or email invite); reset password; make admin; deactivate.                   |
| User detail    | Their repos and levels, their agents and API keys (revoke only).                                                                                    |
| Repositories   | Every repo, including ones the admin is not a member of, with links to each repo's settings.                                                        |
| Email          | Status (Not set up / Working / Error), sender address, "Send test email", and the setup steps.                                                      |
| Review         | The grouping prompt agents receive when they open a pull request: edit, save, and _Restore default_. Shows whether the saved prompt is the default. |

### Email setting, in detail

What setup really involves, per Cloudflare's Email Service docs:

1. The admin's domain must use Cloudflare DNS. They onboard it under **Email Service > Email
   Sending** in the dashboard, which adds SPF/DKIM/DMARC records. Real delivery also needs
   Workers Paid.
2. The Worker needs a `send_email` binding.
3. The app needs to know which address to send from.

The deploy button clones the repo into the admin's own GitHub account, so the binding is
added by editing their fork's wrangler config (a binding added only in the dashboard is
removed on the next deploy). When email is off, the Email screen shows the setup guide:

1. Onboard your domain under Email Service > Email Sending in the Cloudflare dashboard.
2. Add the `send_email` binding to `wrangler.jsonc` in your repo and push. The screen shows a
   single patch file with **Copy** and **Download** buttons (apply with `git apply`), plus the
   snippet for editing by hand.
3. After the redeploy, enter the sender address here and send a test email.

"Enabled" means the binding is present and the last test email succeeded. Upstream updates
that touch `wrangler.jsonc` may need a small merge in the fork.

What email turns on: invite emails (user sets their own password from a link), forgot
password, and later notifications. Without it, the admin hands out temporary passwords
and resets them by hand.

## Gaps in the flow, with the default we picked

1. **Git authentication.** Git over HTTPS takes a username and an API key as the password;
   account passwords are never accepted by git. The empty-repo screen and key-created dialog
   must say this. Humans need keys too, not just agents.
2. **Agents and keys.** Agents are their own identities, owned by a user, each with its own
   keys (better-auth API keys on the owner, marked `kind: agent` in their metadata). An agent's repo access is a subset of its owner's, and shrinks if the owner loses
   access; deactivating the owner deactivates their agents. Keys (personal or agent) have an
   expiry (30 / 90 days / never, default 90). Pushes and PRs show the agent's name with its
   owner ("deploy-bot, owned by Alon").
3. **Who creates repos.** Admins only (decided). An admin adds members on creation.
4. **Roles.** Two instance roles (admin, user) and three repo levels (read, write, admin).
   No organizations or teams in the POC (the spec puts orgs in Phase 2).
5. **Invites and resets without email.** Admin sets a temporary password, the user must
   change it on first login. With email, the admin can send an invite link instead.
6. **Locked-out admin.** If the only admin forgets their password, there must be a way in.
   Default: the setup token also unlocks a "reset an admin's password" screen, and the
   admin screen blocks removing or deactivating the last admin.
7. **Deactivating a user.** Deactivate rather than delete: sign-in and all their keys stop
   working, their commits and PRs stay.
8. **Visibility.** All repos are private to their members (admins see all). No public repos
   and no anonymous clone in the POC.
9. **Merging.** Merge commit only, no branch protection, no required approvals. Conflicts
   block merge with "resolve locally and push".
10. **Single app.** Decided: one app, one login. Admin is better-auth's admin plugin and the
    admin pages are shown to users with the admin role; edge-stack's admin app is removed.

Not in the POC: organizations, SSH, custom domains (the `workers.dev` URL is used),
notifications, webhooks and CI checks, issues, the agent-collaboration features, and the
other review features from the spec.
