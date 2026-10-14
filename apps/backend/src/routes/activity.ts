import {
  createComment,
  deleteComment,
  getActivity,
  getTranscript,
  listComments,
  resolveComment,
  sendComment,
  submitReview,
  uploadTranscript,
} from "@lib/review";
import { api } from "./api";

export const activity = api.pullRequests.activity.router({
  get: api.pullRequests.activity.get.handler(
    ({ context: { principal }, input }) =>
      getActivity(principal, input.name, input.number),
  ),
  transcript: api.pullRequests.activity.transcript.handler(
    ({ context: { principal }, input }) =>
      getTranscript(principal, input.name, input.number, input.transcript),
  ),
  submitReview: api.pullRequests.activity.submitReview.handler(
    ({ context: { principal }, input: { name, number, ...review } }) =>
      submitReview(principal, name, number, review),
  ),
});

export const comments = api.pullRequests.comments.router({
  list: api.pullRequests.comments.list.handler(
    ({ context: { principal }, input }) =>
      listComments(principal, input.name, input.number),
  ),
  create: api.pullRequests.comments.create.handler(
    ({ context: { principal }, input: { name, number, ...comment } }) =>
      createComment(principal, name, number, comment),
  ),
  send: api.pullRequests.comments.send.handler(
    ({ context: { principal }, input }) =>
      sendComment(principal, input.name, input.number, input.comment),
  ),
  resolve: api.pullRequests.comments.resolve.handler(
    ({ context: { principal }, input }) =>
      resolveComment(
        principal,
        input.name,
        input.number,
        input.comment,
        input.resolved,
      ),
  ),
  delete: api.pullRequests.comments.delete.handler(
    async ({ context: { principal }, input }) => {
      await deleteComment(principal, input.name, input.number, input.comment);
      return { ok: true as const };
    },
  ),
});

export const transcripts = api.transcripts.router({
  upload: api.transcripts.upload.handler(
    ({ context: { principal }, input: { id, ...transcript } }) =>
      uploadTranscript(principal, id, transcript),
  ),
});
