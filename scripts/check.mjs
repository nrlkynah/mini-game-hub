// Syntax check for every JavaScript file (node --check), no dependencies.
// Also makes sure every element id looked up in src/ exists in index.html.

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const files = [];
const walk = (dir) => {
    for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
            if (name !== 'node_modules' && !name.startsWith('.')) walk(path);
        } else if (/\.(m?js)$/.test(name)) {
            files.push(path);
        }
    }
};
['src', 'tests', 'scripts'].forEach(walk);

let failed = 0;
for (const file of files) {
    try {
        execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    } catch (error) {
        failed++;
        console.error(`✗ ${file}\n${error.stderr}`);
    }
}

const html = readFileSync('index.html', 'utf8');
const source = files.filter((f) => /^src[\\/]/.test(f)).map((f) => readFileSync(f, 'utf8')).join('\n');
const ids = [...new Set([...source.matchAll(/(?:\$|getElementById)\('([^']+)'\)/g)].map((m) => m[1]))];
const missing = ids.filter((id) => !html.includes(`id="${id}"`));
if (missing.length) {
    failed++;
    console.error(`✗ index.html is missing ids used in src/: ${missing.join(', ')}`);
}

console.log(failed ? `${failed} problem(s) found.` : `OK: ${files.length} files pass node --check, ${ids.length} element ids found.`);
process.exit(failed ? 1 : 0);
