/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 nin0
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatBarProps } from "@api/ChatButtons";
import ErrorBoundary from "@components/ErrorBoundary";
import { FolderIcon, ImageIcon } from "@components/Icons";
import { Devs } from "@utils/constants";
import { getIntlMessage, insertTextIntoChatInputBox } from "@utils/discord";
import definePlugin from "@utils/types";
import { findCssClassesLazy, proxyLazyWebpack } from "@webpack";
import { ExpressionPickerStore, React } from "@webpack/common";
import { ComponentType, ReactNode } from "react";

import { FilePicker, ImagePicker, lookupSelfCheck, MediaAccessory, VideoPicker } from "./components";
import { TextPicker } from "../SavedTexts/TextPicker";
import { settings } from "./settings";
import { SignedUrlsStore } from "./stores";
import managedStyle from "./style.css?managed";
import { EmbedComponent, ExpressionPickerTabProps, ExpressionPickerView, FavouriteItem, FavouriteItemFormat, FullEmbed } from "./types";
import { getThumbnailUrl, isMediaItem, logger } from "./utils";

export const EmbedContext = proxyLazyWebpack(() => React.createContext<null | FullEmbed>(null));
export const EmbedMosaicContext = proxyLazyWebpack(() => React.createContext<null | number>(null));

// Bumped whenever this plugin changes, so the console says which build is actually loaded
const REVISION = "2026-09-10 media-accessory";

const ButtonWrapperClasses = findCssClassesLazy("button", "buttonWrapper", "notificationDot");
const ChannelTextAreaClasses = findCssClassesLazy("buttonContainer", "channelTextArea", "button");

const PickerButton = ErrorBoundary.wrap(function PickerButton({ onClick, children }: { onClick: () => void; children: ReactNode; }) {
    return (
        <div className={`expression-picker-chat-input-button ${ChannelTextAreaClasses?.buttonContainer ?? ""}`}>
            <div
                role="button"
                tabIndex={0}
                className={`${ButtonWrapperClasses?.button ?? ""} ${ChannelTextAreaClasses?.button ?? ""}`}
                onClick={onClick}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") onClick(); }}
            >
                <div className={ButtonWrapperClasses?.buttonWrapper ?? ""}>
                    {children}
                </div>
            </div>
        </div>
    );
}, { noop: true });

function VideoIcon({ height = 20, width = 20, className }: { height?: number; width?: number; className?: string; }) {
    return (
        <svg width={width} height={height} className={className} viewBox="0 0 24 24">
            <path fill="currentColor" d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8 12.5v-9l6 4.5-6 4.5z" />
        </svg>
    );
}

export default definePlugin({
    name: "FavoriteMedia",
    description: "Save images, videos, and files as favourites in the GIF/Media picker — like BetterDiscord FavoriteMedia",
    authors: [Devs.nin0dev, { name: "Davri", id: 457579346282938368n }, { name: "Xaenny", id: 0n }],
    managedStyle,
    settings,
    patches: [
        // CHATBAR BUTTONS
        {
            find: '"sticker")',
            replacement: {
                // Hook into "_injectButtons" (already patched by ChatInputButtonAPI)
                // ChatInputButtonAPI emits: _injectButtons(array, arguments[0])
                // Splice BEFORE the unshift so we work on Discord's original array
                match: /Vencord\.Api\.ChatButtons\._injectButtons\((\i),arguments\[0\]\)/,
                replace: "($self.injectMediaButtons($1,arguments[0]),Vencord.Api.ChatButtons._injectButtons($1,arguments[0]))"
            }
        },
        // EMBEDS
        {
            find: "this.renderInlineMediaEmbed",
            replacement: [
                {
                    // Wrap the embed component's render method in a custom context to avoid having to drill props.
                    // Anchored on the method definition (a "{" follows, and no "." precedes) so it can't
                    // land on an unrelated .render() call site
                    match: /(?<!\.)render\(\)\{/,
                    replace: "render(){return $self.renderEmbed.call(this)}__render(){"
                },
                {
                    // Specify the index for individual items in embed.images
                    match: /\.images\.map\((\i)=>(this.renderImage\(\{[^}]{50,100}\}\))\)/,
                    replace: ".images.map(($1,index)=>$self.renderEmbedMosaicItem($2,index))"
                }
            ]
        },
        {
            // Default the renderAdjacentContent prop of every media component (image, video, file card)
            // to our accessory. The default expression is evaluated inside the component, so it can
            // close over the props object and hand it to the accessory - uploaded attachments render
            // through these same components but have no embed context, and their props are the only
            // place the url and dimensions live.
            find: /mosaicStyleAlt:[A-Za-z_$][\w$]*,mediaLayoutType:/,
            replacement: {
                // The image component of this module is skipped (it is matched by
                // imageContainerClassName): images are handled at the base Image layer instead, which
                // also covers attachments. Patching both would render the star twice on embeds.
                match: /(?:let|const|var)\{((?:(?!imageContainerClassName)[^{}])*)renderAdjacentContent:(\i)((?:(?!imageContainerClassName)[^{}])*)\}=(\i)/g,
                replace: "let{$1renderAdjacentContent:$2=(()=>$self.renderMediaAccessory($4))$3}=$4"
            }
        },
        {
            // Every image - embed, attachment or component - is ultimately rendered by this one
            // component, which has a dedicated accessory slot that Discord only fills for animated
            // images. Fall back to our star when nothing else claims the slot.
            find: /"imageWrapper",/,
            replacement: {
                match: /\.\.\.(\i)\}=(\i),([\s\S]{0,1500}?)return (\i)=\4\?\?(\i),/,
                replace: "...$1}=$2,$3return $4=$4??$5??$self.renderMediaAccessory($2,\"slot\"),"
            }
        },
        {
            // The file card lives in its own module, so it needs the same default separately.
            // Its props (url, fileName, fileSize) are what the Files tab stores.
            find: /url:[A-Za-z_$][\w$]*,fileName:[A-Za-z_$][\w$]*,fileSize:[A-Za-z_$][\w$]*,onClick:[A-Za-z_$][\w$]*,onContextMenu:[A-Za-z_$][\w$]*,renderAdjacentContent:/,
            replacement: {
                match: /(?:let|const|var)\{([^{}]*)renderAdjacentContent:(\i)([^{}]*)\}=(\i)/,
                replace: "let{$1renderAdjacentContent:$2=(()=>$self.renderMediaAccessory($4))$3}=$4"
            }
        },
        // EXPRESSION PICKER
        {
            find: /"aria-selected":[A-Za-z_$][\w$]*===[A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*\.GIF,isActive:/,
            replacement: [
                {
                    match: /(\i)=(\i)\?\(0,\i\.jsx\)\((\i),\{id:\i\.\i,"aria-controls":\i\.\i,"aria-selected":(\i)===\i\.\i\.GIF,isActive:\4===\i\.\i\.GIF,viewType:\i\.\i\.GIF,children:\i\.intl\.string\(\i\.t(?:\.\i|\[".+?"\])\)\}\):null/,
                    replace: "$1=$self.renderTabs($3,$4)"
                },
                {
                    // Anchored on the GIF branch because it carries both the active view and the
                    // onSelectGIF callback our Files tab needs - the STICKER branch's second operand
                    // is just a boolean gate
                    match: /(\i)===\i\.\i\.GIF&&\i\?\(0,\i\.jsx\)\((?:\i\.)?\i,\{onSelectGIF:(\i),/,
                    replace: "$self.renderFilePicker($1,$2),$&"
                }
            ]
        },
        {
            // Hide favourite files from the GIFs/Media tab
            find: '.sortBy("order").reverse().value()',
            replacement: {
                match: '.sortBy("order").reverse()',
                replace: "$&.filter($self.filterGifs)"
            }
        },
        // FAVOURITE BUTTON
        {
            find: /\.track\([A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*\.GIF_FAVORITED,\{total_num_favorited:/,
            replacement: {
                match: /function (\i)\((\i)\)\{(\i\.\i)\.updateAsync\("favoriteGifs",/,
                replace: "async function $1($2){$2=await $self.interceptAddToFavourites({...$2,url:$2.url});if(null==$2)return;$3.updateAsync(\"favoriteGifs\","
            }
        }
    ],
    start() {
        // Discord renames its minified internals on every client update. Log what this build could
        // still find, so a stale lookup shows up here instead of as a mystery crash.
        logger.info(`Starting revision ${REVISION}`);

        const found = lookupSelfCheck();
        const missing = Object.entries(found).filter(([, ok]) => !ok).map(([name]) => name);

        if (missing.length) logger.warn("Could not find in this Discord build:", missing.join(", "), "- those parts will be hidden");
        else logger.info("All Discord component lookups resolved");
    },
    renderTabs(Tab: ComponentType<ExpressionPickerTabProps>, activeView: ExpressionPickerView) {
        return (
            <>
                <Tab
                    id="texts-picker-tab"
                    key="texts-picker-tab"
                    aria-controls="texts-picker-tab-panel"
                    aria-selected={activeView === ExpressionPickerView.TEXTS}
                    isActive={activeView === ExpressionPickerView.TEXTS}
                    viewType={ExpressionPickerView.TEXTS}
                >
                    Texts
                </Tab>
                <Tab
                    id="gif-picker-tab"
                    key="gif-picker-tab"
                    aria-controls="gif-picker-tab-panel"
                    aria-selected={activeView === ExpressionPickerView.GIF}
                    isActive={activeView === ExpressionPickerView.GIF}
                    viewType={ExpressionPickerView.GIF}
                >
                    Media
                </Tab>
                <Tab
                    id="image-picker-tab"
                    key="image-picker-tab"
                    aria-controls="image-picker-tab-panel"
                    aria-selected={activeView === ExpressionPickerView.IMAGE}
                    isActive={activeView === ExpressionPickerView.IMAGE}
                    viewType={ExpressionPickerView.IMAGE}
                >
                    Image
                </Tab>
                <Tab
                    id="video-picker-tab"
                    key="video-picker-tab"
                    aria-controls="video-picker-tab-panel"
                    aria-selected={activeView === ExpressionPickerView.VIDEO}
                    isActive={activeView === ExpressionPickerView.VIDEO}
                    viewType={ExpressionPickerView.VIDEO}
                >
                    Video
                </Tab>
                <Tab
                    id="files-picker-tab"
                    key="files-picker-tab"
                    aria-controls="files-picker-tab-panel"
                    aria-selected={activeView === ExpressionPickerView.FILES}
                    isActive={activeView === ExpressionPickerView.FILES}
                    viewType={ExpressionPickerView.FILES}
                >
                    {getIntlMessage("FILES")}
                </Tab>
            </>
        );
    },
    renderFilePicker(activeView: ExpressionPickerView, onSelectGIF: (item: { url: string; }) => void) {
        if (activeView === ExpressionPickerView.TEXTS) {
            return (
                <TextPicker
                    onSelectItem={text => {
                        insertTextIntoChatInputBox(text + " ");
                        ExpressionPickerStore.closeExpressionPicker();
                    }}
                />
            );
        }

        if (activeView === ExpressionPickerView.IMAGE) {
            return <ImagePicker onSelectItem={item => this.handleSelectImage(item)} />;
        }

        if (activeView === ExpressionPickerView.VIDEO) {
            return <VideoPicker onSelectItem={item => this.handleSelectImage(item)} />;
        }

        if (activeView === ExpressionPickerView.FILES) {
            return <FilePicker onSelectItem={onSelectGIF} />;
        }

        return null;
    },
    handleSelectImage(item: { url: string; }) {
        const url = SignedUrlsStore.get(item.url) ?? item.url;
        insertTextIntoChatInputBox(url + " ");
        ExpressionPickerStore.closeExpressionPicker();
    },
    // These run inside Discord's own message render. Anything that throws here takes the whole
    // client down with it, so always fall back to rendering Discord's original output untouched.
    renderEmbed(this: EmbedComponent) {
        // Only possible if the render patch above went stale - a blank embed still beats a dead client
        if (typeof this.__render !== "function") {
            logger.error("The embed render patch didn't apply cleanly");
            return null;
        }

        const rendered = this.__render();

        try {
            return <EmbedContext.Provider value={this.props.embed}>{rendered}</EmbedContext.Provider>;
        } catch (err) {
            logger.error("Failed to provide the embed context", err);
            return rendered;
        }
    },
    renderEmbedMosaicItem(children: ReactNode, index: number) {
        try {
            return <EmbedMosaicContext.Provider value={index}>{children}</EmbedMosaicContext.Provider>;
        } catch (err) {
            logger.error("Failed to provide the embed mosaic context", err);
            return children;
        }
    },
    renderMediaAccessory(media: unknown, variant?: "slot") {
        return <MediaAccessory media={media as Parameters<typeof MediaAccessory>[0]["media"]} variant={variant} />;
    },
    filterGifs: (item: FavouriteItem & { url?: string; }) => {
        return isMediaItem(item);
    },
    interceptAddToFavourites: async (item: FavouriteItem & { url: string; }) => {
        if (item.format !== FavouriteItemFormat.NONE) return item;

        SignedUrlsStore.addSigned(item.url);

        if (URL.canParse(item.src)) {
            SignedUrlsStore.addSigned(item.src);
            return item;
        }

        const thumbnail = await getThumbnailUrl(item.src, item.width, item.height);
        if (!thumbnail) return item;

        thumbnail.search = "";
        thumbnail.hash = item.src;
        return { ...item, src: `${thumbnail}` };
    },
    openCustomExpressionPicker(view: ExpressionPickerView, activeViewType: any, channelId: string) {
        ExpressionPickerStore.setSearchQuery("");
        (ExpressionPickerStore as any).openExpressionPicker(view, activeViewType, channelId);
    },
    injectMediaButtons(buttons: ReactNode[], props: ChatBarProps) {
        try {
            this.injectMediaButtonsInner(buttons, props);
        } catch (err) {
            logger.error("Failed to inject the media picker buttons", err);
        }
    },
    injectMediaButtonsInner(buttons: ReactNode[], props: ChatBarProps) {
        if (props?.disabled) return;

        const { showImageButton, showVideoButton, showFilesButton } = settings.store;
        if (!showImageButton && !showVideoButton && !showFilesButton) return;

        let insertIdx = buttons.length;
        let gifIdx = -1;
        let stickerIdx = -1;

        for (let i = 0; i < buttons.length; i++) {
            const el = buttons[i] as any;
            if (!el) continue;

            const isSticker =
                el.key === "sticker" ||
                el.props?.viewType === "sticker" ||
                el.props?.type === "sticker";

            const isGif =
                el.key === "gif" ||
                el.props?.viewType === "gif" ||
                el.props?.type === "gif";

            if (isSticker) stickerIdx = i;
            if (isGif) gifIdx = i;
        }

        if (gifIdx !== -1) insertIdx = gifIdx + 1;
        else if (stickerIdx !== -1) insertIdx = stickerIdx;

        const channelId = props?.channel?.id ?? "";
        const toInsert: ReactNode[] = [];

        if (showImageButton) {
            toInsert.push(
                <PickerButton key="fav-image-btn" onClick={() => this.openCustomExpressionPicker(ExpressionPickerView.IMAGE, props?.type, channelId)}>
                    <ImageIcon width={20} height={20} />
                </PickerButton>
            );
        }

        if (showVideoButton) {
            toInsert.push(
                <PickerButton key="fav-video-btn" onClick={() => this.openCustomExpressionPicker(ExpressionPickerView.VIDEO, props?.type, channelId)}>
                    <VideoIcon width={20} height={20} />
                </PickerButton>
            );
        }

        if (showFilesButton) {
            toInsert.push(
                <PickerButton key="fav-files-btn" onClick={() => this.openCustomExpressionPicker(ExpressionPickerView.FILES, props?.type, channelId)}>
                    <FolderIcon width={20} height={20} />
                </PickerButton>
            );
        }

        buttons.splice(insertIdx, 0, ...toInsert);
    }
});
