// Loads <project root>/.env if it exists. Variables already set in the environment
// (e.g. via cPanel's "Environment variables" panel) take precedence over the file.
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

dotenv.config({ path: path.join(ROOT_DIR, '.env') });

export const isProduction = process.env.NODE_ENV === 'production';
