export const VERIFICATION_CONTRACT = "pi-sdk-behavior-v2";
export const SDK_NAMES = [
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-ai",
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-tui",
];
export const UNHANDLED_ERROR_PATTERN = /UnhandledPromiseRejection|uncaught exception|unhandled error|shutdown error/i;
export const EXTENSION_LOAD_ERROR_PATTERN = /Failed to load extension|Error loading extension/i;

export function parseJsonLines(output) {
  return output.split(/\r?\n/).flatMap((line, index) => {
    if (!line.trim()) return [];
    try {
      return [JSON.parse(line)];
    } catch {
      throw new Error(`Malformed JSON on RPC stdout line ${index + 1}.`);
    }
  });
}

function assertion(id, expected, observed, passed) {
  return { id, expected, observed: JSON.stringify(observed), passed: passed === true };
}

function getCommandResponse(responses, id) {
  return responses.find((row) => row?.type === "response" && row.id === id);
}

function hasScheduledStatusCommand(responses, id) {
  const response = getCommandResponse(responses, id);
  const matches = response?.data?.commands?.filter((command) => command.name === "scheduled:status" && command.source === "extension") ?? [];
  return response?.command === "get_commands" && response.success === true && matches.length === 1;
}

function hasScheduledModelState(responses, id, expectedModel) {
  const response = getCommandResponse(responses, id);
  return response?.command === "get_state"
    && response.success === true
    && response.data?.model?.provider === expectedModel.provider
    && response.data?.model?.id === expectedModel.id;
}

function featureResponse(responses, promptId, expectedModel) {
  const prompt = getCommandResponse(responses, promptId);
  const notification = responses.find((row) => row?.type === "extension_ui_request"
    && row.method === "notify"
    && typeof row.message === "string"
    && row.message.includes(`Matched:      slot[0] 00:00-24:00 → ${expectedModel.provider}/${expectedModel.id}`));
  const selectedStatus = responses.find((row) => row?.type === "extension_ui_request"
    && row.method === "setStatus"
    && row.statusKey === "scheduled-router"
    && row.statusText === `${expectedModel.provider}/${expectedModel.id}`);
  return {
    prompt: prompt?.command === "prompt" && prompt.success === true && prompt.data?.disposition === "handled",
    notification: Boolean(notification),
    selectedStatus: Boolean(selectedStatus),
    promptResponse: prompt ?? null,
    statusNotification: notification ?? null,
    selectedStatusRequest: selectedStatus ?? null,
  };
}

export function behaviorAssertions(name, {
  responses,
  fullOutput,
  exit_code,
  expectedModel,
  expectedVersion,
}) {
  if (name === "extension_load") {
    const registration = hasScheduledStatusCommand(responses, "load-commands");
    return [assertion(
      "extension_registered",
      "The actual Pi host returns scheduled:status as a registered extension command.",
      getCommandResponse(responses, "load-commands") ?? null,
      registration,
    )];
  }

  if (name === "happy_path") {
    const feature = featureResponse(responses, "happy-status", expectedModel);
    const state = hasScheduledModelState(responses, "happy-state", expectedModel);
    return [assertion(
      "feature_response",
      "The scheduled model is selected in real Pi state and /scheduled:status returns a handled response with the matched route.",
      { stateResponse: getCommandResponse(responses, "happy-state") ?? null, ...feature },
      state && feature.prompt && feature.notification && feature.selectedStatus,
    )];
  }

  if (name === "error_path") {
    const warning = responses.find((row) => row?.type === "extension_ui_request"
      && row.method === "notify"
      && row.notifyType === "warning"
      && typeof row.message === "string"
      && row.message.includes("invalid config: Unsupported config version 2. Expected 1."));
    return [assertion(
      "handled_error",
      "The actual session_start path catches an invalid config, reports the validation warning, and does not leave an unhandled host error.",
      { warning: warning ?? null, exit_code, unhandledError: UNHANDLED_ERROR_PATTERN.test(fullOutput) },
      Boolean(warning) && exit_code === 0 && !UNHANDLED_ERROR_PATTERN.test(fullOutput),
    )];
  }

  if (name === "reload_cleanup") {
    const reloadReadyCount = responses.filter((row) => row?.type === "extension_ui_request"
      && row.method === "notify"
      && row.message === "pi-smoke-reload-ready").length;
    const initialStatusIndex = responses.findIndex((row) => row?.type === "extension_ui_request"
      && row.method === "setStatus"
      && row.statusKey === "scheduled-router"
      && row.statusText === `${expectedModel.provider}/${expectedModel.id}`);
    const reloadedStatusIndex = responses.findIndex((row, index) => index > initialStatusIndex
      && row?.type === "extension_ui_request"
      && row.method === "setStatus"
      && row.statusKey === "scheduled-router"
      && row.statusText === `${expectedModel.provider}/${expectedModel.id}`);
    const clearedStatus = responses.find((row, index) => index > initialStatusIndex
      && index < reloadedStatusIndex
      && row?.type === "extension_ui_request"
      && row.method === "setStatus"
      && row.statusKey === "scheduled-router"
      && !Object.hasOwn(row, "statusText"));
    const finalStatusClear = responses.some((row, index) => index > reloadedStatusIndex
      && row?.type === "extension_ui_request"
      && row.method === "setStatus"
      && row.statusKey === "scheduled-router"
      && !Object.hasOwn(row, "statusText"));
    const registration = hasScheduledStatusCommand(responses, "reload-commands");
    const state = hasScheduledModelState(responses, "reload-state", expectedModel);
    const feature = featureResponse(responses, "reload-status", expectedModel);
    return [
      assertion(
        "reloaded_extension_registered",
        "After ctx.reload() in the live Pi process, the replacement runtime registers scheduled:status exactly once.",
        { response: getCommandResponse(responses, "reload-commands") ?? null, reloadReadyCount },
        registration && reloadReadyCount >= 2,
      ),
      assertion(
        "reloaded_feature_response",
        "The reloaded runtime selects the configured model and handles /scheduled:status with the matched route.",
        { stateResponse: getCommandResponse(responses, "reload-state") ?? null, ...feature },
        state && feature.prompt && feature.notification && feature.selectedStatus,
      ),
      assertion(
        "clean_shutdown",
        "ctx.reload() disposes the old router runtime and clears its status before replacement activation; final session shutdown clears status and the same Pi process exits 0 without unhandled errors.",
        { clearedStatus: clearedStatus ?? null, finalStatusClear, initialStatusIndex, reloadedStatusIndex, exit_code, errors: UNHANDLED_ERROR_PATTERN.test(fullOutput) },
        reloadReadyCount >= 2 && initialStatusIndex >= 0 && reloadedStatusIndex > initialStatusIndex
          && Boolean(clearedStatus) && finalStatusClear && exit_code === 0 && !UNHANDLED_ERROR_PATTERN.test(fullOutput),
      ),
    ];
  }

  if (name === "host_shell") {
    return [assertion(
      "native_shell_boundary",
      "The native host shell (Windows PowerShell or POSIX /bin/sh) launches the locally pinned Pi CLI and returns its exact SDK version.",
      { exit_code, stdout: fullOutput.stdout.trim(), stderr: fullOutput.stderr.trim(), expectedVersion },
      exit_code === 0 && fullOutput.stdout.trim() === expectedVersion && fullOutput.stderr.trim() === "",
    )];
  }

  throw new Error(`Unknown smoke case: ${name}`);
}
