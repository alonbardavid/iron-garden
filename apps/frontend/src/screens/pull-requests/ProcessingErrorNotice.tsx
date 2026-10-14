import { Alert } from "@mantine/core";
import type { PullRequestDetail } from "@lib/contract";

// Why the server opened this revision without groups, when it could not group
// it.
export const ProcessingErrorNotice = ({ pr }: { pr: PullRequestDetail }) =>
  pr.processingError ? (
    <Alert
      color="orange"
      title="The server could not bracket this pull request"
      mt={12}
    >
      Its changes are all under Files. Refreshing the pull request tries again.
      Reason: {pr.processingError}
    </Alert>
  ) : null;
