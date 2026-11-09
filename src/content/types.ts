export interface InputFile {
    path: string;
    data: Uint8Array;
}
export interface Issue {
    severity: 'error' | 'warning';
    file: string;
    line?: number;
    message: string;
}
export interface PackageInfo {
    id: string;
    title: string;
    fingerprint: string;
    created: string;
    bytes: number;
    fileCount: number;
    scriptCount: number;
    entry: string;
}
export interface ContentPackage extends PackageInfo {
    clearSpritesOnBackgroundChange?: boolean;
    scripts: Record<string, string>;
    resources: Record<string, Blob>;
    entries: {
        file: string;
        labels: string[];
    }[];
    suggestedEntries: string[];
    issues: Issue[];
    textMode: 'nvl' | 'replace';
    timing: {
        waitMs: number;
        effectMs: number;
    };
    transitionMask?: string;
}
export interface ActiveContent {
    id: string;
    entry: string;
}

