/*
 * Checks every patch in this repo against a live Discord build, without touching Discord.
 *
 *   node scripts/verify-patches.mjs [ptb|stable|canary]
 *
 * Discord re-minifies on every client update, so a patch that matched last week can silently stop
 * matching - and a patch that stops matching is a plugin that quietly does nothing. This downloads
 * the chunks the app actually loads, splits them on webpack module headers, and for each patch
 * reports the module its `find` selects and whether the `match` still hits it.
 *
 * The patches are read out of the plugin sources rather than copied here, so this cannot drift from
 * what ships. `find` picks the LOWEST matching module id, the same rule Vencord's own `find` uses.
 */

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const HOSTS = { ptb: "https://ptb.discord.com", stable: "https://discord.com", canary: "https://canary.discord.com" };
const HOST = HOSTS[process.argv[2] ?? "ptb"] ?? HOSTS.ptb;

/*
 * Patches that match on text Vencord injects rather than on Discord's own code. Vencord's patch has
 * to be applied to the module first or ours can never match - it is looking at text that does not
 * exist in the bundle. Keyed by the marker that gives it away.
 */
const VENCORD_PATCHES = [
    {
        marker: "Vencord.Api.ChatButtons._injectButtons",
        name: "ChatInputButtonAPI",
        match: /0===(\i)\.length(?=.{0,25}?\(0,\i\.jsxs?\)\(.{0,75}?children:\1)/,
        replace: "(Vencord.Api.ChatButtons._injectButtons($1,arguments[0]),$&)"
    }
];

/** Vencord rewrites \i to a minified-identifier pattern before matching. */
function canonicalize(rx) {
    if (typeof rx === "string") return rx;
    const source = rx.source.replaceAll(/(\\*)\\i/g, (m, escapes) =>
        escapes.length % 2 === 0 ? `${escapes}(?:[A-Za-z_$][\\w$]*)` : m.slice(1));
    return new RegExp(source, rx.flags.replace("g", ""));
}

const test = (pattern, text) => typeof pattern === "string" ? text.includes(pattern) : canonicalize(pattern).test(text);

/** Pulls the `patches: [...]` array out of a plugin's source. It is literals only, so eval is enough. */
function patchesOf(file) {
    const src = readFileSync(file, "utf8");
    const at = src.indexOf("patches:");
    if (at === -1) return [];

    let depth = 0, i = src.indexOf("[", at);
    const start = i;
    for (; i < src.length; i++) {
        if (src[i] === "[") depth++;
        else if (src[i] === "]" && --depth === 0) break;
    }

    // eslint-disable-next-line no-eval
    const patches = (0, eval)(`(${src.slice(start, i + 1)})`);
    return patches.flatMap(patch => {
        const replacements = [patch.replacement].flat().filter(Boolean);
        return replacements.map(r => ({ find: patch.find, match: r.match }));
    });
}

const plugins = readdirSync(REPO, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => ["index.tsx", "index.ts"].map(f => join(REPO, e.name, f)).find(existsSync))
    .filter(Boolean)
    .map(file => ({ plugin: file.split("/").at(-2), file }));

const all = [];
for (const { plugin, file } of plugins) {
    for (const [n, p] of patchesOf(file).entries()) all.push({ plugin, n: n + 1, ...p });
}
if (!all.length) { console.error("no patches found"); process.exit(1); }

const curl = url => execFileSync("curl", ["-sS", "--max-time", "120", "-A", "Mozilla/5.0 Chrome/140.0.0.0", url],
    { maxBuffer: 1 << 30, encoding: "utf8" });

const chunks = [...new Set(curl(`${HOST}/app`).match(/\/assets\/[A-Za-z0-9_.-]+\.js/g) ?? [])];
console.error(`${HOST}: ${all.length} patches against ${chunks.length} chunks`);

// Both shapes Discord's bundles use: `123456(a,b,c){` and `123456:(a,b,c)=>{`
const HEADER = /(?<![\w$.])(\d{3,7})(?::?\((?:[\w$,]*)\)(?:=>)?)\{/g;
function modulesOf(source) {
    const heads = [];
    HEADER.lastIndex = 0;
    for (let m; (m = HEADER.exec(source));) heads.push({ id: Number(m[1]), start: m.index });
    return heads.map((h, i) => ({ id: h.id, src: source.slice(h.start, heads[i + 1]?.start ?? source.length) }));
}

const candidates = all.map(() => []);
for (const [i, url] of chunks.entries()) {
    let body;
    try { body = curl(`${HOST}${url}`); } catch { continue; }
    if ((i + 1) % 60 === 0) console.error(`  ...${i + 1}/${chunks.length}`);
    if (!all.some(p => test(p.find, body))) continue;

    const modules = modulesOf(body);
    all.forEach((p, n) => {
        for (const mod of modules) if (test(p.find, mod.src)) candidates[n].push(mod);
    });
}

console.log("");
let broken = 0;
all.forEach((p, i) => {
    const label = `${p.plugin} #${p.n}`;
    const matching = candidates[i].sort((a, b) => a.id - b.id);

    if (!matching.length) { console.log(`FIND FAILS    ${label}  find=${p.find}`); broken++; return; }

    const winner = matching[0];
    let source = winner.src, note = "";

    // the marker is plain text; the patch source has it regex-escaped, so compare without backslashes
    const matchText = String(p.match).replaceAll("\\", "");
    const pre = VENCORD_PATCHES.find(v => matchText.includes(v.marker));
    if (pre) {
        const rx = canonicalize(pre.match);
        if (!rx.test(source)) { console.log(`PRE FAILS     ${label}  Vencord's ${pre.name} no longer matches module ${winner.id}`); broken++; return; }
        source = source.replace(rx, pre.replace);
        note = ` (after Vencord's ${pre.name})`;
    }

    const ok = test(p.match, source);
    if (!ok) broken++;
    const others = matching.length > 1 ? ` [${matching.length} modules match find: ${matching.slice(0, 4).map(m => m.id).join(",")}${matching.length > 4 ? "..." : ""}]` : "";
    console.log(`${ok ? "ok           " : "MATCH FAILS  "}${label}  module ${winner.id}${note}${others}`);
});

console.log(`\n${broken === 0 ? "ALL PATCHES OK" : `${broken} PATCH(ES) BROKEN`}`);
process.exit(broken === 0 ? 0 : 1);
