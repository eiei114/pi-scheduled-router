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
  return output.split(/\r?\n/).flatMap((line) => {
    if (!line.trim()) return [];
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
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
  return response?.command === "get_commands"
    && response.success === true
    && response.data?.commands?.some((command) => command.name === "scheduled:status" && command.source === "extension");
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
    const registration = hasScheduledStatusCommand(responses, "reload-commands");
    const state = hasScheduledModelState(responses, "reload-state", expectedModel);
    const feature = featureResponse(responses, "reload-status", expectedModel);
    const clearedStatus = responses.find((row) => row?.type === "extension_ui_request"
      && row.method === "setStatus"
      && row.statusKey === "scheduled-router"
      && !Object.hasOwn(row, "statusText"));
    return [
      assertion(
        "reloaded_extension_registered",
        "A second actual Pi process loads the extension and registers scheduled:status.",
        getCommandResponse(responses, "reload-commands") ?? null,
        registration,
      ),
      assertion(
        "reloaded_feature_response",
        "The second process selects the configured model and handles /scheduled:status with the matched route.",
        { stateResponse: getCommandResponse(responses, "reload-state") ?? null, ...feature },
        state && feature.prompt && feature.notification && feature.selectedStatus,
      ),
      assertion(
        "clean_shutdown",
        "The second host emits session_shutdown status cleanup; both actual Pi processes exit 0 without shutdown or unhandled errors.",
        { clearedStatus: clearedStatus ?? null, first_exit_code: exit_code.first, second_exit_code: exit_code.second, errors: UNHANDLED_ERROR_PATTERN.test(fullOutput) },
        Boolean(clearedStatus) && exit_code.first === 0 && exit_code.second === 0 && !UNHANDLED_ERROR_PATTERN.test(fullOutput),
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
