export interface ManifestModuleInfo {
  name: string;
  version: string;
  dependencies: string[];
  capabilities: string[];
  health: string;
  status: string;
}

export interface RuntimeManifestData {
  version: string;
  environment: string;
  buildNumber: string;
  modules: ManifestModuleInfo[];
  systemMeta: {
    nodeVersion: string;
    platform: string;
    arch: string;
    uptimeSeconds: number;
  };
}

export class RuntimeManifest {
  private configManager: { getExtraSetting(path: string, defaultValue?: any): any; getConfig(): any };
  private getModulesCallback: () => ManifestModuleInfo[];
  private readonly bootTime: Date;

  constructor(
    configManager: { getExtraSetting(path: string, defaultValue?: any): any; getConfig(): any },
    getModulesCallback: () => ManifestModuleInfo[]
  ) {
    this.configManager = configManager;
    this.getModulesCallback = getModulesCallback;
    this.bootTime = new Date();
  }

  /**
   * Compile and return the complete Runtime Manifest.
   */
  public getManifest(): RuntimeManifestData {
    const modules = this.getModulesCallback();

    return {
      version: this.configManager.getExtraSetting("version", "1.0.0"),
      environment: String(this.configManager.getConfig().environment),
      buildNumber: this.configManager.getExtraSetting("buildNumber", "local-dev"),
      modules,
      systemMeta: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        uptimeSeconds: Math.floor((Date.now() - this.bootTime.getTime()) / 1000),
      }
    };
  }
}
