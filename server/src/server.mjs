import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAuctionServer } from './app.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = process.env.MEDIASFU_VALIDATION_ENV_PATH || path.join(root, '.env');
if (fs.existsSync(envPath)) for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) { const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/); if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, ''); }
const port = Number(process.env.PORT || 8791);
createAuctionServer().listen(port, '127.0.0.1', () => console.log(`MediaSFU live-auction backend listening on http://127.0.0.1:${port}`));
