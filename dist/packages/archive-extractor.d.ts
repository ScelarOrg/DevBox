import { MemoryVolume } from "../memory-volume";
export interface ExtractionOptions {
    stripComponents?: number;
    filter?: (entryPath: string) => boolean;
    onProgress?: (msg: string) => void;
    /** expected sha1 hex from the npm registry, checked after download */
    expectedShasum?: string;
}
type EntryKind = "file" | "directory" | "link" | "other";
interface ArchiveEntry {
    filepath: string;
    kind: EntryKind;
    byteSize: number;
    fileMode: number;
    payload?: Uint8Array;
    linkDestination?: string;
}
export declare function parseTarArchive(raw: Uint8Array): Generator<ArchiveEntry>;
export declare function inflateGzip(compressed: ArrayBuffer | Uint8Array): Uint8Array;
export declare function extractArchive(archiveBytes: ArrayBuffer | Uint8Array, vol: MemoryVolume, destDir: string, opts?: ExtractionOptions): string[];
export declare function downloadAndExtract(url: string, vol: MemoryVolume, destDir: string, opts?: ExtractionOptions): Promise<string[]>;
export declare function downloadAndExtractDirect(url: string, vol: MemoryVolume, destDir: string, opts?: ExtractionOptions): Promise<string[]>;
declare const _default: {
    downloadAndExtract: typeof downloadAndExtract;
    downloadAndExtractDirect: typeof downloadAndExtractDirect;
    parseTarArchive: typeof parseTarArchive;
    extractArchive: typeof extractArchive;
    inflateGzip: typeof inflateGzip;
};
export default _default;
