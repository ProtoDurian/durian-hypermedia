import { expect, test } from "bun:test";
import { atSizes, measureAt, phoneNow } from "../../../src/engine/render/font";
import { setPhoneFont } from "../../../src/core/stage-core";

test("measuring at the phone's sizes puts the flag back as it was", () => {
  setPhoneFont(false);
  const lap = measureAt("a few words", "sub", false), ph = measureAt("a few words", "sub", true);
  expect(ph).toBeLessThan(lap);
  expect(phoneNow()).toBe(false);
  setPhoneFont(true);
  expect(atSizes(false, () => phoneNow())).toBe(false);
  expect(phoneNow()).toBe(true);
  setPhoneFont(false);
});
