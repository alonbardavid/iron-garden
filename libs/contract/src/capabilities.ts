import { oc } from "@orpc/contract";
import { z } from "zod";

export const capabilitiesSchema = z.object({
  email: z.boolean(),
  git: z.boolean(),
  // Workers AI, the processing Durable Object and a Worker Loader are bound, so pull
  // requests can be grouped on the server (Admin > Agent config).
  ai: z.boolean(),
});

export type Capabilities = z.infer<typeof capabilitiesSchema>;

export const capabilitiesContract = {
  get: oc
    .route({ method: "GET", path: "/api/capabilities" })
    .output(capabilitiesSchema),
};

// Email sending is off until an admin turns it on with a sender.
export const emailSettingsSchema = z.object({
  enabled: z.boolean(),
  sender: z.string().nullable(),
});
export type EmailSettings = z.infer<typeof emailSettingsSchema>;

export const adminEmailContract = {
  get: oc
    .route({ method: "GET", path: "/api/admin/email" })
    .output(emailSettingsSchema),
  set: oc
    .route({ method: "PUT", path: "/api/admin/email" })
    .input(
      z
        .object({
          enabled: z.boolean(),
          sender: z.email("Enter a valid email address").nullable(),
        })
        .refine((v) => !v.enabled || v.sender !== null, {
          path: ["sender"],
          error: "Enter the sender email",
        }),
    )
    .output(emailSettingsSchema),
  // Sends the signed-in admin a test from `sender` without saving anything;
  // `error` says why a send failed.
  test: oc
    .route({ method: "POST", path: "/api/admin/email/test" })
    .input(z.object({ sender: z.email("Enter a valid email address") }))
    .output(z.object({ error: z.string().nullable() })),
};
