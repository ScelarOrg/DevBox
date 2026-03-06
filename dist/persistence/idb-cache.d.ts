import type { VolumeSnapshot } from '../engine-types';
export interface IDBSnapshotCache {
    get(packageJsonHash: string): Promise<VolumeSnapshot | null>;
    set(packageJsonHash: string, snapshot: VolumeSnapshot): Promise<void>;
    close(): void;
}
export declare function openSnapshotCache(): Promise<IDBSnapshotCache | null>;
