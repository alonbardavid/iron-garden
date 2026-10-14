import { getDb, instanceSettings, inArray, newEntityId } from "@lib/db-models";
import type { EmailSettings } from "@lib/contract";

const ENABLED = "email.enabled";
const SENDER = "email.sender";

// Read on every call: an admin changes them at runtime.
export async function getEmailSettings(): Promise<EmailSettings> {
  const rows = await getDb()
    .select({ key: instanceSettings.key, value: instanceSettings.value })
    .from(instanceSettings)
    .where(inArray(instanceSettings.key, [ENABLED, SENDER]));
  const settings = new Map(rows.map((row) => [row.key, row.value]));
  return {
    enabled: settings.get(ENABLED) === "true",
    sender: settings.get(SENDER) || null,
  };
}

export async function saveEmailSettings(
  userId: string,
  settings: EmailSettings,
): Promise<EmailSettings> {
  const db = getDb();
  const upsert = (key: string, value: string) =>
    db
      .insert(instanceSettings)
      .values({
        id: newEntityId("INSTANCE_SETTING"),
        key,
        value,
        updatedBy: userId,
      })
      .onConflictDoUpdate({
        target: instanceSettings.key,
        set: { value, updatedBy: userId, updatedAt: new Date() },
      });
  await db.batch([
    upsert(ENABLED, String(settings.enabled)),
    upsert(SENDER, settings.sender ?? ""),
  ]);
  return getEmailSettings();
}
