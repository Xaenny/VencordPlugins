import * as DataStore from "@api/DataStore";

export interface SavedText {
    id: string;
    name: string;
    text: string;
    createdAt: number;
}

const STORE_KEY = "SavedTexts_entries";

export async function getSavedTexts(): Promise<SavedText[]> {
    return (await DataStore.get<SavedText[]>(STORE_KEY)) ?? [];
}

export async function addSavedText(name: string, text: string) {
    const entry: SavedText = {
        id: crypto.randomUUID(),
        name: name.trim() || makeDefaultName(text),
        text,
        createdAt: Date.now()
    };

    await DataStore.update(STORE_KEY, (items: SavedText[] | undefined) => [entry, ...(items ?? [])]);
    return entry;
}

export async function removeSavedText(id: string) {
    await DataStore.update(STORE_KEY, (items: SavedText[] | undefined) =>
        (items ?? []).filter(item => item.id !== id)
    );
}

export async function updateSavedText(id: string, patch: Partial<Pick<SavedText, "name" | "text">>) {
    await DataStore.update(STORE_KEY, (items: SavedText[] | undefined) =>
        (items ?? []).map(item => item.id === id ? { ...item, ...patch } : item)
    );
}

export function makeDefaultName(text: string) {
    const oneLine = text.replace(/\s+/g, " ").trim();
    if (oneLine.length <= 40) return oneLine || "Saved text";
    return oneLine.slice(0, 37) + "...";
}
