/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { DeleteIcon, PencilIcon } from "@components/Icons";
import { findComponentByCodeLazy, findCssClassesLazy } from "@webpack";
import { ExpressionPickerStore, Forms, Modal, openModal, TextArea, TextInput, useCallback, useEffect, useMemo, useRef, useState } from "@webpack/common";
import { RenderModalProps } from "@vencord/discord-types";

import { useResizeObserver, useVirtualizedMasonry } from "../FavoriteMedia/utils";
import { settings } from "./settings";
import { addSavedText, getSavedTexts, makeDefaultName, removeSavedText, SavedText, updateSavedText } from "./storage";

interface ManaSearchBarProps {
    autoFocus?: boolean;
    placeholder?: string;
    query?: string;
    onChange?: (query: string) => void;
    onClear?: () => void;
}

const ManaSearchBar = findComponentByCodeLazy<ManaSearchBarProps>("#{intl::SEARCH}),ref");
const ScrollerClasses = findCssClassesLazy("thin", "scrollerBase", "fade");
const GifPickerClasses = findCssClassesLazy("endContainer");

const TEXT_GUTTER = 12;
const TEXT_END_CONTAINER_HEIGHT = 80;
const MIN_CARD_HEIGHT = 120;

export function truncatePreview(text: string, limit: number) {
    if (limit <= 0) return "";
    if (text.length <= limit) return text;
    return text.slice(0, limit).trimEnd() + "…";
}

function estimateTextHeight(name: string, preview: string, colWidth: number) {
    const charsPerLine = Math.max(16, Math.floor(colWidth / 7.5));
    const nameLines = Math.min(2, Math.ceil(name.length / charsPerLine) || 1);
    const previewLines = Math.min(16, Math.ceil(preview.length / charsPerLine) || 1);

    const padding = 28;
    const nameHeight = nameLines * 20;
    const previewHeight = previewLines * 17;

    return Math.max(MIN_CARD_HEIGHT, padding + nameHeight + previewHeight + 8);
}

function computeTextLayout(items: SavedText[], containerWidth: number, previewCharLimit: number) {
    const cols = Math.max(2, Math.round(containerWidth / 230));
    const colWidth = (containerWidth - TEXT_GUTTER * (cols + 1)) / cols;
    const colTops = Array<number>(cols).fill(TEXT_GUTTER);

    return items.map(item => {
        const preview = truncatePreview(item.text, previewCharLimit);
        const col = colTops.indexOf(Math.min(...colTops));
        const itemHeight = estimateTextHeight(item.name, preview, colWidth);
        const layout = {
            left: TEXT_GUTTER + col * (colWidth + TEXT_GUTTER),
            top: colTops[col],
            width: colWidth,
            height: itemHeight,
        };
        colTops[col] += itemHeight + TEXT_GUTTER;
        return layout;
    });
}

function EditTextModal({
    item,
    initialText,
    onSaved,
    ...props
}: RenderModalProps & {
    item?: SavedText;
    initialText?: string;
    onSaved?: () => void;
}) {
    const [name, setName] = useState(item?.name ?? (initialText ? makeDefaultName(initialText) : ""));
    const [text, setText] = useState(item?.text ?? initialText ?? "");

    return (
        <Modal
            {...props}
            title={item ? "Edit Saved Text" : "Add Saved Text"}
            actions={[
                {
                    text: "Cancel",
                    variant: "secondary",
                    onClick: props.onClose
                },
                {
                    text: item ? "Save" : "Add",
                    variant: "primary",
                    disabled: !text.trim(),
                    onClick: async () => {
                        if (item) {
                            await updateSavedText(item.id, { name: name.trim() || item.name, text: text.trim() });
                        } else {
                            await addSavedText(name, text.trim());
                        }
                        onSaved();
                        props.onClose();
                    }
                }
            ]}
        >
            <Forms.FormSection>
                <Forms.FormTitle tag="h5">Name</Forms.FormTitle>
                <TextInput value={name} onChange={setName} placeholder="Label for this text" />
            </Forms.FormSection>
            <Forms.FormSection>
                <Forms.FormTitle tag="h5">Text</Forms.FormTitle>
                <div className="vc-saved-texts-editor">
                    <TextArea
                        value={text}
                        onChange={setText}
                        placeholder="Text content"
                        autosize
                        rows={14}
                    />
                </div>
            </Forms.FormSection>
        </Modal>
    );
}

export function openEditTextModal(item?: SavedText, onSaved?: () => void, initialText?: string) {
    openModal(props => (
        <EditTextModal {...props} item={item} initialText={initialText} onSaved={() => onSaved?.()} />
    ));
}

function TextCard({
    item,
    layout,
    previewCharLimit,
    onSelect,
    onEdit,
    onDelete,
}: {
    item: SavedText;
    layout: { left: number; top: number; width: number; height: number; };
    previewCharLimit: number;
    onSelect: (text: string) => void;
    onEdit: (item: SavedText) => void;
    onDelete: (item: SavedText) => void;
}) {
    const preview = truncatePreview(item.text, previewCharLimit);
    const title = item.name.trim() || makeDefaultName(item.text);

    return (
        <div
            className="vc-saved-texts-card"
            role="button"
            tabIndex={0}
            style={{
                position: "absolute",
                left: layout.left,
                top: layout.top,
                width: layout.width,
                height: layout.height,
            }}
            onClick={() => onSelect(item.text)}
            onKeyDown={e => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(item.text);
                }
            }}
        >
            <div className="vc-saved-texts-card-body">
                <div className="vc-saved-texts-card-name">{title}</div>
                <div className="vc-saved-texts-card-preview">{preview}</div>
            </div>

            <div className="vc-saved-texts-card-actions">
                <button
                    type="button"
                    className="vc-saved-texts-action-btn"
                    aria-label={`Edit ${title}`}
                    onClick={e => {
                        e.stopPropagation();
                        onEdit(item);
                    }}
                >
                    <PencilIcon height={16} width={16} />
                </button>
                <button
                    type="button"
                    className="vc-saved-texts-action-btn danger"
                    aria-label={`Delete ${title}`}
                    onClick={e => {
                        e.stopPropagation();
                        onDelete(item);
                    }}
                >
                    <DeleteIcon height={16} width={16} />
                </button>
            </div>
        </div>
    );
}

export function TextPicker({ onSelectItem }: { onSelectItem: (text: string) => void; }) {
    const scrollerRef = useRef<HTMLDivElement>(null);
    const [items, setItems] = useState<SavedText[]>([]);
    const [loading, setLoading] = useState(true);
    const [containerWidth, setContainerWidth] = useState(496);
    const { previewCharLimit } = settings.use(["previewCharLimit"]);

    const { query } = ExpressionPickerStore.useExpressionPickerStore(store => ({
        query: store.searchQuery as string
    }));

    const reload = async () => {
        setItems(await getSavedTexts());
        setLoading(false);
    };

    useEffect(() => {
        reload();
    }, []);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return items;
        return items.filter(item =>
            item.name.toLowerCase().includes(q) ||
            item.text.toLowerCase().includes(q)
        );
    }, [items, query]);

    useResizeObserver(scrollerRef, ({ width }) => setContainerWidth(width), []);

    useEffect(() => {
        scrollerRef.current?.scrollTo(0, 0);
    }, [query]);

    const layout = useMemo(
        () => computeTextLayout(filtered, containerWidth, previewCharLimit),
        [filtered, containerWidth, previewCharLimit]
    );

    const itemsBottom = useMemo(
        () => layout.length === 0 ? TEXT_GUTTER : Math.max(...layout.map(item => item.top + item.height)) + TEXT_GUTTER,
        [layout]
    );

    const totalHeight = itemsBottom + TEXT_END_CONTAINER_HEIGHT + TEXT_GUTTER;
    const visibleIndices = useVirtualizedMasonry(scrollerRef, layout);
    const count = filtered.length;

    const handleEdit = useCallback((item: SavedText) => {
        openEditTextModal(item, reload);
    }, []);

    const handleDelete = useCallback(async (item: SavedText) => {
        await removeSavedText(item.id);
        await reload();
    }, []);

    return (
        <div
            id="texts-picker-tab-panel"
            role="tabpanel"
            aria-labelledby="texts-picker-tab"
            className="vc-saved-texts-container"
        >
            <div className="vc-saved-texts-header">
                <div className="vc-saved-texts-search">
                    <ManaSearchBar
                        autoFocus
                        placeholder="Search saved texts"
                        query={query}
                        onChange={value => ExpressionPickerStore.setSearchQuery(value)}
                        onClear={() => ExpressionPickerStore.setSearchQuery("")}
                    />
                </div>
                <button
                    type="button"
                    className="vc-saved-texts-add-btn"
                    onClick={() => openEditTextModal(undefined, reload)}
                >
                    Add
                </button>
            </div>

            {loading ? (
                <div className="vc-saved-texts-body vc-saved-texts-empty">Loading...</div>
            ) : count === 0 ? (
                <div className="vc-saved-texts-body vc-saved-texts-empty">
                    {query.trim()
                        ? "No saved texts match your search."
                        : "No saved texts yet. Add one above or right-click a message and choose Save Text."}
                </div>
            ) : (
                <div style={{ flex: "1", minHeight: "0", display: "flex" }}>
                    <div
                        ref={scrollerRef}
                        className={`${ScrollerClasses.thin} ${ScrollerClasses.scrollerBase} ${ScrollerClasses.fade} vc-saved-texts-grid`}
                    >
                        <div className="vc-saved-texts-grid-content" style={{ height: totalHeight }}>
                            <div className="vc-saved-texts-grid-inner">
                                {visibleIndices.map(i => (
                                    <TextCard
                                        key={filtered[i].id}
                                        item={filtered[i]}
                                        layout={layout[i]}
                                        previewCharLimit={previewCharLimit}
                                        onSelect={onSelectItem}
                                        onEdit={handleEdit}
                                        onDelete={handleDelete}
                                    />
                                ))}
                            </div>
                            <div
                                style={{
                                    position: "absolute",
                                    left: 0,
                                    width: "100%",
                                    top: itemsBottom,
                                    height: TEXT_END_CONTAINER_HEIGHT + TEXT_GUTTER
                                }}
                            >
                                <div
                                    className={GifPickerClasses.endContainer}
                                    style={{
                                        position: "sticky",
                                        left: TEXT_GUTTER,
                                        width: `calc(100% - ${TEXT_GUTTER}px)`,
                                        top: 0,
                                        height: TEXT_END_CONTAINER_HEIGHT
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
