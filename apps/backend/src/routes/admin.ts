import {
  DEFAULT_GATEWAY,
  DEFAULT_MAX_TRANSCRIPT_WORDS,
  DEFAULT_MODEL,
  getAgentConfig,
  lastModelTest,
  searchModels,
  setAgentConfig,
  testModel,
  type AgentConfig,
} from "@lib/ai";
import {
  getSessionPrompt,
  PROMPT_CONDITIONS,
  restoreDefaultSessionPrompt,
  SESSION_PROMPT_PLACEHOLDERS,
  setSessionPrompt,
  type StoredPrompt,
} from "@lib/collab";
import {
  getProcessingPrompt,
  PROMPT_PLACEHOLDERS,
  restoreDefaultProcessingPrompt,
  setProcessingPrompt,
  type PromptKind,
} from "@lib/review";
import { ORPCError } from "@orpc/server";
import {
  getBindings,
  getEmailSettings,
  saveEmailSettings,
} from "@lib/capabilities";
import { sendTestEmail } from "@lib/email-service";
import { getUserProfile } from "@lib/identity";
import { adminApi } from "./api";

const entries = (meanings: Record<string, string>) =>
  Object.entries(meanings).map(([name, meaning]) => ({ name, meaning }));

const conditions = entries(PROMPT_CONDITIONS);

// A stored prompt with what its template may use.
const described =
  (placeholders: Record<string, string>, tested = conditions) =>
  (prompt: StoredPrompt) => ({
    ...prompt,
    placeholders: entries(placeholders),
    conditions: tested,
  });

// The processing prompt with what it may use when `mode` processes. The
// server's model is never an agent session, so no conditions apply to it.
const processing = (mode: PromptKind) =>
  described(PROMPT_PLACEHOLDERS[mode], mode === "server" ? [] : conditions);
const session = described(SESSION_PROMPT_PLACEHOLDERS);

// Models offered while an admin types in the model field.
const MODEL_SUGGESTIONS = 5;

const withAvailability = async (config: AgentConfig) => ({
  ...config,
  defaultModel: DEFAULT_MODEL,
  defaultGateway: DEFAULT_GATEWAY,
  defaultMaxTranscriptWords: DEFAULT_MAX_TRANSCRIPT_WORDS,
  serverAvailable: getBindings().ai,
  lastTest: await lastModelTest(),
});

export const admin = adminApi.admin.router({
  agentConfig: {
    get: adminApi.admin.agentConfig.get.handler(async () =>
      withAvailability(await getAgentConfig()),
    ),
    set: adminApi.admin.agentConfig.set.handler(
      async ({ context: { principal }, input }) =>
        withAvailability(await setAgentConfig(principal.userId, input)),
    ),
    testModel: adminApi.admin.agentConfig.testModel.handler(
      ({ context: { principal }, input }) => testModel(principal.userId, input),
    ),
    searchModels: adminApi.admin.agentConfig.searchModels.handler(({ input }) =>
      searchModels(input.query, MODEL_SUGGESTIONS),
    ),
  },
  email: {
    get: adminApi.admin.email.get.handler(() => getEmailSettings()),
    set: adminApi.admin.email.set.handler(({ context: { principal }, input }) =>
      saveEmailSettings(principal.userId, input),
    ),
    // The test goes to the admin who sends it.
    test: adminApi.admin.email.test.handler(
      async ({ context: { principal, origin }, input }) => {
        const me = await getUserProfile(principal.userId);
        if (!me) {
          throw new ORPCError("NOT_FOUND", { message: "No such user" });
        }
        return sendTestEmail({
          userId: me.id,
          to: me.email,
          name: me.name,
          sender: input.sender,
          url: `${origin}/admin/email`,
        });
      },
    ),
  },
  processingPrompt: {
    get: adminApi.admin.processingPrompt.get.handler(async ({ input }) =>
      processing(input.mode)(await getProcessingPrompt(input.mode)),
    ),
    set: adminApi.admin.processingPrompt.set.handler(
      async ({ context: { principal }, input }) =>
        processing(input.mode)(
          await setProcessingPrompt(principal.userId, input.mode, input.prompt),
        ),
    ),
    restoreDefault: adminApi.admin.processingPrompt.restoreDefault.handler(
      async ({ context: { principal }, input }) =>
        processing(input.mode)(
          await restoreDefaultProcessingPrompt(principal.userId, input.mode),
        ),
    ),
  },
  sessionPrompt: {
    get: adminApi.admin.sessionPrompt.get.handler(async () =>
      session(await getSessionPrompt()),
    ),
    set: adminApi.admin.sessionPrompt.set.handler(
      async ({ context: { principal }, input }) =>
        session(await setSessionPrompt(principal.userId, input.prompt)),
    ),
    restoreDefault: adminApi.admin.sessionPrompt.restoreDefault.handler(
      async ({ context: { principal } }) =>
        session(await restoreDefaultSessionPrompt(principal.userId)),
    ),
  },
});
