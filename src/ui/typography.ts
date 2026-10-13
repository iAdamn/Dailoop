/** Static, bundled OFL faces; loading never contacts a font service. */
export const typefaces = {
  display: 'Outfit-SemiBold',
  displayBold: 'Outfit-Bold',
  body: 'Manrope-Regular',
  medium: 'Manrope-Medium',
  semibold: 'Manrope-SemiBold',
  bold: 'Manrope-Bold',
} as const;

export const fontAssets = {
  [typefaces.display]: require('../../assets/fonts/Outfit-SemiBold.ttf'),
  [typefaces.displayBold]: require('../../assets/fonts/Outfit-Bold.ttf'),
  [typefaces.body]: require('../../assets/fonts/Manrope-Regular.ttf'),
  [typefaces.medium]: require('../../assets/fonts/Manrope-Medium.ttf'),
  [typefaces.semibold]: require('../../assets/fonts/Manrope-SemiBold.ttf'),
  [typefaces.bold]: require('../../assets/fonts/Manrope-Bold.ttf'),
};
