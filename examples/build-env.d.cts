/** Build configuration shared by the private Taro and Uni examples. */
export interface BuildEnv {
  /** Framework platform name, preserved for generated paths and aliases. */
  platform: string
  /** Project CSS policy; this does not declare platform support. */
  cssTarget: 'weapp' | 'web'
}

/** A supplied snapshot never inherits missing values from process.env. */
export declare function resolveBuildEnv(
  framework: 'taro' | 'uni',
  env: Readonly<{ TARO_ENV?: string | undefined, UNI_PLATFORM?: string | undefined }>,
): BuildEnv
