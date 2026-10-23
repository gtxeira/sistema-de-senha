import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkIsRunningInDocker } from './check-is-running-in-docker';
import { loadEnvFile } from './load-env-file';

if (checkIsRunningInDocker()) {
  console.error('❌ ERRO DE EXECUÇÃO:');
  console.error(
    'Este script não pode ser executado dentro de um container Docker.',
  );
  console.error(
    'Por favor, execute-o diretamente no terminal da sua máquina HOST (ex: node scripts/clear-garage.js).',
  );
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

const devEnv = loadEnvFile(resolve(rootDir, '.env'));
const testEnv = loadEnvFile(resolve(rootDir, '.env.test'));

const bucketDev = process.env.S3_BUCKET || devEnv.S3_BUCKET;
const bucketTest = testEnv.S3_BUCKET;

if (!bucketDev && !bucketTest) {
  console.error(
    '❌ Erro: Nenhum bucket (S3_BUCKET) encontrado no ambiente ou nos arquivos .env/.env.test.',
  );
  process.exit(1);
}

function clearBucket(bucketName) {
  if (!bucketName) return;

  console.log(`🧹 Removendo bucket "${bucketName}"...`);

  const execGarageCli = (args) => {
    const result = spawnSync(
      'docker',
      ['compose', 'exec', '-T', 'garage', '/garage', ...args],
      { cwd: rootDir, encoding: 'utf-8' },
    );

    if (result.error) {
      console.error(`❌ Erro ao executar o Docker: ${result.error.message}`);
      return;
    }

    if (result.status !== 0) {
      const stderr = result.stderr || '';
      // Ignora erro caso o bucket não exista
      if (
        stderr.includes('does not exist') ||
        stderr.includes('Not found') ||
        stderr.includes('no such bucket')
      ) {
        return;
      }
      console.warn(`⚠️️ Erro no Garage (${args.join(' ')}):`, stderr.trim());
    }
  };

  // Deleta o bucket do Garage
  execGarageCli(['bucket', 'delete', '--yes', bucketName]);
}

console.log('⚙️ Removendo buckets no Garage via CLI...');

if (bucketDev) clearBucket(bucketDev);
if (bucketTest) clearBucket(bucketTest);

console.log('✅ Removidos com sucesso!');
