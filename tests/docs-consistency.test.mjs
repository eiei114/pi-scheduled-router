import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("README pin example matches package.json version", () => {
  const { version } = JSON.parse(readFileSync("package.json", "utf8"));
  const readme = readFileSync("README.md", "utf8");
  const pinExample = `pi install npm:pi-scheduled-router@${version}`;

  assert.ok(
    readme.includes(pinExample),
    `README should include pin example: ${pinExample}`,
  );
});
