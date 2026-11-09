/** Page boundaries are offsets into the original NVL text.
 * A dialogue run (separated by \n) stays on one page whenever it fits;
 * long runs only split on word boundaries. No text is discarded.
 */
export interface TextPage {
    start: number;
    end: number;
}

export function paginateText(text: string, columns = 66, rows = 12): TextPage[] {
    if (columns < 1 || rows < 1) throw Error('Invalid pagination dimensions');
    if (!text) return [{ start: 0, end: 0 }];

    const pages: TextPage[] = [];
    let pageStart = 0;
    let usedLines = 0;

    const newPage = (offset: number) => {
        if (offset <= pageStart) return;
        pages.push({ start: pageStart, end: offset });
        pageStart = offset;
        usedLines = 0;
    };

    // Consume a paragraph using word-aware wrapping, returning the number
    // of visual lines it would occupy from a fresh line.
    const wrap = (start: number, end: number): number[] => {
        const lines: number[] = [];
        let cursor = start;
        while (cursor < end) {
            let next = Math.min(cursor + columns, end);
            if (next < end) {
                // Use a break *after* whitespace so the next page never
                // begins in the middle of a word.
                let space = next;
                while (space > cursor && !/\s/u.test(text[space - 1])) space--;
                if (space > cursor) next = space;
                else {
                    // Single unbreakable token: only then use a hard split.
                    let wordEnd = next;
                    while (wordEnd < end && !/\s/u.test(text[wordEnd])) wordEnd++;
                    next = wordEnd;
                }
            }
            lines.push(next);
            cursor = next;
        }
        return lines.length ? lines : [end];
    };

    let paragraphStart = 0;
    while (paragraphStart < text.length) {
        const newline = text.indexOf('\n', paragraphStart);
        const paragraphEnd = newline < 0 ? text.length : newline;
        const chunks = wrap(paragraphStart, paragraphEnd);
        const fitsOnePage = chunks.length <= rows;

        // Never leave the last few words of a short dialogue stranded on
        // the next page. Move the entire run together when possible.
        if (usedLines && fitsOnePage && chunks.length > rows - usedLines) {
            newPage(paragraphStart);
        }

        for (let i = 0; i < chunks.length; i++) {
            if (usedLines >= rows) {
                const offset = i === 0 ? paragraphStart : chunks[i - 1];
                newPage(offset);
            }
            usedLines++;
        }

        if (newline < 0) break;
        // Paragraph boundary includes the separator in the original offsets.
        // The next run starts on a new visual line.
        paragraphStart = newline + 1;
    }
    if (pageStart < text.length) pages.push({ start: pageStart, end: text.length });
    return pages.length ? pages : [{ start: 0, end: text.length }];
}

export function pageAtOffset(pages: TextPage[], offset: number): number {
    if (!pages.length) return 0;
    const position = Math.max(0, offset);
    const index = pages.findIndex(page => position < page.end);
    return index < 0 ? pages.length - 1 : index;
}
