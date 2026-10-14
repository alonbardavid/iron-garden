import { oc } from "@orpc/contract";
import { z } from "zod";

// Mirrors RULE_ACTIONS and RULE_CONSTRUCTS in @lib/db-models.
export const RULE_ACTIONS = [
  "auto-accept",
  "high-impact",
  "require-review",
  "run-workflow",
] as const;
export type RuleAction = (typeof RULE_ACTIONS)[number];

export const RULE_CONSTRUCTS = ["imports", "comments"] as const;
export type RuleConstruct = (typeof RULE_CONSTRUCTS)[number];

const patterns = z.array(z.string().trim().min(1).max(300)).max(50);

export const ruleMatchSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("files"),
    syntax: z.enum(["glob", "regex"]),
    patterns: patterns.min(1, "Add at least one pattern"),
  }),
  z.object({
    kind: z.literal("structure"),
    constructs: z
      .array(z.enum(RULE_CONSTRUCTS))
      .min(1, "Choose at least one construct"),
    paths: patterns,
  }),
  z.object({
    kind: z.literal("prompt"),
    prompt: z.string().trim().min(1, "Say what to look for").max(5000),
    paths: patterns,
  }),
]);
export type RuleMatch = z.infer<typeof ruleMatchSchema>;

// A GitHub Actions workflow, as GitHub names it; ids are per repository.
export const ruleWorkflowSchema = z.object({
  id: z.number().int().positive(),
  path: z.string().min(1).max(500),
  name: z.string().min(1).max(500),
});
export type RuleWorkflow = z.infer<typeof ruleWorkflowSchema>;

export const ruleInputSchema = z.object({
  name: z.string().trim().min(1, "Name the rule").max(100),
  match: ruleMatchSchema,
  action: z.enum(RULE_ACTIONS),
  // User ids, for require-review.
  reviewers: z.array(z.string()).max(20).default([]),
  // For run-workflow.
  workflow: ruleWorkflowSchema.nullable().optional(),
  enabled: z.boolean().default(true),
});
export type RuleInput = z.input<typeof ruleInputSchema>;

const personSchema = z.object({ id: z.string(), name: z.string() });

export const ruleSchema = z.object({
  id: z.string(),
  name: z.string(),
  match: ruleMatchSchema,
  action: z.enum(RULE_ACTIONS),
  reviewers: z.array(personSchema),
  workflow: ruleWorkflowSchema.nullable(),
  enabled: z.boolean(),
  // The latest pull request it matched, and how many of the repository's
  // last ten it matched.
  lastMatched: z.object({ number: z.number(), at: z.number() }).nullable(),
  recent: z.object({ matched: z.number(), of: z.number() }),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Rule = z.infer<typeof ruleSchema>;

const byRepository = z.object({ name: z.string() });
const byRule = byRepository.extend({ id: z.string() });

export const rulesContract = {
  list: oc
    .route({ method: "GET", path: "/api/repositories/{name}/rules" })
    .input(byRepository)
    .output(z.array(ruleSchema)),
  get: oc
    .route({ method: "GET", path: "/api/repositories/{name}/rules/{id}" })
    .input(byRule)
    .output(ruleSchema),
  create: oc
    .route({ method: "POST", path: "/api/repositories/{name}/rules" })
    .input(byRepository.extend({ rule: ruleInputSchema }))
    .output(ruleSchema),
  update: oc
    .route({ method: "PUT", path: "/api/repositories/{name}/rules/{id}" })
    .input(byRule.extend({ rule: ruleInputSchema }))
    .output(ruleSchema),
  setEnabled: oc
    .route({
      method: "PUT",
      path: "/api/repositories/{name}/rules/{id}/enabled",
    })
    .input(byRule.extend({ enabled: z.boolean() }))
    .output(ruleSchema),
  delete: oc
    .route({ method: "DELETE", path: "/api/repositories/{name}/rules/{id}" })
    .input(byRule)
    .output(z.object({ ok: z.literal(true) })),
  copy: oc
    .route({ method: "POST", path: "/api/repositories/{name}/rules/copy" })
    .input(
      byRepository.extend({
        from: z.string(),
        ids: z.array(z.string()).min(1).max(100),
      }),
    )
    // `dropped` names the run-workflow rules left behind: this repository
    // has no workflow at the same path.
    .output(
      z.object({ rules: z.array(ruleSchema), dropped: z.array(z.string()) }),
    ),
};
