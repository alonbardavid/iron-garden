import {
  createRepository,
  deleteRepository,
  getRepository,
  listCommits,
  listAgentGrants,
  listMembers,
  listRepositoryFiles,
  listRepositoriesWithStats,
  readCommit,
  readCommitFile,
  readRepositoryPath,
  removeMember,
  searchBranches,
  searchMembers,
  searchRepositories,
  setMember,
  updateRepository,
  type AccessibleRepository,
  type Member,
} from "@lib/forge";
import { AUTOCOMPLETE_LIMIT } from "@lib/contract";
import type { UserProfile } from "@lib/identity";
import {
  chatWithSession,
  dismissUnmergedWork,
  getRepositorySession,
  getSessionTranscript,
  listRepositorySessions,
  sessionChat,
} from "@lib/collab";
import {
  createRule,
  deleteRule,
  getRule,
  listCopyableRules,
  listRules,
  setRuleEnabled,
  updateRule,
} from "@lib/review";
import { copyRulesHere, importFromGithub } from "@lib/github";
import { api } from "./api";
import { repositoryGithub } from "./github";
import { cloneUrl } from "./links";

const toRepository = (origin: string, repo: AccessibleRepository) => ({
  id: repo.id,
  name: repo.name,
  description: repo.description,
  defaultBranch: repo.defaultBranch,
  level: repo.level,
  cloneUrl: cloneUrl(origin, repo.name),
  createdAt: repo.createdAt,
  updatedAt: repo.updatedAt,
});

export const toUser = ({
  id,
  name,
  email,
  username,
  role,
  active,
}: UserProfile) => ({
  id,
  name,
  email,
  username,
  role,
  active,
});

const toMember = ({ user, level }: Member) => ({ user: toUser(user), level });

const ok = { ok: true as const };

export const repositories = api.repositories.router({
  list: api.repositories.list.handler(
    async ({ context: { principal, origin }, input }) => {
      const page = await listRepositoriesWithStats(principal, input);
      return {
        ...page,
        items: page.items.map((repo) => ({
          ...toRepository(origin, repo),
          stats: repo.stats,
        })),
      };
    },
  ),
  search: api.repositories.search.handler(
    async ({ context: { principal, origin }, input }) =>
      (await searchRepositories(principal, input.q, AUTOCOMPLETE_LIMIT)).map(
        (repo) => toRepository(origin, repo),
      ),
  ),
  create: api.repositories.create.handler(
    async ({ context: { principal, origin }, input }) =>
      toRepository(origin, await createRepository(principal, input)),
  ),
  import: api.repositories.import.handler(
    async ({ context: { principal, origin }, input }) =>
      toRepository(origin, await importFromGithub(principal, input, origin)),
  ),
  get: api.repositories.get.handler(
    async ({ context: { principal, origin }, input }) => {
      const repo = await getRepository(principal, input.name);
      return { ...toRepository(origin, repo), head: repo.head };
    },
  ),
  contents: api.repositories.contents.handler(
    ({ context: { principal }, input }) =>
      readRepositoryPath(principal, input.name, input.path, input.ref),
  ),
  files: api.repositories.files.handler(({ context: { principal }, input }) =>
    listRepositoryFiles(principal, input.name, input.ref),
  ),
  branches: api.repositories.branches.handler(
    ({ context: { principal }, input }) =>
      searchBranches(principal, input.name, input.q, AUTOCOMPLETE_LIMIT),
  ),
  commits: api.repositories.commits.handler(
    ({ context: { principal }, input: { name, ...page } }) =>
      listCommits(principal, name, page),
  ),
  commit: api.repositories.commit.handler(({ context: { principal }, input }) =>
    readCommit(principal, input.name, input.hash),
  ),
  commitFile: api.repositories.commitFile.handler(
    ({ context: { principal }, input }) =>
      readCommitFile(principal, input.name, input.hash, input.path),
  ),
  update: api.repositories.update.handler(
    async ({
      context: { principal, origin },
      input: { name, newName, ...patch },
    }) =>
      toRepository(
        origin,
        await updateRepository(principal, name, { ...patch, name: newName }),
      ),
  ),
  delete: api.repositories.delete.handler(
    async ({ context: { principal }, input }) => {
      await deleteRepository(principal, input.name);
      return ok;
    },
  ),
  members: {
    list: api.repositories.members.list.handler(
      async ({ context: { principal }, input: { name, ...page } }) => {
        const members = await listMembers(principal, name, page);
        return { ...members, items: members.items.map(toMember) };
      },
    ),
    agents: api.repositories.members.agents.handler(
      ({ context: { principal }, input: { name, ...page } }) =>
        listAgentGrants(principal, name, page),
    ),
    search: api.repositories.members.search.handler(
      async ({ context: { principal }, input }) =>
        (
          await searchMembers(
            principal,
            input.name,
            input.q,
            AUTOCOMPLETE_LIMIT,
          )
        ).map(toMember),
    ),
    set: api.repositories.members.set.handler(
      async ({ context: { principal }, input }) => {
        await setMember(principal, input.name, input.userId, input.level);
        return ok;
      },
    ),
    remove: api.repositories.members.remove.handler(
      async ({ context: { principal }, input }) => {
        await removeMember(principal, input.name, input.userId);
        return ok;
      },
    ),
  },
  github: repositoryGithub,
  sessions: {
    list: api.repositories.sessions.list.handler(
      ({ context: { principal }, input }) =>
        listRepositorySessions(principal, input.name),
    ),
    get: api.repositories.sessions.get.handler(
      ({ context: { principal }, input }) =>
        getRepositorySession(principal, input.name, input.id),
    ),
    transcript: api.repositories.sessions.transcript.handler(
      ({ context: { principal }, input }) =>
        getSessionTranscript(principal, input.name, input.id, input.transcript),
    ),
    chat: {
      messages: api.repositories.sessions.chat.messages.handler(
        ({ context: { principal }, input }) =>
          sessionChat(principal, input.name, input.id),
      ),
      send: api.repositories.sessions.chat.send.handler(
        ({ context: { principal }, input }) =>
          chatWithSession(principal, input.name, input.id, input.body),
      ),
    },
    dismiss: api.repositories.sessions.dismiss.handler(
      async ({ context: { principal }, input }) => {
        await dismissUnmergedWork(principal, input.name, input.id);
        return { ok: true as const };
      },
    ),
  },
  rules: {
    list: api.repositories.rules.list.handler(
      ({ context: { principal }, input: { name, ...request } }) =>
        listRules(principal, name, request),
    ),
    copyable: api.repositories.rules.copyable.handler(
      ({ context: { principal }, input: { name, from, ...request } }) =>
        listCopyableRules(principal, name, from, request),
    ),
    get: api.repositories.rules.get.handler(
      ({ context: { principal }, input }) =>
        getRule(principal, input.name, input.id),
    ),
    create: api.repositories.rules.create.handler(
      ({ context: { principal }, input }) =>
        createRule(principal, input.name, input.rule),
    ),
    update: api.repositories.rules.update.handler(
      ({ context: { principal }, input }) =>
        updateRule(principal, input.name, input.id, input.rule),
    ),
    setEnabled: api.repositories.rules.setEnabled.handler(
      ({ context: { principal }, input }) =>
        setRuleEnabled(principal, input.name, input.id, input.enabled),
    ),
    delete: api.repositories.rules.delete.handler(
      async ({ context: { principal }, input }) => {
        await deleteRule(principal, input.name, input.id);
        return ok;
      },
    ),
    copy: api.repositories.rules.copy.handler(
      ({ context: { principal }, input }) =>
        copyRulesHere(principal, input.name, input.from, input.ids),
    ),
  },
});
