import { parseHTMLElements } from "./parseHTMLElements.js";

const ZW = "\u200b";

function sanitize(value: string): string {
    return parseHTMLElements(`${value}`)
        .replaceAll("[", "\uff3b")
        .replaceAll("]", "\uff3d")
        .replaceAll(/[*_~`|]/gu, (m) => `${m}${ZW}`);
}

export function formatMarkdownText(value: string): string {
    return sanitize(value);
}

export function formatMarkdownLink(label: string, url: string | null | undefined): string {
    const href = url?.trim();
    if (!href) {
        return sanitize(label);
    }
    return `[${sanitize(label)}](${href})`;
}

export function formatBoldMarkdownLink(label: string, url: string | null | undefined): string {
    return `**${formatMarkdownLink(label, url)}**`;
}
