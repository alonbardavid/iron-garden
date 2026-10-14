import { getDb, instanceSettings, newEntityId, eq } from "@lib/db-models";
import { moduleLogger } from "@lib/logging";
import type { AgentConfigInput } from "./config";
import { DEFAULT_GATEWAY } from "./defaults";
import { completeJson } from "./model";
import { readModelTest, type ModelTest } from "./model-test-record";

const log = moduleLogger("ai/model-test");

const MODEL_TEST_KEY = "agent.modelTest";

/**
 * Asks `config`'s model for a one-line JSON answer, the way processing calls
 * it, and keeps the result as the last test. A model that is not set up yet
 * can be tested before it is saved.
 */
export async function testModel(
  userId: string,
  config: Pick<AgentConfigInput, "model" | "gateway">,
): Promise<ModelTest> {
  const started = Date.now();
  const error = await completeJson(config, [
    { role: "system", content: "Answer with a JSON object only." },
    { role: "user", content: 'Reply with {"ok": true}.' },
  ]).then(
    (answer) => (/"ok"\s*:\s*true/.test(answer) ? null : unexpected(answer)),
    (err: unknown) => (err instanceof Error ? err.message : String(err)),
  );
  const test: ModelTest = {
    ok: error === null,
    model: config.model,
    gateway: config.gateway ?? DEFAULT_GATEWAY,
    ms: Date.now() - started,
    error,
    testedAt: Date.now(),
  };
  await saveModelTest(userId, test);
  log.info("model tested", {
    userId,
    model: test.model,
    gateway: test.gateway,
    ok: test.ok,
    ms: test.ms,
    error,
  });
  return test;
}

export async function lastModelTest(): Promise<ModelTest | null> {
  const [row] = await getDb()
    .select()
    .from(instanceSettings)
    .where(eq(instanceSettings.key, MODEL_TEST_KEY));
  const test = row ? readModelTest(row.value) : null;
  if (row && !test) {
    log.warning("stored model test cannot be read; ignoring it");
  }
  return test;
}

async function saveModelTest(userId: string, test: ModelTest): Promise<void> {
  const value = JSON.stringify(test);
  await getDb()
    .insert(instanceSettings)
    .values({
      id: newEntityId("INSTANCE_SETTING"),
      key: MODEL_TEST_KEY,
      value,
      updatedBy: userId,
    })
    .onConflictDoUpdate({
      target: instanceSettings.key,
      set: { value, updatedBy: userId, updatedAt: new Date() },
    });
}

function unexpected(answer: string): string {
  return `The model answered, but not as asked: ${answer.slice(0, 200)}`;
}

export type { ModelTest };
