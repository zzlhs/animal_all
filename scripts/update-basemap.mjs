import { writeFile } from 'node:fs/promises'
import './run.mjs'

const origin='https://tiles.openfreemap.org'
const style=await fetch(`${origin}/styles/liberty`,{signal:AbortSignal.timeout(15000)}).then(response => {if(!response.ok)throw new Error(`Style: ${response.status}`);return response.json()})
if(style.version!==8 || !style.sources?.openmaptiles?.url || !Array.isArray(style.layers))throw new Error('Unsupported basemap style')
const tileJSON=await fetch(new URL(style.sources.openmaptiles.url,origin),{signal:AbortSignal.timeout(15000)}).then(response => {if(!response.ok)throw new Error(`TileJSON: ${response.status}`);return response.json()})
if(!tileJSON.tiles?.length || !tileJSON.tiles.every(url => url.startsWith(origin+'/planet/')))throw new Error('Unexpected basemap tile origins')
delete style.sources.openmaptiles.url
for(const key of ['tiles','minzoom','maxzoom','bounds','attribution'])if(tileJSON[key]!=null)style.sources.openmaptiles[key]=tileJSON[key]
style.metadata={...style.metadata,'gbif:refreshedAt':new Date().toISOString(),'gbif:source':`${origin}/styles/liberty`}
await writeFile(new URL('../apps/web/src/features/globe/basemap.style.json',import.meta.url),JSON.stringify(style)+'\n')
console.log(JSON.stringify({layers:style.layers.length,tiles:tileJSON.tiles,refreshedAt:style.metadata['gbif:refreshedAt']}))
