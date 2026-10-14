import {
  createRepository,
  deleteRepository,
  getRepository,
  listBranches,
  listCommits,
  listMembers,
  listRepositoryFiles,
  listRepositoriesWithStats,
  readCommit,
  readCommitFile,
  readRepositoryPath,
  removeMember,
  setMember,
  updateRepository,
  type AccessibleRepository,
} from "@lib/forge";
import type { UserProfile } from "@lib/identity";
import {
  createRule,
  deleteRule,
  getRule,
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

const ok = { ok: true as const };

export const repositories = api.repositories.router({
  list: api.repositories.list.handler(
    async ({ context: { principal, origin } }) =>
      (await listRepositoriesWithStats(principal)).map((repo) => ({
        ...toRepository(origin, repo),
        stats: repo.stats,
      })),
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
    ({ context: { principal }, input }) => listBranches(principal, input.name),
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
      async ({ context: { principal }, input }) => {
        const { members, agents } = await listMembers(principal, input.name);
        return {
          members: members.map((m) => ({
            user: toUser(m.user),
            level: m.level,
          })),
          agents,
        };
      },
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
  rules: {
    list: api.repositories.rules.list.handler(
      ({ context: { principal }, input }) => listRules(principal, input.name),
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
