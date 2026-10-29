import {
  endSession,
  fetchNotifications,
  getSession,
  listenAgain,
  replyInSessionChat,
  reportActivity,
  sendMessage,
  sessionToken,
  startSession,
  updateSession,
  type Session,
} from "@lib/collab";
import {
  createPullRequest,
  getPullRequest,
  getPullRequestFile,
  getPullRequestReference,
  getReview,
  acceptChanges,
  countPullRequests,
  listPullRequests,
  refreshPullRequest,
  submitGroups,
} from "@lib/review";
import { waitUntil } from "cloudflare:workers";
import {
  createGithubPullRequest,
  githubPullStatus,
  mergePullRequest,
  pullRequestRevised,
} from "@lib/github";
import { pullRequestsFromGithub } from "./github";
import { activity, comments } from "./activity";
import { chat } from "./chat";
import { api } from "./api";
import {
  chatEndpoints,
  listenEndpoints,
  pullRequestLinks,
  sessionLinks,
} from "./links";

const toSession = (session: Session) => ({
  id: session.id,
  repository: session.repositoryName,
  agent: session.agentName,
  title: session.title,
  goal: session.goal,
  context: session.context,
  status: session.status,
  baseBranch: session.baseBranch,
  baseCommit: session.baseCommit,
  contact: session.contact,
  createdAt: session.createdAt,
  updatedAt: session.updatedAt,
});

export const sessions = api.sessions.router({
  start: api.sessions.start.handler(
    async ({
      context: { principal, origin, reqHeaders },
      input: { repository, ...details },
    }) => {
      const links = sessionLinks(origin);
      const started = await startSession(
        principal,
        repository,
        details,
        links,
        reqHeaders?.get("user-agent") ?? null,
      );
      return {
        session: toSession(started.session),
        git: {
          ...started.git,
          baseBranch: started.session.baseBranch,
          baseCommit: started.session.baseCommit,
        },
        instructions: started.instructions,
        links: links(started.session.id),
        listen: listenEndpoints(origin)(started.listenKey),
      };
    },
  ),
  get: api.sessions.get.handler(
    async ({ context: { principal, origin }, input }) => ({
      ...toSession(await getSession(principal, input.id)),
      links: sessionLinks(origin)(input.id),
    }),
  ),
  update: api.sessions.update.handler(
    async ({ context: { principal }, input: { id, ...details } }) =>
      toSession(await updateSession(principal, id, details)),
  ),
  token: api.sessions.token.handler(
    ({ context: { principal, origin }, input }) =>
      sessionToken(principal, input.id, sessionLinks(origin)),
  ),
  end: api.sessions.end.handler(async ({ context: { principal }, input }) =>
    toSession(await endSession(principal, input.id)),
  ),
  activity: api.sessions.activity.handler(
    ({ context: { principal }, input: { id, ...report } }) =>
      reportActivity(principal, id, report),
  ),
  notifications: api.sessions.notifications.handler(
    ({ context: { principal }, input }) =>
      fetchNotifications(principal, input.id),
  ),
  listen: api.sessions.listen.handler(
    ({ context: { principal, origin }, input }) =>
      listenAgain(principal, input.id, listenEndpoints(origin)),
  ),
  sendMessage: api.sessions.sendMessage.handler(
    ({ context: { principal }, input: { id, ...message } }) =>
      sendMessage(principal, id, message),
  ),
  chat: {
    reply: api.sessions.chat.reply.handler(
      ({ context: { principal }, input }) =>
        replyInSessionChat(principal, input.id, input.body),
    ),
  },
  createPullRequest: api.sessions.createPullRequest.handler(
    ({ context: { principal, origin }, input: { id, ...pr } }) =>
      createPullRequest(
        principal,
        id,
        pr,
        pullRequestLinks(origin),
        chatEndpoints(origin),
      ),
  ),
});

export const pullRequests = api.pullRequests.router({
  activity,
  comments,
  chat,
  list: api.pullRequests.list.handler(
    ({ context: { principal }, input: { name, ...request } }) =>
      listPullRequests(principal, name, request),
  ),
  counts: api.pullRequests.counts.handler(({ context: { principal }, input }) =>
    countPullRequests(principal, input.name),
  ),
  get: api.pullRequests.get.handler(({ context: { principal }, input }) =>
    getPullRequest(principal, input.name, input.number),
  ),
  file: api.pullRequests.file.handler(({ context: { principal }, input }) =>
    getPullRequestFile(principal, input.name, input.number, input.path),
  ),
  reference: api.pullRequests.reference.handler(
    ({ context: { principal }, input }) =>
      getPullRequestReference(principal, input.name, input.number, input.path),
  ),
  review: api.pullRequests.review.handler(({ context: { principal }, input }) =>
    getReview(principal, input.name, input.number),
  ),
  accept: api.pullRequests.accept.handler(({ context: { principal }, input }) =>
    acceptChanges(
      principal,
      input.name,
      input.number,
      input.accepted,
      input.changes,
    ),
  ),
  github: api.pullRequests.github.handler(({ context: { principal }, input }) =>
    githubPullStatus(principal, input.name, input.number),
  ),
  createInGithub: api.pullRequests.createInGithub.handler(
    async ({ context: { principal }, input }) => {
      await createGithubPullRequest(principal, input.name, input.number);
      return { ok: true as const };
    },
  ),
  merge: api.pullRequests.merge.handler(
    async ({ context: { principal }, input }) => {
      await mergePullRequest(principal, input.name, input.number, input.method);
      return getPullRequest(principal, input.name, input.number);
    },
  ),
  // A connected repository's GitHub branch and workflow rules follow each
  // revision, after the agent has its answer.
  submitGroups: api.pullRequests.submitGroups.handler(
    async ({ context: { principal }, input }) => {
      const pr = await submitGroups(
        principal,
        input.id,
        input.groups,
        input.rules,
      );
      waitUntil(pullRequestRevised(pr.id));
      return pr;
    },
  ),
  refresh: api.pullRequests.refresh.handler(
    async ({ context: { principal, origin }, input }) => {
      const refreshed = await refreshPullRequest(
        principal,
        input.id,
        pullRequestLinks(origin),
      );
      waitUntil(pullRequestRevised(refreshed.pullRequest.id));
      return refreshed;
    },
  ),
  fromGithub: pullRequestsFromGithub,
});
