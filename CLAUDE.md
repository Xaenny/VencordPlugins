# VencordPlugins

Vencord userplugins. The repo lives at `G:\VencordPlugins`; the Vencord checkout it is built
into lives at `C:\Users\thorb\Vencord`.

## Always end an update with the deploy steps

After **every** change to plugin code, show the user this block verbatim — they run it by hand,
and a change that isn't copied into Vencord never reaches Discord:

```powershell
cd G:\VencordPlugins
git pull
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\sync-to-vencord.ps1 -Vencord C:\Users\thorb\Vencord -Build
```

(The script pulls on its own too, unless `-NoPull` is passed. It prints the commit it syncs
from - if that is not the commit just pushed, nothing else matters. It also pulls the Vencord
checkout, because Vencord's own webpack lookups go stale with every Discord bundle and a stale
one throws inside a React render, which is a client crash rather than a broken plugin.)

Add `-Release` to build without `--dev`. Dev builds keep Vencord's tracer live (every webpack
lookup times itself and logs), hold the full pre-patch source of every patched module, and make a
stale lookup throw inside a React render rather than degrade. That last one is why `--dev` is the
default here - it surfaces a stale patch immediately instead of letting it rot - but it is a
developer's trade, not a user's, so `-Release` exists for when the client just has to be fast.

A failed Vencord pull is now **fatal** - the script refuses to build rather than printing a warning
that scrolls past. `-AllowStaleVencord` overrides it. It also prints the version and flags a
checkout more than 14 days old.

### `scripts/doctor.ps1` - run this before diagnosing anything

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\doctor.ps1
```

Prints the repo commit, the Vencord checkout's version/branch/commit/age/build time, and - the part
that kept being assumed rather than checked - **which Vencord each Discord install is patched to**.
Rebuilding a checkout only reaches Discord if that Discord points at it: patch Stable and run PTB,
or leave an older checkout patched, and every rebuild succeeds while the client loads something
else. The script reads the path out of each patched `app.asar` and compares it, so that is visible
rather than inferred.

### A stale Vencord checkout is the first suspect for any client crash

Three sessions have been spent reading plugin code when the real fault was a Vencord weeks behind
Discord. Both of these were fixed upstream *before* they were reported here:

- `findExportedComponent found no module` - opening **any** plugin's settings took the client down.
  That is Vencord's own `PluginModal` rendering `Modal` from `@webpack/common`, which was
  `findExportedComponentLazy("Modal")` until 2026-09-26. **Current Vencord contains no
  `findExportedComponentLazy` call at all**, so this error is proof on its own that the running
  build is old - whatever the checkout on disk says.
- `Cannot read properties of undefined (reading 'SUCCESS')` - `Toasts.Type` was removed outright on
  2026-10-03. Reading a property off a Vencord-resolved object **throws** rather than giving
  `undefined`, so a toast can abort the handler that called it.

So before touching a plugin: check the `Vencord v… at: <commit>` line the sync script prints. If
the crash is inside Vencord's own UI (settings, modals, the toolbox), it is not ours to fix.

**Always spell the block with `powershell -NoProfile -ExecutionPolicy Bypass -File`.** Calling
`.\scripts\sync-to-vencord.ps1` directly is refused on a default machine ("Die Ausführung von
Skripts auf diesem System ist deaktiviert"), and `Set-ExecutionPolicy -Scope Process` only lasts
until that window closes, so the next update hits it again.

Or the manual equivalent:

```powershell
cd G:\VencordPlugins
git pull
Copy-Item G:\VencordPlugins\<plugin> C:\Users\thorb\Vencord\src\userplugins\ -Recurse -Force
cd C:\Users\thorb\Vencord
pnpm build --dev
pnpm inject
```

Then a full Discord restart. Mention which plugin folders actually changed.

**The pull is the step that gets forgotten, and skipping it looks exactly like "your fix did
nothing":** the plugins rebuild happily, just from stale source. Before re-diagnosing anything,
confirm the running build is the new one - FavoriteMedia logs `Starting revision <REVISION>` on
start, and `REVISION` in `FavoriteMedia/index.tsx` must be bumped whenever that plugin changes.

## How this repo reaches Vencord

`scripts/install.ps1` (via `install.bat`) sets up Vencord, the plugins and a dev build from
scratch, and updates all of it when re-run. `scripts/sync-to-vencord.ps1` does just the
copy-and-build half. Both were executed for real against a Vencord checkout, not only written.


Plugins must be **copied** into `src\userplugins`. Junctions and symlinks break the build:
esbuild resolves them to their real path outside the Vencord tree, and `@api/*`, `@utils/*` and
`@webpack/*` stop resolving. Junctioning the whole repo is worse — Vencord imports every entry in
`src\userplugins` and would choke on `README.md` and `scripts`.

The repo and the copies have drifted before (the client was running a FavoriteMedia patch that
existed nowhere in this repository, so fixes pushed here did nothing). If a fix "doesn't work",
check that the copy in `src\userplugins` is actually this code before re-diagnosing.

## Writing patches and webpack lookups

The user builds with `pnpm build --dev`. On dev builds Vencord's `handleModuleNotFound` **throws**,
so a stale `find*Lazy` evaluated inside a React render takes down the whole client. This is what
made every message containing an image crash Discord.

- Never match on Discord's minified locals (`E`, `A`, `Y`, `kx`, `g9`, `bW`). They are regenerated
  on every client build. Match on structure, `\i`, and property names that survive minification.
- Prefer `#{intl::SOME_KEY}` anchors — intl keys survive minification entirely.
- For component lookups use the non-throwing helpers in `FavoriteMedia/utils.ts`
  (`lazyResolve`, `findComponentSafely`, which go through `find(..., { isIndirect: true })`), give
  several candidate filters, and render a fallback or nothing when none match.
- Wrap anything injected into Discord's own render tree in `ErrorBoundary.wrap(..., { noop: true })`.

## Verifying a patch against the real Discord build

`node scripts/verify-patches.mjs [ptb|stable|canary]` does this for every patch in the repo. It
reads the patches out of the plugin sources (so it cannot drift from what ships), downloads the
chunks the app actually loads, splits them on webpack module headers, and prints the module each
`find` selects and whether the `match` still hits it. Exit code is non-zero if anything is broken.
**Run it after every Discord or Vencord update, before re-diagnosing anything.**

Two things it knows that are easy to get wrong by hand:

- `find` iterates modules in ascending id order, so the **lowest** matching id wins. The intended
  module has to be the first match, not just a match.
- Some of our patches match on text *Vencord* injects (`Vencord.Api.ChatButtons._injectButtons`),
  which does not exist in Discord's bundle. Vencord's own patch has to be applied to the module
  first or ours looks broken when it isn't.
