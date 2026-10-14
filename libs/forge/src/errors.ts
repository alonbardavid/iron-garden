export type ForgeErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "CONFLICT"
  | "BAD_REQUEST"
  | "UNAVAILABLE"
  // Existed once and never will again, such as a closed chat.
  | "GONE";

// A refusal the caller should show as is. Anything else thrown from this
// package is a bug.
export class ForgeError extends Error {
  constructor(
    readonly code: ForgeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ForgeError";
  }
}

export const notFound = (what = "Repository") =>
  new ForgeError("NOT_FOUND", `${what} not found`);
