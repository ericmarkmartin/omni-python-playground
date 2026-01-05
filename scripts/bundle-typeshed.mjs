#!/usr/bin/env node
/**
 * Script to fetch Python typeshed stdlib stubs from GitHub and bundle them as JSON.
 * This creates a typeshed.json file that can be imported and used to provide
 * type stubs to browser-basedpyright.
 * 
 * Usage: node scripts/bundle-typeshed.mjs
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_FILE = path.join(__dirname, '../src/services/lsp/typeshed.json');

// GitHub API base for typeshed stdlib
const GITHUB_API_BASE = 'https://api.github.com/repos/python/typeshed/contents/stdlib';
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/python/typeshed/main/stdlib';

// Rate limiting helper
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Fetch JSON from GitHub API
function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'User-Agent': 'omni-python-playground',
                'Accept': 'application/vnd.github.v3+json'
            }
        };

        https.get(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                    return;
                }
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

// Fetch raw file content
function fetchRaw(url) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'User-Agent': 'omni-python-playground'
            }
        };

        https.get(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode} for ${url}`));
                    return;
                }
                resolve(data);
            });
        }).on('error', reject);
    });
}

// Essential modules for basic Python type checking
const ESSENTIAL_MODULES = [
    'VERSIONS',
    'builtins.pyi',
    'typing.pyi',
    'typing_extensions.pyi',
    '_typeshed',
    'collections',
    'abc.pyi',
    'types.pyi',
    'sys.pyi',
    'os',
    'io.pyi',
    're.pyi',
    'functools.pyi',
    'itertools.pyi',
    'contextlib.pyi',
    'dataclasses.pyi',
    'enum.pyi',
    'json',
    'pathlib.pyi',
    'datetime.pyi',
    'copy.pyi',
    'warnings.pyi',
    'weakref.pyi',
];

async function fetchDirectory(dirPath, files, depth = 0) {
    const indent = '  '.repeat(depth);
    const url = `${GITHUB_API_BASE}${dirPath}?ref=main`;

    console.log(`${indent}Fetching: ${dirPath || '/'}`);

    const items = await fetchJson(url);

    for (const item of items) {
        // Skip tests
        if (item.name.startsWith('@')) continue;

        // For root level, only fetch essential modules
        if (depth === 0 && !ESSENTIAL_MODULES.some(m => item.name === m || item.name.startsWith(m.split('.')[0]))) {
            continue;
        }

        if (item.type === 'file' && (item.name.endsWith('.pyi') || item.name === 'VERSIONS')) {
            const filePath = `/typeshed/stdlib${dirPath}/${item.name}`;
            console.log(`${indent}  Downloading: ${item.name}`);

            try {
                const content = await fetchRaw(item.download_url);
                files[filePath] = content;
                // Small delay to avoid rate limiting
                await sleep(50);
            } catch (e) {
                console.error(`${indent}  Error fetching ${item.name}: ${e.message}`);
            }
        } else if (item.type === 'dir') {
            // Recurse into subdirectories for essential modules
            await fetchDirectory(`${dirPath}/${item.name}`, files, depth + 1);
        }
    }
}

async function main() {
    console.log('Fetching Python typeshed stdlib stubs...');
    console.log('This may take a minute due to GitHub API rate limiting...\n');

    const files = {};

    try {
        await fetchDirectory('', files, 0);

        console.log(`\nDownloaded ${Object.keys(files).length} files`);

        // Write to JSON file
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(files, null, 2));
        console.log(`\nWritten to: ${OUTPUT_FILE}`);

        // Calculate size
        const stats = fs.statSync(OUTPUT_FILE);
        console.log(`File size: ${(stats.size / 1024).toFixed(2)} KB`);
        console.log(`Gzipped estimate: ~${(stats.size / 1024 / 3).toFixed(2)} KB`);

    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

main();
