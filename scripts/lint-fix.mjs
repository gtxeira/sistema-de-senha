import { spawnSync } from "node:child_process";

/**
 * O `oxlint --fix` aplica correções em cadeia: ordenar imports pode expor uma
 * nova ordenação de named imports, que só é corrigida na passada seguinte.
 * Este script roda até cinco passadas e, no fim, faz uma verificação limpa.
 */
const binary = process.platform === "win32" ? "oxlint.cmd" : "oxlint";
const maxPasses = 5;

for (let pass = 1; pass <= maxPasses; pass += 1) {
  const result = spawnSync(binary, ["--fix"], { stdio: "inherit" });

  if (result.error) throw result.error;
  if (result.status === 0) process.exit(0);
}

const check = spawnSync(binary, [], { stdio: "inherit" });
process.exit(check.status ?? 1);
