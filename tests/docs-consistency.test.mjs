import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { load as parseYaml } from "js-yaml";
import { validateConfig } from "../lib/config.ts";

function readMaintenanceHealthCheck() {
  return readFileSync("docs/maintenance-health-check.md", "utf8");
}

function countDeclaredTests() {
  return readdirSync("tests")
    .filter((file) => file.endsWith(".test.mjs"))
    .reduce((total, file) => {
      const source = readFileSync(join("tests", file), "utf8");
      return total + [...source.matchAll(/^test\(/gm)].length;
    }, 0);
}

test("example config validates against validateConfig", () => {
  const examplePath = "docs/examples/scheduled-router.example.yaml";
  const parsed = parseYaml(readFileSync(examplePath, "utf8"));
  const validated = validateConfig(parsed);

  assert.equal(validated.version, 1);
  assert.equal(validated.timezone, "Asia/Tokyo");
  assert.equal(validated.slots.length, 3);
  assert.equal(validated.default.provider, "deepseek");
});

test("README links to configuration reference docs", () => {
  const readme = readFileSync("README.md", "utf8");

  assert.ok(
    readme.includes("docs/examples/scheduled-router.example.yaml"),
    "README should link to the annotated example config",
  );
  assert.ok(
    readme.includes("docs/configuration.md"),
    "README should link to docs/configuration.md",
  );
});

test("README pin example matches package.json version", () => {
  const { version } = JSON.parse(readFileSync("package.json", "utf8"));
  const readme = readFileSync("README.md", "utf8");
  const pinExample = `pi install npm:pi-scheduled-router@${version}`;

  assert.ok(
    readme.includes(pinExample),
    `README should include pin example: ${pinExample}`,
  );
});

test("maintenance health check documents current test total", () => {
  const doc = readMaintenanceHealthCheck();
  const documentedTotal = Number(
    doc.match(/\| \*\*Total\*\* \| \*\*(\d+)\*\* \|/)?.[1],
  );
  const actualTotal = countDeclaredTests();

  assert.equal(
    documentedTotal,
    actualTotal,
    "maintenance-health-check.md Total row should match npm test count",
  );
});

test("maintenance health check documents workflow action pins", () => {
  const doc = readMaintenanceHealthCheck();
  const ci = readFileSync(".github/workflows/ci.yml", "utf8");
  const checkout = ci.match(/actions\/checkout@v\d+/)?.[0];
  const setupNode = ci.match(/actions\/setup-node@v\d+/)?.[0];

  assert.ok(checkout, "ci.yml should pin actions/checkout");
  assert.ok(setupNode, "ci.yml should pin actions/setup-node");
  assert.ok(
    doc.includes(checkout),
    `maintenance-health-check.md should mention ${checkout}`,
  );
  assert.ok(
    doc.includes(setupNode),
    `maintenance-health-check.md should mention ${setupNode}`,
  );
});
