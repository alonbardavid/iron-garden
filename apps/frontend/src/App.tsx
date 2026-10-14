import { useQuery } from "@tanstack/react-query";
import { Navigate, Route, Routes } from "react-router-dom";
import { LoadingLayout } from "./components/layouts/LoadingLayout";
import { UnauthenticatedLayout } from "./components/layouts/UnauthenticatedLayout";
import { orpc } from "./logic/api/orpc";
import { useMe } from "./logic/authentication/useMe";
import { useCapabilities } from "./logic/capabilities/useCapabilities";
import { AccountLayout } from "./screens/account/AccountLayout";
import { AccountScreen } from "./screens/account/AccountScreen";
import { AgentScreen } from "./screens/account/AgentScreen";
import { AgentsScreen } from "./screens/account/AgentsScreen";
import { ApiKeysScreen } from "./screens/account/ApiKeysScreen";
import { GithubTokensScreen } from "./screens/account/GithubTokensScreen";
import { EmailScreen } from "./screens/admin/EmailScreen";
import { AgentConfigScreen } from "./screens/admin/agent-config/AgentConfigScreen";
import { UsersScreen } from "./screens/admin/UsersScreen";
import { ForgotPasswordScreen } from "./screens/forgot-password/ForgotPasswordScreen";
import { LoginScreen } from "./screens/login/LoginScreen";
import { NewPasswordScreen } from "./screens/password/NewPasswordScreen";
import {
  GroupsTabRedirect,
  PullRequestScreen,
} from "./screens/pull-requests/PullRequestScreen";
import { PullRequestsScreen } from "./screens/pull-requests/PullRequestsScreen";
import { RepositoriesScreen } from "./screens/repositories/RepositoriesScreen";
import { CodeScreen } from "./screens/repository/CodeScreen";
import { CommitsScreen } from "./screens/repository/CommitsScreen";
import { CommitScreen } from "./screens/repository/CommitScreen";
import { WorkflowsScreen } from "./screens/repository/workflows/WorkflowsScreen";
import { RepositoryLayout } from "./screens/repository/RepositoryLayout";
import { AccessSettingsScreen } from "./screens/repository/settings/AccessSettingsScreen";
import { GeneralSettingsScreen } from "./screens/repository/settings/GeneralSettingsScreen";
import { GithubSettingsScreen } from "./screens/repository/settings/github/GithubSettingsScreen";
import { RuleScreen } from "./screens/repository/settings/rules/RuleScreen";
import { RulesSettingsScreen } from "./screens/repository/settings/rules/RulesSettingsScreen";
import { SettingsLayout } from "./screens/repository/settings/SettingsLayout";
import { ResetPasswordScreen } from "./screens/reset-password/ResetPasswordScreen";
import {
  SetupScreen,
  SetupUnconfiguredScreen,
} from "./screens/setup/SetupScreen";

export const App = () => {
  const { me, isLoading } = useMe();
  const { capabilities, isLoading: capabilitiesLoading } = useCapabilities();
  const { data: setup } = useQuery(
    orpc.setup.state.queryOptions({ enabled: !isLoading && !me }),
  );
  if (isLoading || capabilitiesLoading || (!me && !setup)) {
    return <LoadingLayout />;
  }
  if (!me) {
    return (
      <Routes>
        <Route element={<UnauthenticatedLayout />}>
          {setup?.state === "open" && (
            <Route path="*" element={<SetupScreen />} />
          )}
          {setup?.state === "unconfigured" && (
            <Route path="*" element={<SetupUnconfiguredScreen />} />
          )}
          {capabilities?.email && (
            <>
              <Route
                path="/forgot-password"
                element={<ForgotPasswordScreen />}
              />
              <Route path="/reset-password" element={<ResetPasswordScreen />} />
            </>
          )}
          <Route path="*" element={<LoginScreen />} />
        </Route>
      </Routes>
    );
  }
  if (me.mustChangePassword) {
    return (
      <Routes>
        <Route element={<UnauthenticatedLayout />}>
          <Route path="*" element={<NewPasswordScreen />} />
        </Route>
      </Routes>
    );
  }
  return (
    <Routes>
      <Route path="/" element={<RepositoriesScreen />} />
      <Route path="/r/:name" element={<RepositoryLayout />}>
        <Route index element={<CodeScreen />} />
        <Route path="commits" element={<CommitsScreen />} />
        <Route path="commits/:hash" element={<CommitScreen />} />
        <Route path="pulls" element={<PullRequestsScreen />} />
        <Route path="pulls/:number/groups" element={<GroupsTabRedirect />} />
        <Route path="pulls/:number/:tab?" element={<PullRequestScreen />} />
        <Route path="workflows" element={<WorkflowsScreen />} />
        <Route path="settings" element={<SettingsLayout />}>
          <Route index element={<GeneralSettingsScreen />} />
          <Route path="access" element={<AccessSettingsScreen />} />
          <Route path="rules" element={<RulesSettingsScreen />} />
          <Route path="rules/:id" element={<RuleScreen />} />
          <Route path="github" element={<GithubSettingsScreen />} />
        </Route>
      </Route>
      <Route element={<AccountLayout />}>
        <Route path="/account" element={<AccountScreen />} />
        <Route path="/account/keys" element={<ApiKeysScreen />} />
        <Route path="/account/github-tokens" element={<GithubTokensScreen />} />
        <Route path="/account/agents" element={<AgentsScreen />} />
        <Route path="/account/agents/:name" element={<AgentScreen />} />
        {me.role === "admin" && (
          <>
            <Route path="/admin/users" element={<UsersScreen />} />
            <Route path="/admin/email" element={<EmailScreen />} />
            <Route path="/admin/agent" element={<AgentConfigScreen />} />
            {["/admin/review", "/admin/session-prompt"].map((path) => (
              <Route
                key={path}
                path={path}
                element={<Navigate to="/admin/agent" replace />}
              />
            ))}
          </>
        )}
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};
