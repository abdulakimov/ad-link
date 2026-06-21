import { resolve } from 'node:path';

// Load the repo-root .env for integration tests (CI provides vars directly).
try {
  process.loadEnvFile(resolve(process.cwd(), '../../.env'));
} catch {
  // optional
}
