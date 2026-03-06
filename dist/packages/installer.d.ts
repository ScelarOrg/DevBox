import { MemoryVolume } from "../memory-volume";
import { RegistryConfig } from "./registry-client";
import { ResolvedDependency } from "./version-resolver";
import type { IDBSnapshotCache } from "../persistence/idb-cache";
export interface InstallFlags {
    registry?: string;
    persist?: boolean;
    persistDev?: boolean;
    withDevDeps?: boolean;
    withOptionalDeps?: boolean;
    onProgress?: (message: string) => void;
    transformModules?: boolean;
}
export interface InstallOutcome {
    resolved: Map<string, ResolvedDependency>;
    newPackages: string[];
}
declare function splitSpecifier(spec: string): {
    name: string;
    version?: string;
};
export declare class DependencyInstaller {
    private vol;
    private registryClient;
    private workingDir;
    private _snapshotCache;
    constructor(vol: MemoryVolume, opts?: {
        cwd?: string;
        snapshotCache?: IDBSnapshotCache | null;
    } & RegistryConfig);
    install(packageName: string, version?: string, flags?: InstallFlags): Promise<InstallOutcome>;
    installFromManifest(manifestPath?: string, flags?: InstallFlags): Promise<InstallOutcome>;
    listInstalled(): Record<string, string>;
    private materializePackages;
    private createBinStubs;
    private writeLockFile;
    private patchManifest;
}
export declare function install(specifier: string, vol: MemoryVolume, flags?: InstallFlags): Promise<InstallOutcome>;
export { RegistryClient } from "./registry-client";
export type { RegistryConfig, VersionDetail, PackageMetadata, } from "./registry-client";
export type { ResolvedDependency, ResolutionConfig } from "./version-resolver";
export type { ExtractionOptions } from "./archive-extractor";
export { splitSpecifier };
