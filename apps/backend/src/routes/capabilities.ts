import { getCapabilities } from "@lib/capabilities";
import { publicApi } from "./api";

export const capabilities = publicApi.capabilities.router({
  get: publicApi.capabilities.get.handler(() => getCapabilities()),
});
