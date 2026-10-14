import type { SeedUser } from "../seed-utils";

export const TEST_ADMIN: SeedUser = {
  username: "test-admin",
  email: "testadmin@example.com",
  password: "test-admin-password-1",
  name: "Test Admin",
  role: "admin",
};

export const TEST_USER: SeedUser = {
  username: "test-user",
  email: "testuser@example.com",
  password: "test-user-password-1",
  name: "Test User",
  role: "user",
};

// Only the forgot-password spec signs in as this one: it changes the password.
export const RESET_USER: SeedUser = {
  username: "reset-user",
  email: "resetuser@example.com",
  password: "reset-user-password-1",
  name: "Reset User",
  role: "user",
};
