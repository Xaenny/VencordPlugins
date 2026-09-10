# Vencord User Plugins by [Xaenny](https://github.com/Xaenny)

A collection of custom [Vencord](https://github.com/Vendicated/Vencord) userplugins — quality-of-life tools for Discord's chat bar, media picker, and loading screen.

---

## Plugins

### BetterFormattingRedux

A full formatting toolbar for the main chat input, ported from [BetterDiscord's BetterFormattingRedux](https://github.com/zerebos/BetterDiscordAddons) by Zerebos.

**What it does:**
- Adds an **Aa** button next to the GIF picker that opens a formatting toolbar above the chat box
- Supports standard Discord markdown: **bold**, *italic*, underline, strikethrough, spoilers, code, code blocks, headers, quotes, lists, and masked links
- Adds extra text transforms: superscript, smallcaps, fullwidth, upsidedown, varied caps, leet, and more
- Formats are applied when you send the message — wrappers like `^^`, `%%`, `##` are converted automatically
- Highly configurable: toggle individual buttons, change toolbar position (left/right), opacity, font size, and open behavior

**Best for:** Anyone who formats messages often and wants BD-style formatting without leaving Vencord.

---

### CustomLoadingLogo

Replaces Discord's animated loading logo (the spinning Discord logo on "Connecting…" / "Did you know…" screens) with your own image.

**What it does:**
- Swaps the default `.webm` loading video for a custom image URL
- Keeps the original animation timing and layout
- Configurable image URL in plugin settings (PNG or WebP recommended)
- Default logo included out of the box

**Note:** This affects the in-app loading screen, not the Electron splash screen on startup. For startup splash changes you'd need Vesktop or main-process modifications.

---

### FavoriteMedia

Save images, videos, and file attachments as favourites — similar to [BetterDiscord FavoriteMedia](https://github.com/Dastan21/BDAddons). Based on the community [Favourite Anything](https://git.nin0.dev/userplugins/favouriteAnything) plugin by nin0dev & Davri, with enhancements by TetraSsky.

**What it does:**
- **Star button** on images and videos in messages — hover and click to favourite
- Extends the **GIF/Media expression picker** with new tabs:
  - **Texts** — saved text snippets (requires SavedTexts plugin)
  - **Media** — native GIF favourites
  - **Image** — favourited static images
  - **Video** — favourited videos
  - **Files** — favourited file attachments
- Optional quick-access buttons in the chat bar for Image, Video, and Files pickers
- Uses Discord's native `favoriteGifs` storage so favourites sync with your account

**Settings:** Chat bar buttons for Image/Video/Files are off by default — enable them in plugin settings if wanted.

---

### SavedTexts

Save and quickly reuse text snippets — like FavoriteMedia, but for text.

**What it does:**
- Adds a **document icon** button in the chat bar (before the GIF button) that opens the expression picker on a **Texts** tab
- **Texts tab** in the media picker shows saved snippets in a masonry grid (same layout as images/videos)
- Click a card to insert its text into the chat input
- Hover a card for **Edit** and **Delete** buttons
- **Add** button and **Search** bar in the Texts tab
- Right-click any message → **Save Text** to save its content as a new snippet
- **Preview character limit** setting controls how much text is shown on each card

**Works best with:** FavoriteMedia enabled (FavoriteMedia renders the Texts tab in the picker).

---

### ModToolDiscord

Moderation shortcuts for a command-driven bot — the punishment actions, presets and per-server
command channel of a standalone mod tool, inside Discord itself.

**What it does:**
- Adds a **ModTool** entry to the **message** and **member** right-click menus that opens the punish panel, plus a **ModTool button on message hover** for the actions directly
- Every action sends its command (e.g. `.to @user 1d spam`) straight to the channel you picked **for that server** — the view never switches channels
- Each action's submenu offers your **time and reason presets**, so a different duration or reason is still one click
- **Presets** for times and reasons, editable in plugin settings and stored for your Discord account
- **Per-server command channel**, set by right-clicking a channel → *Send ModTool commands here*
- A **punish panel** for full control — target, time, reason, channel and every action in one place
- Optional **Forward** and **Delete** tickboxes when opened from a message: the message is forwarded to the server's forward channel *before* it is deleted, and if the forward fails the delete is skipped rather than losing it
- Command names are configurable, so `.to` / `.ban` can be whatever your bot uses
- Kick and Ban open the panel first by default, so a destructive action is never a single stray click

**Best for:** moderating with a bot whose commands you'd otherwise type out by hand.

---

### HideGiftButton

Removes the Nitro **gift button** from the chat input bar.

**What it does:**
- Hides the "Send a gift" / Nitro gift button next to the chat bar icons
- Toggle on/off in plugin settings
- Uses both CSS and runtime patches for reliable hiding across Discord updates

**Best for:** Keeping the chat bar clean if you never use the gift button.

---

## Installation

### Installer (recommended)

Download **`VencordPluginsInstaller.exe`** from the
[latest release](https://github.com/Xaenny/VencordPlugins/releases/latest) and run it.

It follows the [official Vencord source install](https://docs.vencord.dev/installing/) step by
step, and adds the plugins in the one place they fit — after the dependencies, before the build:

1. Checks `git --version`, `node --version` and `pnpm --version` (installing pnpm through corepack if it's missing)
2. `git clone https://github.com/Vendicated/Vencord`
3. `pnpm install --frozen-lockfile`
4. Creates `src\userplugins` if it isn't there, and copies the plugins in
5. `pnpm build --dev`
6. **Asks which Discord to patch** — only offering the versions actually installed — then `pnpm inject`

You need [Git](https://git-scm.com/download/win) and [Node.js 22 or newer](https://nodejs.org)
first; the installer says so if either is missing. Close Discord when it asks.

Then start Discord and enable the plugins in **Vencord Settings → Plugins**. Run it again any time
to update Vencord and the plugins.

Options, from a terminal:

```
VencordPluginsInstaller.exe -vencord D:\Vencord   put Vencord somewhere else
VencordPluginsInstaller.exe -branch ptb           don't ask, patch PTB
VencordPluginsInstaller.exe -skip-inject          build only, Discord already patched
VencordPluginsInstaller.exe -y                    never prompt (needs -branch)
```

#### About the Windows warning

Windows shows *"Windows protected your PC"* for any executable it hasn't seen before. That isn't
something the code can fix — SmartScreen goes by code signing and download reputation:

| | |
|---|---|
| **EV code-signing certificate** (~$300–500/year, on a hardware token) | trusted immediately, no warning |
| **Standard OV certificate** (~$100–200/year) | still warns until the file builds up reputation |
| **Self-signed certificate** | doesn't help at all — Windows treats it as unknown either way |

So, two options in the meantime:

- Click **More info → Run anyway**. Each release publishes `VencordPluginsInstaller.exe.sha256`,
  so you can confirm the download is the binary GitHub Actions built:
  ```powershell
  Get-FileHash .\VencordPluginsInstaller.exe -Algorithm SHA256
  ```
- Or skip the exe. This does the same thing and SmartScreen doesn't gate it:
  ```powershell
  irm https://raw.githubusercontent.com/Xaenny/VencordPlugins/master/scripts/install.ps1 | iex
  ```

If you'd rather have the warning gone properly, buy a certificate and signing is a few lines in the
release workflow.

### PowerShell script

Same thing without the exe, if you'd rather read the script first:

```powershell
git clone https://github.com/Xaenny/VencordPlugins
cd VencordPlugins
.\install.bat
```

### Updating

Run the same command again — it pulls both repos, rebuilds, and leaves your Discord patch alone:

```powershell
.\install.bat -SkipInject
```

To update only the plugins in an existing Vencord checkout:

```powershell
git pull
.\scripts\sync-to-vencord.ps1 -Vencord C:\path\to\Vencord -Build
```

The sync script pulls this repo first and prints the commit it copied from, so a stale checkout is
obvious. It backs up any destination folder that differs before replacing it, so edits made in the
wrong place are never lost silently.

### By hand

1. Copy the plugin folders into your Vencord `src/userplugins/` directory:
   ```
   Vencord/
   └── src/
       └── userplugins/
           ├── BetterFormattingRedux/
           ├── CustomLoadingLogo/
           ├── FavoriteMedia/
           ├── ModToolDiscord/
           ├── SavedTexts/
           └── HideGiftButton/
   ```

   They must be **copied**. Junctions and symlinks break the build: esbuild resolves them to their
   real path outside the Vencord tree, and the `@api`/`@utils`/`@webpack` aliases stop resolving.

2. From your Vencord folder, build and inject:
   ```powershell
   pnpm build --dev
   pnpm inject
   ```

3. Enable the plugins in **Vencord Settings → Plugins**.

4. Restart Discord fully.

### Dependencies

| Plugin | Requires |
|---|---|
| BetterFormattingRedux | ChatInputButtonAPI (built into Vencord) |
| SavedTexts | ChatInputButtonAPI |
| ModToolDiscord | MessagePopoverAPI (built into Vencord) |
| FavoriteMedia + SavedTexts | Both plugins for the Texts tab in the picker |

---

## Publishing Changes

Every push to `master` automatically creates a **new GitHub Release** (patch bump). Release notes appear on the [Releases](https://github.com/Xaenny/VencordPlugins/releases) page only — nothing is committed back to the repo by a bot.

To skip a release, include `[skip release]` in your commit message.

For manual major/minor bumps, tag before pushing (e.g. `git tag v1.1.0 && git push origin v1.1.0`).

---

## Authors & Credits

| Plugin | Authors |
|---|---|
| **BetterFormattingRedux** | [Zerebos](https://github.com/zerebos) (original BD plugin), [Xaenny](https://github.com/Xaenny) (Vencord port) |
| **CustomLoadingLogo** | [Xaenny](https://github.com/Xaenny) |
| **FavoriteMedia** | [nin0dev](https://git.nin0.dev/nin0), [Davri](https://github.com/Davr1), [TetraSsky](https://github.com/TetraSsky) (upstream), [Xaenny](https://github.com/Xaenny) (customizations) |
| **SavedTexts** | [Xaenny](https://github.com/Xaenny) |
| **HideGiftButton** | [Xaenny](https://github.com/Xaenny) |
| **ModToolDiscord** | [Xaenny](https://github.com/Xaenny) |

---

## License

### Original plugins by [Xaenny](https://github.com/Xaenny)

**CustomLoadingLogo**, **SavedTexts**, **HideGiftButton**, and **ModToolDiscord** are licensed under the **MIT License (with Attribution Requirements)**. See each plugin's `LICENSE` file for the full text.

If you redistribute, republish, or share a modified version, you must:

- Credit **Xaenny** with a link to [https://github.com/Xaenny](https://github.com/Xaenny)
- Clearly state if you made changes
- Keep the license and copyright notice intact
- Not claim original authorship or misrepresent where the plugin came from

### Third-party plugins

**BetterFormattingRedux** is a port of [Zerebos](https://github.com/zerebos)' BetterDiscord plugin — see upstream license.

**FavoriteMedia** is based on community work by [nin0dev](https://git.nin0.dev/nin0), [Davri](https://github.com/Davr1), and [TetraSsky](https://github.com/TetraSsky) — respect their licenses when redistributing.
