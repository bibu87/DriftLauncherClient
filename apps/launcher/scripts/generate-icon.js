// Renders src/renderer/assets/drift_launcher.svg into a multi-size Windows
// .ico at resources/icon.ico. electron-builder bakes this into the portable
// exe, and BrowserWindow.icon picks it up at runtime via resolveIconPath().
//
// Run via: pnpm --filter launcher icon

const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const pngToIco = require('png-to-ico').default

const SVG = path.join(__dirname, '..', 'src', 'renderer', 'assets', 'drift_launcher.svg')
const OUT = path.join(__dirname, '..', 'resources', 'icon.ico')
const SIZES = [16, 24, 32, 48, 64, 128, 256]

async function main() {
  const svg = fs.readFileSync(SVG)
  const pngs = await Promise.all(
    SIZES.map((size) =>
      sharp(svg, { density: Math.max(72, size * 2) })
        .resize(size, size)
        .png()
        .toBuffer()
    )
  )
  const ico = await pngToIco(pngs)
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, ico)
  console.log(`Wrote ${OUT} (${SIZES.join(', ')})`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
