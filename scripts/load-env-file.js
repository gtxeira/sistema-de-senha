import { existsSync, readFileSync } from "node:fs";

export function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return {};

  const content = readFileSync(filePath, "utf-8");
  const envVars = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...values] = trimmed.split("=");
    if (key) {
      envVars[key.trim()] = values.join("=").trim().replace(/^["']|["']$/g, "");
    }
  }
  return envVars;
}