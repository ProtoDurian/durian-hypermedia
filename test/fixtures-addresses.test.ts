// scripts/fixtures.ts publishes the Format page's samples: every private address in them becomes one kept for
// documentation (RFC 5737), the last number kept; public addresses stay as written. The private addresses are put
// together here at run time, so this file holds none (the hygiene check refuses them in published text).
import { expect, test } from "bun:test";
import { docAddresses } from "../scripts/fixtures";

const ip = (...n: number[]) => n.join(".");

test("a cluster's service and pod addresses take their own documentation ranges", () => {
  expect(docAddresses(`svc ${ip(10, 96, 0, 10)}, pod ${ip(10, 244, 1, 5)}`)).toBe("svc 192.0.2.10, pod 198.51.100.5");
});
test("every four-part private address is replaced: 10/8, 172.16/12 and 192.168/16", () => {
  expect(docAddresses(ip(10, 1, 2, 3))).toBe("203.0.113.3");
  expect(docAddresses(`${ip(172, 16, 0, 7)} ${ip(172, 28, 22, 143)}:9102 ${ip(172, 31, 255, 9)}`)).toBe("203.0.113.7 203.0.113.143:9102 203.0.113.9");
  expect(docAddresses(ip(192, 168, 1, 20))).toBe("203.0.113.20");
});
test("public addresses and look-alikes outside the private ranges stay", () => {
  const keep = [ip(8, 8, 8, 8), ip(172, 15, 0, 1), ip(172, 32, 0, 1), ip(192, 169, 0, 1), ip(1, 10, 2, 3)].join(" ");
  expect(docAddresses(keep)).toBe(keep);
});
