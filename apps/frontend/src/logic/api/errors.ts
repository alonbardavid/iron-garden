// What to show for a failed call: the server's own message for a refusal it
// meant to give, a generic line otherwise.
export function errorMessage(
  error: unknown,
  fallback = "Something went wrong",
): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message: unknown }).message);
    if (message && message !== "Internal server error") {
      return message;
    }
  }
  return fallback;
}
