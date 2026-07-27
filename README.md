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

### HideGiftButton

Removes the Nitro **gift button** from the chat input bar.

**What it does:**
- Hides the "Send a gift" / Nitro gift button next to the chat bar icons
- Toggle on/off in plugin settings
- Uses both CSS and runtime patches for reliable hiding across Discord updates

**Best for:** Keeping the chat bar clean if you never use the gift button.

---

## Installation

1. Clone this repo or copy the plugin folders into your Vencord `src/userplugins/` directory:
   ```
   Vencord/
   └── src/
       └── userplugins/
           ├── BetterFormattingRedux/
           ├── CustomLoadingLogo/
           ├── FavoriteMedia/
           ├── SavedTexts/
           └── HideGiftButton/
   ```

2. From your Vencord folder, build and inject:
   ```powershell
   pnpm build
   pnpm inject
   ```

3. Enable the plugins in **Vencord Settings → Plugins**.

4. Restart Discord fully.

### Dependencies

| Plugin | Requires |
|---|---|
| BetterFormattingRedux | ChatInputButtonAPI (built into Vencord) |
| SavedTexts | ChatInputButtonAPI |
| FavoriteMedia + SavedTexts | Both plugins for the Texts tab in the picker |

---

## Authors & Credits

| Plugin | Authors |
|---|---|
| **BetterFormattingRedux** | [Zerebos](https://github.com/zerebos) (original BD plugin), [Xaenny](https://github.com/Xaenny) (Vencord port) |
| **CustomLoadingLogo** | [Xaenny](https://github.com/Xaenny) |
| **FavoriteMedia** | [nin0dev](https://git.nin0.dev/nin0), [Davri](https://github.com/Davr1), [TetraSsky](https://github.com/TetraSsky) (upstream), [Xaenny](https://github.com/Xaenny) (customizations) |
| **SavedTexts** | [Xaenny](https://github.com/Xaenny) |
| **HideGiftButton** | [Xaenny](https://github.com/Xaenny) |

---

## License

Individual plugins may carry their own licenses (see each plugin folder). Upstream FavoriteMedia components are based on open-source community work — please respect original authors' licenses when redistributing.
