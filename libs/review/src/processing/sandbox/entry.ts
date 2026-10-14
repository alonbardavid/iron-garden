import { WorkerEntrypoint } from "cloudflare:workers";
import { answerQuestion, type AnswerTools } from "./answerer.js";
import {
  groupPullRequest,
  type GroupingTools,
  type SessionRepository,
} from "./processor.js";

// The main module of the processing sandbox. The backend's build loads this
// folder as the Dynamic Worker's modules, so it may import only its siblings
// and cloudflare:workers.
export default class Processor extends WorkerEntrypoint {
  group(tools: GroupingTools, repository: SessionRepository) {
    return groupPullRequest(tools, repository);
  }

  answer(tools: AnswerTools, repository: SessionRepository) {
    return answerQuestion(tools, repository);
  }
}
