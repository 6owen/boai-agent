import { getIconCollections, iconsPlugin } from '@egoist/tailwindcss-icons'

export default {
  content: ['./src/renderer/**/*.{html,ts,tsx}'],
  plugins: [
    iconsPlugin({
      collections: getIconCollections(['carbon', 'solar']),
    })
  ],
}
