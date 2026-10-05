declare module 'virtual:pumpkin-runtime' {
  const code: string;
  export default code;
}

declare module 'virtual:pumpkin-fonts' {
  /** @font-face rules with embedded files, per font family. */
  export const familyFonts: Record<import('./shared/types.ts').FontKey, string>;
}

/** The app version from package.json (set by vite.config.ts). */
declare const __APP_VERSION__: string;
