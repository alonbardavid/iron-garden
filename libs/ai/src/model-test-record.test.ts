import { expect, it } from "vitest";
import { readModelTest } from "./model-test-record";

const TEST = {
  ok: true,
  model: "@cf/zai-org/glm-5.3-flash",
  gateway: "reviews",
  ms: 1376,
  error: null,
  testedAt: 1791918837898,
};

it("reads a stored test", () => {
  expect(readModelTest(JSON.stringify(TEST))).toEqual(TEST);
});

it("shows a test kept without a gateway as the default's", () => {
  expect(readModelTest(JSON.stringify({ ...TEST, gateway: null }))).toEqual({
    ...TEST,
    gateway: "default",
  });
});

it("ignores what cannot be read as a test", () => {
  expect(readModelTest("not json")).toBeNull();
  expect(readModelTest(JSON.stringify({ ok: true }))).toBeNull();
});
