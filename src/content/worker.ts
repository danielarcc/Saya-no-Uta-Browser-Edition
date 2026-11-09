/// <reference lib="webworker" />
import { readZip, LIMITS } from './archive';
import { compilePackage } from './compiler';
import type { InputFile } from './types';
self.onmessage = async (e: MessageEvent<{
    zip?: Blob;
    files?: {
        path: string;
        blob: Blob;
    }[];
}>) => {
    const progress = (message: string) => self.postMessage({ type: 'progress', message });
    try {
        let inputs: InputFile[];
        if (e.data.zip) {
            if (e.data.zip.size > LIMITS.archive)
                throw Error('ZIP excede 512 MiB');
            progress('Lendo e descompactando o ZIP…');
            inputs = readZip(new Uint8Array(await e.data.zip.arrayBuffer()));
        }
        else {
            const selected = e.data.files ?? [];
            if (selected.length > LIMITS.count)
                throw Error('Folder exceeds 10,000 files');
            let total = 0;
            inputs = [];
            for (const [i, f] of selected.entries()) {
                total += f.blob.size;
                if (f.blob.size > LIMITS.file || total > LIMITS.total)
                    throw Error('Folder exceeds 128 MiB per file or 1 GiB total');
                if (i % 25 === 0)
                    progress(`Reading files ${i + 1}/${selected.length}`);
                inputs.push({ path: f.path, data: new Uint8Array(await f.blob.arrayBuffer()) });
            }
        }
        const pkg = await compilePackage(inputs, progress);
        self.postMessage({ type: 'done', pkg });
    }
    catch (e) {
        self.postMessage({ type: 'error', message: e instanceof Error ? e.message : String(e) });
    }
};

