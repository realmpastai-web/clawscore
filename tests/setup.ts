import { beforeEach } from "vitest";

/** Isolate scans from a developer’s real global openclaw / clawdbot / moltbot. */
beforeEach(() => {
  process.env.CLAWSCORE_NO_PKG_DISCOVERY = "1";
});
