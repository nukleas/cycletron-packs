#!/usr/bin/env node
// Work on the packs in this repo. Type checks and zips run here; building,
// rendering and the seam test run in a Cycletron checkout, since they need
// the engine and the render page. The checkout is $CYCLETRON or ../cycletron.
//
//   cycpack check <pack>            tsc on every viz folder of the pack
//   cycpack build <pack>            pack-build every viz folder (tsc + bundle to dist/)
//   cycpack zip <pack>              build, then dist/<id>-<version>.zip for Install from Zip
//   cycpack render <show> [args]    render-viz on a show file (args pass through)
//   cycpack seam <pack> [<pack>…]   the seam test on every viz folder's build
//
// <pack> is a folder name under packs/.

import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, rmSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CYCLETRON = path.resolve(process.env.CYCLETRON ?? path.join(ROOT, '..', 'cycletron'));
const UI = path.join(CYCLETRON, 'ui');

function fail(msg) {
    console.error(`cycpack: ${msg}`);
    process.exit(1);
}

function checkout() {
    if (!existsSync(path.join(UI, 'scripts', 'pack-build.mjs'))) {
        fail(`no Cycletron checkout at ${CYCLETRON} (set CYCLETRON)`);
    }
}

function pack(name) {
    if (!name) fail('which pack?');
    const dir = path.join(ROOT, 'packs', name);
    const manifestPath = path.join(dir, 'pack.json');
    if (!existsSync(manifestPath)) fail(`${dir}: no pack.json`);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const viz = (manifest.viz ?? []).map((rel) => path.join(dir, rel));
    return {name, dir, manifest, viz};
}

function run(cmd, args, opts = {}) {
    const r = spawnSync(cmd, args, {stdio: 'inherit', ...opts});
    if (r.status !== 0) process.exit(r.status ?? 1);
}

const [cmd, arg, ...rest] = process.argv.slice(2);

switch (cmd) {
    case 'check': {
        const p = pack(arg);
        checkout();
        for (const v of p.viz) run(path.join(UI, 'node_modules', '.bin', 'tsc'), ['-p', path.join(v, 'tsconfig.json'), '--pretty', 'false']);
        console.log(`${p.name}: ${p.viz.length} viz folder(s) type-check`);
        break;
    }
    case 'build': {
        const p = pack(arg);
        checkout();
        for (const v of p.viz) run('node', [path.join(UI, 'scripts', 'pack-build.mjs'), v, ...rest], {cwd: UI});
        break;
    }
    case 'zip': {
        const p = pack(arg);
        checkout();
        for (const v of p.viz) run('node', [path.join(UI, 'scripts', 'pack-build.mjs'), v], {cwd: UI});
        const out = path.join(ROOT, 'dist');
        mkdirSync(out, {recursive: true});
        const file = path.join(out, `${p.manifest.id}-${p.manifest.version}.zip`);
        rmSync(file, {force: true});
        // The zip holds the pack as one top-level folder named by its id, which is
        // what Install from Zip expects. Renders, staging and the editor config stay out.
        run('zip', ['-qr', file, p.name, '-x', `${p.name}/renders/*`, `${p.name}/*/_*`, `${p.name}/_*`, '*/.DS_Store', '*/tsconfig.json'],
            {cwd: path.join(ROOT, 'packs')});
        console.log(file);
        break;
    }
    case 'render': {
        if (!arg) fail('which show?');
        checkout();
        run('node', [path.join(UI, 'scripts', 'render-viz.mjs'), path.resolve(arg), ...rest], {cwd: UI});
        break;
    }
    case 'seam': {
        // Every viz folder of the named packs in one run, so packs registering
        // together is covered: cycpack seam christmas halloween
        const packs = [arg, ...rest].map(pack);
        checkout();
        const dirs = packs.flatMap((p) => p.viz);
        run('node', ['--test', '--test-force-exit', '--test-name-pattern=loaded from its built module', path.join(UI, 'scripts', 'render-viz.test.mjs')],
            {cwd: UI, env: {...process.env, VIZ_PACK: dirs.join(path.delimiter)}});
        break;
    }
    default:
        fail('usage: cycpack check|build|zip|render|seam ... (see the header of bin/cycpack.mjs)');
}
