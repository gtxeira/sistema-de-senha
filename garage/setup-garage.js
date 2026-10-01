import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileExists } from "next/dist/lib/file-exists";

function loadEnvFile(filePath) {
  if (!fileExists(filePath)) return {};

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

const testEnv = loadEnvFile(".env.test");

const keyDev = process.env.S3_ACCESS_KEY;
const keyTest = testEnv.S3_ACCESS_KEY_TEST || process.env.S3_ACCESS_KEY_TEST;
const bucketDev = process.env.S3_BUCKET;
const bucketTest = process.env.S3_BUCKET_TEST || "news-images-test";

if (!keyDev) {
  console.error("❌ Erro: S3_ACCESS_KEY não definida no ambiente.");
  process.exit(1);
}

if (!keyTest) {
  console.error("❌ Erro: S3_ACCESS_KEY_TEST não definida no ambiente.");
  process.exit(1);
}

function setupBucket(bucketName, keyId) {
  console.log(`📦 Processando bucket "${bucketName}"...`);
  try {
    execSync(`docker compose exec garage /garage bucket create ${bucketName}`, { stdio: "ignore" });
  } catch {}

  try {
    execSync(`docker compose exec garage /garage bucket allow ${bucketName} --key ${keyId} --read --write`, { stdio: "ignore" });
    execSync(`docker compose exec garage /garage bucket website ${bucketName} --allow`, { stdio: "ignore" });
  } catch (err) {
    console.warn(`⚠️ Alerta ao aplicar permissões para ${bucketName}:`, err.message);
  }
}

console.log("⚙️ Configurando buckets no Garage via Bun...");

setupBucket(bucketDev, keyDev);

if (bucketTest && keyTest) {
  setupBucket(bucketTest, keyTest);
}

console.log("✅ Configuração concluída!");