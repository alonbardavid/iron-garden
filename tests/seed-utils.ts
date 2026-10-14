import { hashPassword } from "better-auth/crypto";
import { newEntityId } from "@lib/db-models/entity-ids";

export interface SeedUser {
  username: string;
  email: string;
  password: string;
  name: string;
  role: "user" | "admin";
}

export async function buildCreateUserSql(user: SeedUser): Promise<string> {
  const userId = newEntityId("USER");
  const accountId = newEntityId("USER_ACCOUNT");
  const hash = await hashPassword(user.password);

  const userInsert =
    `INSERT INTO user (id, name, email, email_verified, username, display_username, role) VALUES ` +
    `(${sqlString(userId)}, ${sqlString(user.name)}, ${sqlString(user.email)}, 1, ` +
    `${sqlString(user.username)}, ${sqlString(user.username)}, ${sqlString(user.role)});`;

  const accountInsert =
    `INSERT INTO user_accounts (id, account_id, provider_id, user_id, password) VALUES ` +
    `(${sqlString(accountId)}, ${sqlString(userId)}, 'credential', ${sqlString(userId)}, ${sqlString(hash)});`;

  return `${userInsert}\n${accountInsert}`;
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

// Email sending on, from the address every spec expects mail from.
export const LOCAL_SENDER = "noreply@iron-garden.local";

export function buildEmailSettingsSql(): string {
  return [
    ["email.enabled", "true"],
    ["email.sender", LOCAL_SENDER],
  ]
    .map(
      ([key, value]) =>
        `INSERT INTO instance_settings (id, key, value) VALUES ('${newEntityId("INSTANCE_SETTING")}', '${key}', '${value}');`,
    )
    .join(" ");
}
