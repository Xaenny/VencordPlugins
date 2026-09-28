/*
 * Vencord userplugins by Xaenny (https://github.com/Xaenny)
 * Copyright (c) 2026 Xaenny
 * SPDX-License-Identifier: MIT
 *
 * Shared, byte-identical between plugin folders - Vencord copies each folder into src\userplugins
 * on its own, so there is nowhere above them to put it. Edit one, copy it to the others.
 */

import { Logger } from "@utils/Logger";
import { RenderModalProps } from "@vencord/discord-types";
import { filters, mapMangledModule } from "@webpack";
import { Button } from "@webpack/common";
import { ComponentType, ReactNode } from "react";

// Discord re-minifies its bundles on every client update, so any webpack lookup can go stale - and
// that includes the ones inside Vencord itself. `Modal` from @webpack/common was
// findExportedComponentLazy("Modal"); Discord stopped exporting that name, the miss *throws* on a dev
// build, and a throw inside a React render takes the whole client down rather than just the modal.
// Upstream re-anchored their lookup on 2026-09-26, but a modal that only opens on an up-to-date
// Vencord checkout is a modal that breaks the next time either project moves.
//
// So the chrome is resolved here instead: lazily, once, never throwing, with plain elements we style
// ourselves as the fallback. The modal opens either way.

const logger = new Logger("SafeModal");

interface ModalChrome {
    ModalRoot: ComponentType<any>;
    ModalHeader: ComponentType<any>;
    ModalContent: ComponentType<any>;
    ModalFooter: ComponentType<any>;
    ModalCloseButton?: ComponentType<any>;
}

let chrome: ModalChrome | null | undefined;

function getChrome(): ModalChrome | null {
    if (chrome !== undefined) return chrome;

    try {
        // The same module and filters Vencord's legacy modal helpers use. mapMangledModule returns an
        // empty object rather than throwing when nothing matches, so a miss is ours to notice.
        // All five mappers have to stay, even though only four are used: each export is claimed by the
        // first mapper that matches it, so dropping one lets its component be mis-assigned.
        const mapped = mapMangledModule(".MODAL_ROOT_LEGACY,", {
            ModalRoot: filters.componentByCode('.MODAL,"aria-labelledby":'),
            ModalHeader: filters.componentByCode(",id:"),
            ModalContent: filters.componentByCode("scrollbarType:"),
            ModalFooter: filters.componentByCode(".HORIZONTAL_REVERSE,"),
            ModalCloseButton: filters.componentByCode(".withCircleBackground")
        });

        chrome = mapped.ModalRoot && mapped.ModalHeader && mapped.ModalContent && mapped.ModalFooter
            ? mapped as ModalChrome
            : null;
    } catch (err) {
        logger.error("Modal chrome lookup threw", err);
        chrome = null;
    }

    if (!chrome) logger.warn("Couldn't find Discord's modal components in this build - using the plain panel");

    return chrome;
}

export interface SafeModalAction {
    text: string;
    variant?: "primary" | "secondary" | "danger";
    disabled?: boolean;
    onClick(): void;
}

export interface SafeModalProps extends RenderModalProps {
    title: string;
    subtitle?: string;
    /** Rendered right to left, so the primary action goes first - the same order Discord uses. */
    actions?: SafeModalAction[];
    children: ReactNode;
}

const COLORS = {
    primary: "BRAND",
    secondary: "PRIMARY",
    danger: "RED"
} as const;

/** Discord's modal if this build still has one, otherwise one of our own that looks close enough. */
export function SafeModal({ title, subtitle, actions, children, onClose, ...props }: SafeModalProps) {
    const resolved = getChrome();

    const heading = (
        <div className="vc-safemodal-heading">
            <span className="vc-safemodal-title">{title}</span>
            {subtitle && <span className="vc-safemodal-subtitle">{subtitle}</span>}
        </div>
    );

    const buttons = (actions ?? [{ text: "Close", variant: "secondary", onClick: onClose }] as SafeModalAction[])
        .map(action => (
            <Button
                key={action.text}
                color={Button.Colors[COLORS[action.variant ?? "primary"]]}
                disabled={action.disabled}
                onClick={action.onClick}
            >
                {action.text}
            </Button>
        ));

    if (!resolved) {
        return (
            <div className="vc-safemodal" role="dialog" aria-label={title}>
                <div className="vc-safemodal-header">
                    {heading}
                    <button className="vc-safemodal-x" onClick={onClose} aria-label="Close">×</button>
                </div>
                <div className="vc-safemodal-content">{children}</div>
                <div className="vc-safemodal-footer">{buttons}</div>
            </div>
        );
    }

    const { ModalRoot, ModalHeader, ModalContent, ModalFooter, ModalCloseButton } = resolved;

    return (
        <ModalRoot {...props} size="medium">
            <ModalHeader>
                {heading}
                {ModalCloseButton && <ModalCloseButton onClick={onClose} />}
            </ModalHeader>
            <ModalContent>{children}</ModalContent>
            <ModalFooter>{buttons}</ModalFooter>
        </ModalRoot>
    );
}
