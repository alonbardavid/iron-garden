import type { ChatEndpointsFor, PullRequestLinks } from "@lib/review";
import type { ListenEndpointsFor, SessionLinks } from "@lib/collab";

// Absolute URLs handed to agents, built from the origin the request came to so
// they work on any instance and in any preview.
export function sessionLinks(origin: string) {
  return (id: string): SessionLinks => {
    const session = `${origin}/api/sessions/${id}`;
    return {
      remote: `${origin}/${id}.git`,
      session,
      token: `${session}/token`,
      pullRequests: `${session}/pull-requests`,
      transcripts: `${session}/transcripts`,
      end: `${session}/end`,
      activity: `${session}/activity`,
      notifications: `${session}/notifications`,
      messages: `${session}/messages`,
      listen: `${session}/listen`,
      chat: `${session}/chat`,
    };
  };
}

export function pullRequestLinks(origin: string) {
  return (pr: {
    id: string;
    number: number;
    repository: string;
  }): PullRequestLinks => ({
    url: `${origin}/${pr.repository}/pulls/${pr.number}`,
    submitUrl: `${origin}/api/pull-requests/${pr.id}/groups`,
    refreshUrl: `${origin}/api/pull-requests/${pr.id}/refresh`,
    commentsUrl: `${origin}/api/repositories/${pr.repository}/pull-requests/${pr.number}/comments`,
    chatUrl: `${origin}/api/pull-requests/${pr.id}/chat`,
  });
}

// Where an agent listens for chat; the key in the path is its credential.
export function chatEndpoints(origin: string): ChatEndpointsFor {
  return (key) => {
    const url = `${origin}/api/chat/${key}`;
    return {
      url,
      messagesUrl: `${url}/messages`,
      socketUrl: `${url.replace(/^http/, "ws")}/socket`,
    };
  };
}

// Where a session's listener connects; the key in the path is its credential.
export function listenEndpoints(origin: string): ListenEndpointsFor {
  return (key) => {
    const url = `${origin}/api/session-inbox/${key}`;
    return {
      pollUrl: `${url}/notifications`,
      socketUrl: `${url.replace(/^http/, "ws")}/socket`,
    };
  };
}

export const cloneUrl = (origin: string, name: string) =>
  `${origin}/${name}.git`;
