// A stand-in for node:child_process. The package never starts a process (no git): every call reports a failure.
export function spawnSync(_cmd: string, _args?: string[], _o?: unknown): { status: number; stdout: string; stderr: string } {
  return { status: 1, stdout: "", stderr: "durian-hypermedia does not start processes" };
}
