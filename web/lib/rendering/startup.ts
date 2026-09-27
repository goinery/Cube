// Startup belongs to the workspace, not to each viewport mount. Reloading the
// page starts a new cycle; changing puzzles keeps the workspace available.
let started = false;

export function hasStudioStarted() {
  return started;
}

export function finishStudioStartup() {
  started = true;
}
