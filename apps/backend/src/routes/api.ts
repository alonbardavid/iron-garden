import { implement } from "@orpc/server";
import type { RequestHeadersPluginContext } from "@orpc/server/plugins";
import { contract } from "@lib/contract";
import { domainErrors } from "./domain-errors";
import {
  requireAdmin,
  requirePasswordCurrent,
  requirePrincipal,
} from "./principal";

export interface BaseContext extends RequestHeadersPluginContext {
  // The origin this request came to, for the links handed to agents.
  origin: string;
}

// Only for procedures a signed-out visitor needs; everything else goes on `api`.
export const publicApi = implement(contract)
  .$context<BaseContext>()
  .use(domainErrors);

// Signed in, even with a password the user must change first: only for what
// the change-password screen needs.
export const signedInApi = publicApi.use(requirePrincipal);

export const api = signedInApi.use(requirePasswordCurrent);

export const adminApi = api.use(requireAdmin);
