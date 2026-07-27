## Overview

First public release of a custom Vencord userplugin collection — five plugins covering chat formatting, media favourites, saved text snippets, a custom loading logo, and UI cleanup.

---

## New Plugins

### SavedTexts
- Save and reuse text snippets from Discord
- **Chat bar button** (document icon) opens the expression picker on a dedicated **Texts** tab
- **Texts tab** in the GIF/Media picker with masonry grid layout (same style as Image/Video tabs)
- Cards show **title + content preview** with thick borders and high-contrast text
- **Hover actions:** Edit and Delete on each card
- **Add** button and search bar in the Texts tab
- Right-click any message → **Save Text**
- **Preview character limit** setting (slider, 50–1500 chars, default 200)
- Large **TextArea** editor in the add/edit modal
- Integrated with **FavoriteMedia** for the Texts tab when both plugins are enabled

### CustomLoadingLogo
- Replace Discord's in-app loading logo with a custom image
- Configurable image URL in plugin settings (PNG/WebP recommended)
- Replaces the animated logo on "Connecting…" / "Did you know…" screens

### BetterFormattingRedux
- Vencord port of BetterDiscord's BetterFormattingRedux (original by Zerebos)
- **Aa** chat bar button opens a formatting toolbar above the main chat input
- Standard markdown plus extra transforms: superscript, smallcaps, fullwidth, upsidedown, varied caps, leet, and more
- Main chat only, portal overlay fix, right-aligned toolbar, extensive settings

### HideGiftButton
- Hides the Nitro **gift button** in the chat input bar
- Toggle in plugin settings

---

## Enhanced Plugins

### FavoriteMedia
*(Based on neatFavoriteAnything by nin0dev & Davri)*

- **Texts tab** added as first tab in the expression picker
- Renders **SavedTexts** panel when Texts tab is selected
- Chat bar media buttons off by default

---

## UI/UX Improvements (SavedTexts)

- Fixed blank popup — Texts tab now renders saved content
- Masonry grid layout matching Video/Image picker
- High-contrast text on card backgrounds
- 3px card borders with brand-color hover
- Edit and Delete buttons on hover
- Configurable preview character limit
- Large multi-line text editor in add/edit modal

---

## Authors & Credits

| Plugin | Authors |
|---|---|
| BetterFormattingRedux | Zerebos, **[Xaenny](https://github.com/Xaenny)** |
| CustomLoadingLogo | **[Xaenny](https://github.com/Xaenny)** |
| FavoriteMedia | nin0dev, Davri, **[Xaenny](https://github.com/Xaenny)** |
| SavedTexts | **[Xaenny](https://github.com/Xaenny)** |
| HideGiftButton | **[Xaenny](https://github.com/Xaenny)** |

---

## Installation

1. Copy plugin folders into `Vencord/src/userplugins/`
2. Run `pnpm build` and `pnpm inject`
3. Enable plugins in **Vencord Settings → Plugins**
4. Restart Discord

**Recommended:** Enable **FavoriteMedia** + **SavedTexts** together for the full Texts tab experience.

---

## Known Limitations

- **CustomLoadingLogo** does not change Discord's startup splash screen
- **SavedTexts** fallback patches apply only when FavoriteMedia is disabled
