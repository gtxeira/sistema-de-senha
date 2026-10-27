import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkIsRunningInDocker } from './check-is-running-in-docker';
import { loadEnvFile } from './load-env-file';

if (checkIsRunningInDocker()) {
  console.error('❌ ERRO DE EXECUÇÃO:');
  console.error(
    'Este script não pode ser executado dentro de um container Docker.',
  );
  console.error(
    'Por favor, execute-o diretamente no terminal da sua máquina HOST (ex: node scripts/setup.js).',
  );
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

const testEnv = loadEnvFile(resolve(rootDir, '.env.test'));

const keyDev = process.env.S3_ACCESS_KEY;
const bucketDev = process.env.S3_BUCKET;

const keyTest = testEnv.S3_ACCESS_KEY;
const bucketTest = testEnv.S3_BUCKET;

if (!keyDev || !keyTest) {
  console.error(
    '❌ Erro: Chaves S3_ACCESS_KEY não encontradas no ambiente ou no .env.test',
  );
  process.exit(1);
}

function setupBucket(bucketName, keyId) {
  console.log(`📦 Processando bucket "${bucketName}"...`);

  const execGarageCli = (args) => {
    // Usamos spawnSync com um array para não precisar do /bin/sh do container
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
      // Ignora erro caso o bucket já exista
      if (stderr.includes('already exists') || stderr.includes('Exist')) {
        return;
      }
      console.warn(`⚠️ Erro no Garage (${args.join(' ')}):`, stderr.trim());
    }
  };

  // Comandos oficiais da CLI do Garage
  execGarageCli(['bucket', 'create', bucketName]);
  execGarageCli([
    'bucket',
    'allow',
    bucketName,
    '--key',
    keyId,
    '--read',
    '--write',
  ]);
  execGarageCli(['bucket', 'website', bucketName, '--allow']);
}

console.log('⚙️ Configurando buckets no Garage via CLI...');

setupBucket(bucketDev, keyDev);
setupBucket(bucketTest, keyTest);

console.log('✅ Configuração concluída!');
