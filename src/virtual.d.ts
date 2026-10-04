declare module 'virtual:pumpkin-runtime' {
  const code: string;
  export default code;
}

declare module 'virtual:pumpkin-fonts' {
  export const styleFonts: Record<import('./shared/types').StyleId, string>;
  export const slideFonts: string;
}
