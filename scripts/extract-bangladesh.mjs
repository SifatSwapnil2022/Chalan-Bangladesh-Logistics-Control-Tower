// Pulls Bangladesh's outline out of Natural Earth (via world-atlas) into a small GeoJSON file.
// Run once: node scripts/extract-bangladesh.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { feature } from 'topojson-client'

const world = JSON.parse(readFileSync(new URL('../node_modules/world-atlas/countries-10m.json', import.meta.url)))
const bd = feature(world, world.objects.countries).features.find((f) => f.id === '050')
if (!bd) throw new Error('Bangladesh (ISO 050) not found')
const round = (c) => (typeof c[0] === 'number' ? [+c[0].toFixed(3), +c[1].toFixed(3)] : c.map(round))
bd.geometry.coordinates = round(bd.geometry.coordinates)
writeFileSync(new URL('../src/data/bangladesh.json', import.meta.url), JSON.stringify({ type: 'Feature', properties: { name: 'Bangladesh' }, geometry: bd.geometry }))
console.log('wrote src/data/bangladesh.json')
