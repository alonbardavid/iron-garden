import { createORPCClient } from "@orpc/client";
import { OpenAPILink } from "@orpc/openapi-client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { contract, type ApiClient } from "@lib/contract";

const api: ApiClient = createORPCClient(
  new OpenAPILink(contract, {
    url: window.location.origin,
    fetch: (request, init) =>
      fetch(request, { ...init, credentials: "include" }),
  }),
);

export const orpc = createTanstackQueryUtils(api);
