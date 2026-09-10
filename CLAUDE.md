# VencordPlugins

Vencord userplugins. The repo lives at `G:\VencordPlugins`; the Vencord checkout it is built
into lives at `C:\Users\thorb\Vencord`.

## Always end an update with the deploy steps

After **every** change to plugin code, show the user this block verbatim — they run it by hand,
and a change that isn't copied into Vencord never reaches Discord:

```powershell
cd G:\VencordPlugins
git pull
.\scripts\sync-to-vencord.ps1 -Vencord C:\Users\thorb\Vencord -Build
```

(The script pulls on its own too, unless `-NoPull` is passed. It prints the commit it syncs
from - if that is not the commit just pushed, nothing else matters.)

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

Patches can be checked without touching Discord: `curl https://ptb.discord.com/app`, pull the
`/assets/*.js` chunks it lists (`web.*.js` holds most module code), split them on webpack module
headers, then test each `find`/`match` regex and confirm the patched module still parses.
`find` iterates modules in ascending id order, so the lowest matching id wins — check that the
intended module is the first match, not just a match.
