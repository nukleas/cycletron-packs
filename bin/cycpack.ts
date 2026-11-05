#!/usr/bin/env node
// Work on the packs in this repo. Type checks and zips run here; building,
// rendering and the seam test run in a Cycletron checkout, since they need
// the engine and the render page. The checkout is $CYCLETRON or ../cycletron.
//
//   cycpack check <pack>            tsc and oxlint on every viz folder of the pack, and on bin/ and kit/
//   cycpack build <pack>            pack-build every viz folder (tsc + bundle to dist/)
//   cycpack zip <pack>              build, then dist/<id>-<version>.zip for Install from Zip
//   cycpack render <show> [args]    build the show's pack, then render-viz on it (args pass through)
//   cycpack seam <pack> [<pack>…]   build, then the seam test on every viz folder's build
//   cycpack probe <pack>            render the pack's probe show and compare its frames with the last probe
//   cycpack link <pack> [<pack>…]   build, then point the installed pack's viz folders at the ones here (symlinks)
//   cycpack watch <pack> [<pack>…]  rebuild a pack whenever its src/ or kit/ changes
//
// link and watch are the working loop: the app reads a linked pack's built
// visualizers straight from this repo, and watch keeps them built. The library is
// $CYCLETRON_LIBRARY or ../strulibrary.
//
// <pack> is a folder name under packs/. kit/ is shared code the packs import
// as @naderlabs/kit; each pack's build bundles what it uses. Node runs
// this file as is (type stripping), so it keeps to erasable TypeScript.

import {spawnSync, type SpawnSyncOptions} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, watch, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CYCLETRON = path.resolve(process.env.CYCLETRON ?? path.join(ROOT, '..', 'cycletron'));
const UI = path.join(CYCLETRON, 'ui');
const LIBRARY = path.resolve(process.env.CYCLETRON_LIBRARY ?? path.join(ROOT, '..', 'strulibrary'));

/** The library pack manifest fields cycpack reads. */
interface Manifest {
    id: string;
    version: string;
    /** Viz folders, relative to the pack. */
    viz?: string[];
}

interface Pack {
    name: string;
    dir: string;
    manifest: Manifest;
    /** Absolute paths of the pack's viz folders. */
    viz: string[];
}

function isString(value: unknown): value is string {
    return typeof value === 'string';
}

function isManifest(value: unknown): value is Manifest {
    if (typeof value !== 'object' || value === null) return false;
    const m: Partial<Record<keyof Manifest, unknown>> = value;
    return isString(m.id) && isString(m.version) && (m.viz === undefined || (Array.isArray(m.viz) && m.viz.every(isString)));
}

function fail(msg: string): never {
    console.error(`cycpack: ${msg}`);
    process.exit(1);
}

function checkout(): void {
    if (!existsSync(path.join(UI, 'scripts', 'pack-build.mjs'))) {
        fail(`no Cycletron checkout at ${CYCLETRON} (set CYCLETRON)`);
    }
}

function pack(name: string | undefined): Pack {
    if (!name) fail('which pack?');
    const dir = path.join(ROOT, 'packs', name);
    const manifestPath = path.join(dir, 'pack.json');
    if (!existsSync(manifestPath)) fail(`${dir}: no pack.json`);
    const parsed: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (!isManifest(parsed)) fail(`${manifestPath}: needs a string id and version, and viz as a list of folders`);
    return {name, dir, manifest: parsed, viz: (parsed.viz ?? []).map((rel) => path.join(dir, rel))};
}

function run(cmd: string, args: readonly string[], opts: SpawnSyncOptions = {}): void {
    const r = spawnSync(cmd, args, {stdio: 'inherit', ...opts});
    if (r.status !== 0) process.exit(r.status ?? 1);
}

/** tsc on a folder's tsconfig.json, and oxlint on its sources (`src/` unless named). */
function check(dir: string, sources = path.join(dir, 'src')): void {
    run(path.join(UI, 'node_modules', '.bin', 'tsc'), ['-p', path.join(dir, 'tsconfig.json'), '--pretty', 'false']);
    run(path.join(ROOT, 'node_modules', '.bin', 'oxlint'), ['-c', path.join(ROOT, '.oxlintrc.json'), '--deny-warnings', sources]);
}

/**
 * Build every viz folder of the pack. The renderer only rebuilds a pack whose
 * src/ is newer than its dist/, which misses edits to kit/, so anything that
 * renders builds first.
 */
function build(p: Pack, args: readonly string[] = []): void {
    for (const v of p.viz) run('node', [path.join(UI, 'scripts', 'pack-build.mjs'), v, ...args], {cwd: UI});
}

/** Build every viz folder of the pack, reporting a failure instead of exiting: for watch. */
function rebuild(p: Pack): boolean {
    return p.viz.every((v) => spawnSync('node', [path.join(UI, 'scripts', 'pack-build.mjs'), v], {stdio: 'inherit', cwd: UI}).status === 0);
}

/** The pack a show file lives in, or null for a show outside packs/. */
function packOfShow(show: string): Pack | null {
    const rel = path.relative(path.join(ROOT, 'packs'), path.resolve(show));
    return rel.startsWith('..') ? null : pack(rel.split(path.sep)[0]);
}

const [cmd, arg, ...rest] = process.argv.slice(2);

switch (cmd) {
    case 'check': {
        const p = pack(arg);
        checkout();
        check(path.join(ROOT, 'bin'), path.join(ROOT, 'bin'));
        check(path.join(ROOT, 'kit'));
        for (const v of p.viz) check(v);
        console.log(`${p.name}: bin, kit and ${p.viz.length} viz folder(s) type-check and lint clean`);
        break;
    }
    case 'build': {
        const p = pack(arg);
        checkout();
        build(p, rest);
        break;
    }
    case 'zip': {
        const p = pack(arg);
        checkout();
        build(p);
        const out = path.join(ROOT, 'dist');
        mkdirSync(out, {recursive: true});
        const file = path.join(out, `${p.manifest.id}-${p.manifest.version}.zip`);
        rmSync(file, {force: true});
        // The zip holds the pack as one top-level folder named by its id, which is
        // what Install from Zip expects. The app loads dist/, so the sources stay
        // out (they import kit/, which isn't in the zip), as do the probe, renders,
        // staging and the editor config.
        run('zip', ['-qr', file, p.name, '-x', `${p.name}/renders/*`, `${p.name}/probe/*`, `${p.name}/*/_*`, `${p.name}/_*`, '*/src/*', '*/.DS_Store', '*/tsconfig.json'],
            {cwd: path.join(ROOT, 'packs')});
        console.log(file);
        break;
    }
    case 'render': {
        if (!arg) fail('which show?');
        checkout();
        const p = packOfShow(arg);
        if (p) build(p);
        // The renderer runs in the checkout, so a relative --out is resolved here, against the caller's directory.
        const flags = rest.map((v, i) => (rest[i - 1] === '--out' ? path.resolve(v) : v));
        run('node', [path.join(UI, 'scripts', 'render-viz.mjs'), path.resolve(arg), ...flags], {cwd: UI});
        break;
    }
    case 'seam': {
        // Every viz folder of the named packs in one run, so packs registering
        // together is covered: cycpack seam christmas halloween
        const packs = [arg, ...rest].map(pack);
        checkout();
        for (const p of packs) build(p);
        const dirs = packs.flatMap((p) => p.viz);
        run('node', ['--test', '--test-force-exit', '--test-name-pattern=loaded from its built module', path.join(UI, 'scripts', 'render-viz.test.mjs')],
            {cwd: UI, env: {...process.env, VIZ_PACK: dirs.join(path.delimiter)}});
        break;
    }
    case 'probe': {
        // probe/probe.show.toml cuts through every mode of the pack. Rendered on one
        // job (a multi-job render may differ by a level at chunk seams), its frames
        // hash to one digest: unchanged means no mode drew a pixel differently.
        const p = pack(arg);
        checkout();
        build(p);
        const show = path.join(p.dir, 'probe', 'probe.show.toml');
        if (!existsSync(show)) fail(`${show}: no probe show`);
        const video = path.join(p.dir, 'renders', 'probe.mp4');
        // 40 seconds is a pass through every mode at either pack's tempo; --to overrides it.
        const span = rest.includes('--to') ? rest : ['--to', '40', ...rest];
        run('node', [path.join(UI, 'scripts', 'render-viz.mjs'), show, '--out', video, '--jobs', '1', ...span], {cwd: UI});
        const frames = spawnSync('ffmpeg', ['-v', 'error', '-i', video, '-map', '0:v', '-f', 'framemd5', '-'], {encoding: 'utf8', maxBuffer: 1 << 28});
        if (frames.status !== 0) fail(`ffmpeg: ${frames.stderr.trim()}`);
        const lines = frames.stdout.split('\n').filter((l) => l && !l.startsWith('#'));
        const digest = createHash('sha256').update(lines.join('\n')).digest('hex').slice(0, 16);
        const last = path.join(p.dir, 'renders', 'probe.digest');
        const before = existsSync(last) ? readFileSync(last, 'utf8').trim() : null;
        writeFileSync(last, `${digest}\n`);
        const verdict = before === null ? 'first probe' : before === digest ? 'unchanged' : `CHANGED (was ${before})`;
        console.log(`${p.name}: ${lines.length} frames, ${digest}, ${verdict}`);
        break;
    }
    case 'link': {
        // Only the viz folders are linked. The app keeps every library read inside
        // the library by real path, so a linked pack folder would lose its songs and
        // shows; viz code loads by the link's own path.
        const packs = [arg, ...rest].map(pack);
        checkout();
        for (const p of packs) {
            const installed = path.join(LIBRARY, 'Packs', p.manifest.id);
            if (!existsSync(installed)) fail(`${installed}: not installed; install dist/${p.manifest.id}-${p.manifest.version}.zip first (cycpack zip)`);
            build(p);
            for (const rel of p.manifest.viz ?? []) {
                const dest = path.join(installed, rel);
                // An installed viz folder holds only the zip's build, so it is replaced.
                if (lstatSync(dest, {throwIfNoEntry: false})) rmSync(dest, {recursive: true});
                symlinkSync(path.join(p.dir, rel), dest, 'dir');
                console.log(`${dest} -> ${path.join(p.dir, rel)}`);
            }
        }
        console.log('The app loads pack code at launch: restart Cycletron to pick up a build.');
        break;
    }
    case 'watch': {
        const packs = [arg, ...rest].map(pack);
        checkout();
        // Saves come in bursts (an editor writes, formats, writes again); build once they settle.
        const pending = new Set<Pack>();
        let timer: NodeJS.Timeout | undefined;
        const queue = (ps: readonly Pack[]) => {
            for (const p of ps) pending.add(p);
            clearTimeout(timer);
            timer = setTimeout(() => {
                for (const p of pending) console.log(`${p.name}: ${rebuild(p) ? 'built' : 'build failed'} at ${new Date().toLocaleTimeString()}`);
                pending.clear();
            }, 200);
        };
        for (const p of packs) for (const v of p.viz) watch(path.join(v, 'src'), {recursive: true}, () => queue([p]));
        watch(path.join(ROOT, 'kit', 'src'), {recursive: true}, () => queue(packs));
        console.log(`watching ${packs.map((p) => p.name).join(', ')} and kit/ (ctrl-c to stop)`);
        break;
    }
    default:
        fail('usage: cycpack check|build|zip|render|seam|probe|link|watch ... (see the header of bin/cycpack.ts)');
}
