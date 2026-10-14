// How a run or job reads at a glance, from GitHub's status and conclusion.
export function outcomeOf(
  status: string,
  conclusion: string | null,
): { label: string; color: string } {
  if (status !== "completed") {
    return status === "in_progress"
      ? { label: "Running", color: "blue" }
      : { label: "Queued", color: "yellow" };
  }
  switch (conclusion) {
    case "success":
      return { label: "Passed", color: "green" };
    case "failure":
    case "timed_out":
    case "startup_failure":
      return { label: "Failed", color: "red" };
    case "cancelled":
      return { label: "Cancelled", color: "gray" };
    case "skipped":
    case "neutral":
      return { label: "Skipped", color: "gray" };
  }
  return { label: conclusion ?? "Done", color: "orange" };
}
