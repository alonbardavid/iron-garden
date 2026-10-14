import { eq, getDb, instanceSettings, newEntityId } from "@lib/db-models";
import { moduleLogger } from "@lib/logging";

const log = moduleLogger("collab/prompt-setting");

export interface StoredPrompt {
  prompt: string;
  isDefault: boolean;
  defaultPrompt: string;
  updatedAt: number | null;
}

// A prompt agents get that an admin can replace, kept as an instance setting
// under `key`; restoring the default deletes the setting.
export function promptSetting(key: string, defaultPrompt: string) {
  const get = async (): Promise<StoredPrompt> => {
    const [row] = await getDb()
      .select()
      .from(instanceSettings)
      .where(eq(instanceSettings.key, key));
    return {
      prompt: row?.value ?? defaultPrompt,
      isDefault: !row,
      defaultPrompt,
      updatedAt: row?.updatedAt.getTime() ?? null,
    };
  };
  return {
    get,
    set: async (userId: string, prompt: string): Promise<StoredPrompt> => {
      await getDb()
        .insert(instanceSettings)
        .values({
          id: newEntityId("INSTANCE_SETTING"),
          key,
          value: prompt,
          updatedBy: userId,
        })
        .onConflictDoUpdate({
          target: instanceSettings.key,
          set: { value: prompt, updatedBy: userId, updatedAt: new Date() },
        });
      log.info("prompt saved", { key, userId });
      return get();
    },
    restoreDefault: async (userId: string): Promise<StoredPrompt> => {
      await getDb()
        .delete(instanceSettings)
        .where(eq(instanceSettings.key, key));
      log.info("prompt restored to default", { key, userId });
      return get();
    },
  };
}
