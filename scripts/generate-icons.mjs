// Generates all app icons from the Crown Crest mark (see CLAUDE.md → Logo).
// Run after any logo change:  node scripts/generate-icons.mjs
//
// Outputs (public/): apple-touch-icon.png (180, full-bleed — iOS masks its
// own corners), favicon-32x32.png, favicon-16x16.png, favicon.ico, logo.svg.
// The in-app drawer lockup lives in src/components/shared/DynastyEdgeLogo.jsx
// and shares this geometry.

import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public')

// MATCHDAY RE-CUT (step 4). Blackout used two gradient families (a red ramp
// ground, a silver crown) and rounded bars. Matchday has no gradients and no
// radius anywhere, so the icon is TWO FLAT COLOURS: a solid crimson field with
// the crown reversed out of it in warm paper — the same reversal the in-app
// lockup, the hero and the tab bar all make.
const BRAND = '#C8102E'   // --brand, the Falcons crimson spot
const PAPER = '#F4F2EC'   // --bg-primary (light), the warm paper ground

// Crown Crest: three ascending bars (a rising chart) as crown prongs, a jewel
// above each tip, and a detached base band (the circlet). Geometry spans
// x 20–76, y 10–76 in a 96×96 viewBox. Square throughout — the jewels were
// circles and the bars carried rx="5"; both are now hard-edged, and the jewels
// are 9×9 squares centred on the old circle centres.
const CROWN = (fill) => `
  <g fill="${fill}">
    <rect x="23.5" y="34.5" width="9" height="9"/>
    <rect x="43.5" y="22.5" width="9" height="9"/>
    <rect x="63.5" y="10.5" width="9" height="9"/>
    <rect x="22" y="48" width="12" height="12"/>
    <rect x="42" y="36" width="12" height="24"/>
    <rect x="62" y="24" width="12" height="36"/>
    <rect x="20" y="66" width="56" height="10"/>
  </g>`

// App icon: full-bleed flat crimson, paper crown, no border, no pre-rounding
// (iOS applies its own mask).
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <rect width="96" height="96" fill="${BRAND}"/>
  ${CROWN(PAPER)}
</svg>`

// Favicon / browser tab. It used to carry rx="22"; Matchday is hard edges, and
// a square favicon reads correctly in every square favicon slot anyway.
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <rect width="96" height="96" fill="${BRAND}"/>
  ${CROWN(PAPER)}
</svg>`

async function png(svg, size) {
  return sharp(Buffer.from(svg), { density: 300 }).resize(size, size).png().toBuffer()
}

const appleTouch = await png(iconSvg, 180)
const fav32 = await png(faviconSvg, 32)
const fav16 = await png(faviconSvg, 16)

await writeFile(path.join(PUBLIC, 'apple-touch-icon.png'), appleTouch)
await writeFile(path.join(PUBLIC, 'icon-192.png'), await png(iconSvg, 192))
await writeFile(path.join(PUBLIC, 'icon-512.png'), await png(iconSvg, 512))
await writeFile(path.join(PUBLIC, 'favicon-32x32.png'), fav32)
await writeFile(path.join(PUBLIC, 'favicon-16x16.png'), fav16)
await writeFile(path.join(PUBLIC, 'favicon.ico'), await pngToIco([fav32, fav16]))
await writeFile(path.join(PUBLIC, 'logo.svg'), faviconSvg + '\n')

console.log('Icons regenerated in public/')
