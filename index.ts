// entry shim for local directory installs (host probes <dir>/index.ts); npm installs resolve via package.json exports
export { default } from "./opencode/index.ts";
