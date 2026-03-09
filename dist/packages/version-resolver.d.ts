import { RegistryClient } from "./registry-client";
export interface ResolvedDependency {
    name: string;
    version: string;
    tarballUrl: string;
    dependencies: Record<string, string>;
    shasum?: string;
}
export interface ResolutionConfig {
    registry?: RegistryClient;
    devDependencies?: boolean;
    optionalDependencies?: boolean;
    onProgress?: (msg: string) => void;
}
export interface SemverComponents {
    major: number;
    minor: number;
    patch: number;
    prerelease?: string;
}
export declare function parseSemver(raw: string): SemverComponents | null;
export declare function compareSemver(left: string, right: string): number;
export declare function satisfiesRange(version: string, range: string): boolean;
export declare function pickBestMatch(available: string[], range: string): string | null;
export declare function resolveDependencyTree(rootName: string, versionRange?: string, config?: ResolutionConfig): Promise<Map<string, ResolvedDependency>>;
export declare function resolveFromManifest(manifest: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
}, config?: ResolutionConfig): Promise<Map<string, ResolvedDependency>>;
export declare class VersionResolver {
    parse: typeof parseSemver;
    compare: typeof compareSemver;
    satisfies: typeof satisfiesRange;
    pickBest: typeof pickBestMatch;
    resolveTree: typeof resolveDependencyTree;
    resolveManifest: typeof resolveFromManifest;
}
export default VersionResolver;
