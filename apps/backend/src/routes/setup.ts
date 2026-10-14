import { createFirstAdmin, setupState } from "@lib/identity";
import { publicApi } from "./api";

export const setup = publicApi.setup.router({
  state: publicApi.setup.state.handler(async () => ({
    state: await setupState(),
  })),
  create: publicApi.setup.create.handler(async ({ input }) => {
    await createFirstAdmin(input);
    return { ok: true as const };
  }),
});
