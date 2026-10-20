import { loadEnvConfig } from '@next/env';

// CLI commands and the Next server must address the same data directory.
loadEnvConfig(process.cwd());
