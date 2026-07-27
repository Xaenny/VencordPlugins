/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Port of BetterFormattingRedux by Zerebos (BetterDiscord)
 * https://github.com/zerebos/BetterDiscordAddons/tree/master/Plugins/BetterFormattingRedux
 */

import "./styles.css";

import { ChatBarButton, ChatBarProps } from "@api/ChatButtons";
import { SettingsStore } from "@api/Settings";
import definePlugin, { IconComponent } from "@utils/types";
import { classes } from "@utils/misc";
import { findCssClassesLazy } from "@webpack";
import { ContextMenuApi, Menu, useEffect, useState } from "@webpack/common";
import { ReactNode } from "react";

import { getMainChatChannelRoot, isMainChannelChat } from "./chatScope";
import { FORMAT_ACTIONS } from "./formats";
import { formatMessage } from "./formatter";
import Languages from "./languages";
import { getFormatSettings, settings } from "./settings";
import { applyFormat } from "./slate";
import ToolbarData, { BUTTON_ORDER, ToolbarButtonKey } from "./toolbar";

const TextareaClasses = findCssClassesLazy("channelTextArea", "textArea");
const ButtonWrapperClasses = findCssClassesLazy("button", "buttonWrapper", "notificationDot");
const ChannelTextAreaClasses = findCssClassesLazy("buttonContainer", "channelTextArea", "button");

const AUTO_HIDE_MS = 5000;

class ToolbarManager {
    private observer: MutationObserver | null = null;
    private settingsListener: (() => void) | null = null;
    private isOpen = false;
    private editorRoots = new WeakMap<HTMLElement, HTMLDivElement>();
    private channelRoots = new WeakMap<HTMLElement, HTMLElement>();
    private suppressedOverlays = new Set<HTMLElement>();
    private portalHost: HTMLDivElement | null = null;
    private mainToolbar: HTMLElement | null = null;
    private toggleListeners = new Set<(open: boolean) => void>();
    private hideTimer: ReturnType<typeof setTimeout> | null = null;
    private boundReposition = () => this.repositionPortals();

    start() {
        this.setupToolbar();
        this.settingsListener = () => {
            this.refresh();
            this.applyAllStyles();
        };
        SettingsStore.addChangeListener("plugins.BetterFormattingRedux", this.settingsListener);

        this.observer = new MutationObserver(records => {
            for (const record of records) {
                for (const node of record.addedNodes) {
                    if (!(node instanceof Element)) continue;
                    const textAreaClass = TextareaClasses?.textArea ?? "textArea";
                    const textArea = node.matches?.(`[class*="${textAreaClass}"]`)
                        ? node
                        : node.querySelector?.(`[class*="${textAreaClass}"]`);
                    if (textArea?.firstElementChild instanceof HTMLDivElement && isMainChannelChat(textArea)) {
                        this.addToolbar(textArea.firstElementChild);
                    }
                }
            }
        });
        this.observer.observe(document.body, { childList: true, subtree: true });
    }

    stop() {
        if (this.settingsListener) {
            SettingsStore.removeChangeListener("plugins.BetterFormattingRedux", this.settingsListener);
            this.settingsListener = null;
        }
        this.observer?.disconnect();
        this.observer = null;
        this.cancelAutoHide();
        this.teardownPortals();
        document.querySelectorAll(".bf-toolbar").forEach(el => el.remove());
        this.mainToolbar = null;
        this.isOpen = false;
        this.notifyToggleListeners();
    }

    onToggleChange(listener: (open: boolean) => void) {
        this.toggleListeners.add(listener);
        return () => this.toggleListeners.delete(listener);
    }

    isToolbarOpen() {
        return this.isOpen;
    }

    toggleMainChat() {
        if (!this.getMainToolbar()) {
            this.setupToolbar();
        }

        const toolbar = this.getMainToolbar();
        if (!toolbar) return;

        this.isOpen = !this.isOpen;
        this.setToolbarOpen(toolbar, this.isOpen);
        this.notifyToggleListeners();

        if (this.isOpen && settings.store.hoverOpen === "chatButton") {
            this.scheduleAutoHide();
        } else {
            this.cancelAutoHide();
        }
    }

    private getMainToolbar(): HTMLElement | null {
        if (this.mainToolbar?.isConnected) return this.mainToolbar;
        const root = getMainChatChannelRoot();
        this.mainToolbar = root?.querySelector(".bf-toolbar") as HTMLElement | null ?? null;
        return this.mainToolbar;
    }

    private setToolbarOpen(toolbar: HTMLElement, open: boolean) {
        const channelRoot = this.channelRoots.get(toolbar) ?? getMainChatChannelRoot();
        toolbar.classList.toggle("bf-visible", open);
        this.syncToolbarLayer(toolbar, open);

        if (channelRoot) {
            channelRoot.classList.toggle("bf-toolbar-open", open);
            channelRoot.classList.toggle("bf-has-toolbar", true);
        }

        document.querySelectorAll(".bf-has-toolbar").forEach(el => {
            if (el !== channelRoot) {
                el.classList.remove("bf-toolbar-open", "bf-has-toolbar");
                el.querySelector(".bf-toolbar")?.remove();
            }
        });
    }

    private scheduleAutoHide() {
        if (settings.store.hoverOpen !== "chatButton") return;
        this.cancelAutoHide();
        this.hideTimer = setTimeout(() => this.closeToolbar(), AUTO_HIDE_MS);
    }

    private cancelAutoHide() {
        if (this.hideTimer) {
            clearTimeout(this.hideTimer);
            this.hideTimer = null;
        }
    }

    private bindAutoHide(toolbarElement: HTMLElement) {
        toolbarElement.addEventListener("mouseenter", () => this.cancelAutoHide());
        toolbarElement.addEventListener("mouseleave", () => {
            if (this.isOpen) this.scheduleAutoHide();
        });
        toolbarElement.addEventListener("mousedown", () => this.cancelAutoHide());
    }

    private ensurePortalHost() {
        if (this.portalHost) return;
        this.portalHost = document.createElement("div");
        this.portalHost.className = "bf-toolbar-portal";
        document.body.appendChild(this.portalHost);
    }

    private syncToolbarLayer(toolbar: HTMLElement, open: boolean) {
        const channelRoot = this.channelRoots.get(toolbar);
        if (!channelRoot) return;

        if (open && settings.store.hoverOpen === "chatButton") {
            this.ensurePortalHost();
            this.portalHost!.appendChild(toolbar);
            toolbar.classList.add("bf-portal");
            this.suppressChannelOverlays(channelRoot, true);
            this.repositionPortal(toolbar, channelRoot);
            window.addEventListener("scroll", this.boundReposition, true);
            window.addEventListener("resize", this.boundReposition);
        } else {
            this.unmountPortal(toolbar, channelRoot);
        }
    }

    private repositionPortals() {
        document.querySelectorAll<HTMLElement>(".bf-toolbar.bf-portal.bf-visible").forEach(toolbar => {
            const channelRoot = this.channelRoots.get(toolbar);
            if (channelRoot) this.repositionPortal(toolbar, channelRoot);
        });
    }

    private repositionPortal(toolbar: HTMLElement, channelRoot: HTMLElement) {
        const rect = channelRoot.getBoundingClientRect();
        const maxWidth = Math.max(200, rect.width - 16);
        const fromLeft = settings.store.rightSide === "left";

        toolbar.style.position = "fixed";
        toolbar.style.zIndex = "999999";
        toolbar.style.bottom = "auto";
        toolbar.style.maxWidth = `${maxWidth}px`;
        toolbar.style.transform = "none";

        requestAnimationFrame(() => {
            const height = toolbar.offsetHeight || 34;
            toolbar.style.top = `${Math.max(8, rect.top - height - 6)}px`;

            if (fromLeft) {
                toolbar.style.left = `${rect.left + 8}px`;
                toolbar.style.right = "auto";
            } else {
                toolbar.style.right = `${window.innerWidth - rect.right + 8}px`;
                toolbar.style.left = "auto";
            }
        });
    }

    private unmountPortal(toolbar: HTMLElement, channelRoot: HTMLElement) {
        toolbar.classList.remove("bf-portal");
        for (const prop of ["position", "top", "left", "right", "bottom", "max-width", "z-index", "transform"] as const) {
            toolbar.style.removeProperty(prop);
        }

        if (toolbar.parentElement !== channelRoot) {
            channelRoot.appendChild(toolbar);
        }

        this.suppressChannelOverlays(channelRoot, false);

        if (!document.querySelector(".bf-toolbar.bf-portal")) {
            window.removeEventListener("scroll", this.boundReposition, true);
            window.removeEventListener("resize", this.boundReposition);
        }
    }

    private teardownPortals() {
        document.querySelectorAll<HTMLElement>(".bf-toolbar.bf-portal").forEach(toolbar => {
            const channelRoot = this.channelRoots.get(toolbar);
            if (channelRoot) this.unmountPortal(toolbar, channelRoot);
        });
        this.portalHost?.remove();
        this.portalHost = null;
        window.removeEventListener("scroll", this.boundReposition, true);
        window.removeEventListener("resize", this.boundReposition);
        for (const el of this.suppressedOverlays) {
            el.style.removeProperty("visibility");
            el.style.removeProperty("pointer-events");
        }
        this.suppressedOverlays.clear();
    }

    private suppressChannelOverlays(channelRoot: HTMLElement, suppress: boolean) {
        const roots = [channelRoot, channelRoot.parentElement].filter(Boolean) as HTMLElement[];

        for (const root of roots) {
            for (const child of root.querySelectorAll<HTMLElement>("*:not(.bf-toolbar)")) {
                if (child.closest(".bf-toolbar")) continue;

                const text = child.innerText?.trim() ?? "";
                const label = child.getAttribute("aria-label") ?? "";
                if (!/slowmode/i.test(text) && !/slowmode/i.test(label)) continue;
                if (text.length > 80) continue;

                if (suppress) {
                    child.style.setProperty("visibility", "hidden", "important");
                    child.style.setProperty("pointer-events", "none", "important");
                    this.suppressedOverlays.add(child);
                } else if (this.suppressedOverlays.has(child)) {
                    child.style.removeProperty("visibility");
                    child.style.removeProperty("pointer-events");
                    this.suppressedOverlays.delete(child);
                }
            }
        }
    }

    private notifyToggleListeners() {
        for (const listener of this.toggleListeners) listener(this.isOpen);
    }

    refresh() {
        const wasOpen = this.isOpen;
        this.setupToolbar();
        const toolbar = this.getMainToolbar();
        if (wasOpen && toolbar) {
            this.setToolbarOpen(toolbar, true);
        }
    }

    private setupToolbar() {
        this.teardownPortals();
        this.mainToolbar = null;

        // Remove stray toolbars from profile / secondary inputs.
        document.querySelectorAll(".bf-toolbar").forEach(el => el.remove());
        document.querySelectorAll(".bf-has-toolbar").forEach(el => {
            el.classList.remove("bf-has-toolbar", "bf-toolbar-open");
        });

        const channelRoot = getMainChatChannelRoot();
        if (!channelRoot) return;

        const textAreaClass = TextareaClasses?.textArea ?? "textArea";
        const textAreaWrapper = channelRoot.querySelector(`[class*="${textAreaClass}"]`);
        if (textAreaWrapper?.firstElementChild instanceof HTMLDivElement) {
            this.addToolbar(textAreaWrapper.firstElementChild);
        }
    }

    private buildToolbar(): HTMLDivElement {
        const toolbar = document.createElement("div");
        toolbar.className = "bf-toolbar";
        const openMode = settings.store.hoverOpen;

        if (openMode === "click") {
            toolbar.innerHTML = '<div class="bf-arrow" title="Formatting">Aa</div>';
        }

        const s = settings.store;

        for (const buttonId of BUTTON_ORDER) {
            const key = buttonId.replace("Button", "") as ToolbarButtonKey;
            const def = ToolbarData[key];
            if (!def) continue;

            const button = document.createElement("div");
            button.className = `format ${def.type}`;
            button.title = def.name;
            if (!s[buttonId as keyof typeof s]) button.classList.add("disabled");
            button.dataset.name = key;

            if (s.useIcons === "icons") button.innerHTML = def.icon;
            else button.textContent = def.displayName;

            button.addEventListener("mousedown", e => {
                e.preventDefault();
                e.stopPropagation();
                this.cancelAutoHide();
            });

            button.addEventListener("mouseup", e => {
                if (button.classList.contains("disabled")) return;
                e.preventDefault();
                e.stopPropagation();
                const toolbarEl = button.closest(".bf-toolbar") as HTMLDivElement | null;
                if (!toolbarEl || !button.dataset.name) return;
                this.runFormatAction(button, toolbarEl);
            });

            if (key === "codeblock") {
                button.addEventListener("contextmenu", e => {
                    e.preventDefault();
                    e.stopPropagation();
                    const toolbarEl = (e.currentTarget as HTMLElement).closest(".bf-toolbar") as HTMLDivElement | null;
                    const editorRoot = toolbarEl ? this.editorRoots.get(toolbarEl) : undefined;
                    if (editorRoot) this.openLanguageMenu(e, editorRoot);
                });
            }

            toolbar.insertBefore(button, toolbar.firstChild);
        }

        if (s.useIcons === "text") {
            toolbar.addEventListener("mousemove", e => {
                const target = e.currentTarget as HTMLDivElement;
                const rect = target.parentElement?.getBoundingClientRect();
                if (!rect) return;
                const pos = e.pageX - rect.left;
                const width = parseInt(getComputedStyle(target).width);
                let diff = -width;
                Array.from(target.children).forEach(elem => {
                    diff += (elem as HTMLElement).offsetWidth;
                });
                target.scrollLeft = pos / width * diff;
            });
        }

        return toolbar;
    }

    private runFormatAction(button: HTMLDivElement, toolbarEl: HTMLDivElement) {
        if (!button.classList.contains("format") || !button.dataset.name) return;

        const s = settings.store;
        const editorRoot = this.editorRoots.get(toolbarEl);
        const key = button.dataset.name;
        const markdownAction = FORMAT_ACTIONS[key];
        if (markdownAction) {
            applyFormat(markdownAction, undefined, editorRoot);
            return;
        }

        if (button.classList.contains("bfr-format")) {
            const wrapper = s[`${key}Wrapper` as keyof typeof s] as string;
            applyFormat({ type: "bfr", settingKey: key }, wrapper, editorRoot);
        }
    }

    private openLanguageMenu(e: MouseEvent, editorRoot: HTMLDivElement) {
        ContextMenuApi.openContextMenu(e, () => (
            <Menu.Menu navId="bf-redux-languages" label="Codeblock Language">
                {Object.entries(Languages).map(([letter, langs]) => (
                    <Menu.MenuGroup key={letter} label={letter}>
                        {Object.entries(langs).map(([id, label]) => (
                            <Menu.MenuItem
                                key={id}
                                id={`bf-lang-${id}`}
                                label={label}
                                action={() => applyFormat({ type: "wrap", left: "```" + id, right: "```" }, undefined, editorRoot)}
                            />
                        ))}
                    </Menu.MenuGroup>
                ))}
            </Menu.Menu>
        ));
    }

    private addToolbar(textarea: HTMLDivElement) {
        const channelTextAreaClass = TextareaClasses?.channelTextArea ?? "channelTextArea";
        const channelRoot = textarea.closest(`[class*="${channelTextAreaClass}"]`) as HTMLElement | null;
        if (!channelRoot || channelRoot.querySelector(".bf-toolbar")) return;

        const toolbarElement = this.buildToolbar();
        const s = settings.store;
        const openMode = s.hoverOpen;

        if (openMode === "hover") toolbarElement.classList.add("bf-hover");
        if (openMode === "chatButton") toolbarElement.classList.add("bf-chat-mode");
        if (this.isOpen) toolbarElement.classList.add("bf-visible");

        channelRoot.classList.add("bf-has-toolbar");
        channelRoot.appendChild(toolbarElement);
        this.editorRoots.set(toolbarElement, textarea);
        this.channelRoots.set(toolbarElement, channelRoot);
        this.mainToolbar = toolbarElement;

        if (this.isOpen && openMode === "chatButton") {
            this.syncToolbarLayer(toolbarElement, true);
        }

        if (openMode === "click") {
            toolbarElement.addEventListener("mouseleave", () => {
                if (this.isOpen) this.closeToolbar();
            });
        }

        if (openMode === "chatButton") {
            this.bindAutoHide(toolbarElement);
        }

        toolbarElement.addEventListener("mousedown", e => {
            e.stopPropagation();
            this.cancelAutoHide();
        });

        toolbarElement.addEventListener("click", e => {
            e.preventDefault();
            e.stopPropagation();
            const button = (e.target as HTMLElement).closest(".bf-arrow") as HTMLDivElement | null;
            if (!button) return;

            if (openMode === "click") this.toggleOpen(toolbarElement);
        });

        this.applyStyle(toolbarElement);
    }

    private toggleOpen(toolbar: HTMLElement) {
        this.isOpen = !this.isOpen;
        toolbar.classList.toggle("bf-visible", this.isOpen);
        this.notifyToggleListeners();
    }

    private applyStyle(toolbar?: HTMLElement | null) {
        const el = toolbar ?? document.querySelector<HTMLElement>(".bf-toolbar");
        if (!el) return;

        const s = settings.store;
        el.style.opacity = String(s.toolbarOpacity);
        el.style.fontSize = `${s.fontSize}%`;
        el.classList.toggle("bf-left", s.rightSide === "left");
    }

    applyAllStyles() {
        const toolbar = this.getMainToolbar();
        if (toolbar) this.applyStyle(toolbar);
    }

    closeToolbar() {
        this.cancelAutoHide();
        this.isOpen = false;
        const toolbar = this.getMainToolbar();
        if (toolbar) {
            toolbar.classList.remove("bf-visible");
            this.syncToolbarLayer(toolbar, false);
        }
        getMainChatChannelRoot()?.classList.remove("bf-toolbar-open");
        this.notifyToggleListeners();
    }

    ensureMainToolbar() {
        if (!this.getMainToolbar() && getMainChatChannelRoot()) {
            this.setupToolbar();
        }
    }
}

const toolbarManager = new ToolbarManager();

const FormattingIcon: IconComponent = ({ className }) => (
    <span className={classes(className, "bf-chatbar-icon")}>Aa</span>
);

function FormattingToolbarButton() {
    const [open, setOpen] = useState(toolbarManager.isToolbarOpen());

    useEffect(() => toolbarManager.onToggleChange(setOpen), []);

    return (
        <ChatBarButton
            tooltip={open ? "Hide formatting toolbar" : "Show formatting toolbar"}
            onClick={() => toolbarManager.toggleMainChat()}
            buttonProps={{
                className: classes(
                    ButtonWrapperClasses?.button,
                    ChannelTextAreaClasses?.button,
                    open && "bf-chatbar-btn-active"
                )
            }}
        >
            <FormattingIcon />
        </ChatBarButton>
    );
}

function isChatBarTarget(props: ChatBarProps) {
    return ["normal", "sidebar"].includes(props?.type?.analyticsName ?? "");
}

export default definePlugin({
    name: "BetterFormattingRedux",
    description: "Format messages with a toolbar above the chat box. Adds superscript, smallcaps, fullwidth, and more.",
    authors: [{ name: "Zerebos", id: 249746236008169473n }, { name: "Xaenny", id: 0n }],
    dependencies: ["ChatInputButtonAPI"],
    settings,

    patches: [
        {
            find: '"sticker")',
            replacement: {
                match: /Vencord\.Api\.ChatButtons\._injectButtons\((\i),arguments\[0\]\)/,
                replace: "($self.injectFormattingButton($1,arguments[0]),Vencord.Api.ChatButtons._injectButtons($1,arguments[0]))"
            }
        }
    ],

    injectFormattingButton(buttons: ReactNode[], props: ChatBarProps) {
        if (props?.disabled || !isChatBarTarget(props)) return;

        let insertIdx = buttons.length;
        for (let i = 0; i < buttons.length; i++) {
            const el = buttons[i] as { key?: string; props?: { viewType?: string; type?: string; }; } | null;
            if (!el) continue;

            if (
                el.key === "gif" ||
                el.props?.viewType === "gif" ||
                el.props?.type === "gif"
            ) {
                insertIdx = i;
                break;
            }
        }

        buttons.splice(insertIdx, 0, <FormattingToolbarButton key="bf-format-btn" />);
        toolbarManager.ensureMainToolbar();
    },

    start() {
        if (settings.store.hoverOpen === "hover") {
            settings.store.hoverOpen = "chatButton";
        }
        toolbarManager.closeToolbar();
        toolbarManager.start();
    },

    stop() {
        toolbarManager.stop();
    },

    onBeforeMessageSend(_channelId, msg) {
        msg.content = formatMessage(msg.content, getFormatSettings());
        if (settings.store.closeOnSend) toolbarManager.closeToolbar();
    }
});
