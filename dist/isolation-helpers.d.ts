export interface SandboxPageConfig {
    nodepodUrl?: string;
    enableServiceWorker?: boolean;
    /** parent page origin, e.g. 'https://myapp.com'. locks down who can
     *  talk to the sandbox. defaults to '*' for backwards compat */
    parentOrigin?: string;
}
export declare function getSandboxPageHtml(config?: SandboxPageConfig | string): string;
export declare function getSandboxHostingConfig(): object;
export interface GeneratedSandboxFiles {
    'index.html': string;
    'vercel.json': string;
    '__sw__.js'?: string;
}
export declare function generateSandboxDeployment(config?: SandboxPageConfig | string): GeneratedSandboxFiles;
export declare const SANDBOX_DEPLOYMENT_GUIDE: string;
