import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { load as parseYaml } from "js-yaml";

function readWorkflow(name) {
  return parseYaml(readFileSync(`.github/workflows/${name}`, "utf8"));
}

test("release workflows require explicit manual authorization", () => {
  const autoRelease = readWorkflow("auto-release.yml");
  const publish = readWorkflow("publish.yml");

  assert.deepEqual(Object.keys(autoRelease.on), ["workflow_dispatch"]);
  assert.deepEqual(Object.keys(publish.on), ["workflow_dispatch"]);
  assert.equal(
    autoRelease.on.workflow_dispatch.inputs.release_confirmed.required,
    true,
  );
  assert.equal(
    autoRelease.on.workflow_dispatch.inputs.release_confirmed.type,
    "boolean",
  );
  assert.match(autoRelease.jobs.release.if, /refs\/heads\/main/);
  assert.match(autoRelease.jobs.release.if, /inputs\.release_confirmed == true/);

  assert.equal(
    publish.on.workflow_dispatch.inputs.release_confirmed.required,
    true,
  );
  assert.equal(
    publish.on.workflow_dispatch.inputs.release_confirmed.type,
    "boolean",
  );
  assert.match(publish.jobs.publish.if, /inputs\.release_confirmed == true/);
  const releaseTagValidation = publish.jobs.publish.steps.find(
    (step) => step.name === "Validate release tag",
  );
  const tagPattern = releaseTagValidation.run.match(/=~ (\^.*\$)/)?.[1];
  assert.ok(tagPattern, "publish should validate the selected release tag");
  assert.match(
    releaseTagValidation.run,
    /git ls-remote --exit-code --refs/,
    "publish should verify the selected ref exists as a remote tag",
  );
  assert.match(
    releaseTagValidation.run,
    /refs\/tags\/\$\{RELEASE_REF\}/,
    "publish should query the fully qualified tag ref",
  );
  const isStableVersionTag = new RegExp(tagPattern);
  assert.equal(isStableVersionTag.test("v0.1.13"), true);
  assert.equal(isStableVersionTag.test("main"), false);
  assert.equal(isStableVersionTag.test("v0.1.13-rc.1"), false);
  const checkoutStep = publish.jobs.publish.steps.find(
    (step) => step.name === "Checkout",
  );
  assert.equal(
    checkoutStep.with.ref,
    "refs/tags/${{ inputs.ref || github.ref_name }}",
  );
  assert.ok(
    publish.jobs.publish.steps.some(
      (step) => step.name === "Verify package version matches release tag",
    ),
  );

  const dispatchStep = autoRelease.jobs.release.steps.find(
    (step) => step.name === "Trigger publish workflow",
  );
  assert.match(dispatchStep.run, /-f release_confirmed=true/);
});
