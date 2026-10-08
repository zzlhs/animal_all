// Small real PMTiles/MVT archive for release verification tests (one z0 tile).
import Pbf from 'pbf'
export function pmtilesFixture(revision: string, extra: Record<string, string | number> = {}) {
  const tile = new Pbf()
  tile.writeMessage(3, (_, layer) => {
    layer.writeVarintField(15, 2)
    layer.writeStringField(1, 'gbif_occurrences')
    layer.writeVarintField(5, 4096)
    const properties = Object.entries({ dataset_revision: revision, feature_schema_version: 2, ...extra })
    for (const [key, value] of properties) {
      layer.writeStringField(3, key)
      layer.writeMessage(4, (_, field) => typeof value === 'number' ? field.writeVarintField(5, value) : field.writeStringField(1, value), null)
    }
    layer.writeMessage(2, (_, feature) => {
      feature.writeVarintField(1, 1)
      feature.writePackedVarint(2, properties.flatMap((_, i) => [i, i]))
      feature.writeVarintField(3, 1)
      const lon = Number(extra.exact_longitude ?? 0), lat = Number(extra.exact_latitude ?? 0)
      const x = Math.round((lon + 180) / 360 * 4096)
      const y = Math.round((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * 4096)
      feature.writePackedVarint(4, [9, x * 2, y * 2])
    }, null)
  }, null)
  const mvt = Buffer.from(tile.finish())
  const directory = new Pbf()
  for (const value of [1, 0, 1, mvt.length, 1]) directory.writeVarint(value)
  const root = Buffer.from(directory.finish())
  const metadata = Buffer.from(JSON.stringify({ vector_layers: [{ id: 'gbif_occurrences', fields: {} }] }))
  const header = Buffer.alloc(127)
  header.write('PMTiles'); header[7] = 3
  const fields = [[8, 127], [16, root.length], [24, 127 + root.length], [32, metadata.length],
    [56, 127 + root.length + metadata.length], [64, mvt.length], [72, 1], [80, 1], [88, 1]]
  for (const [offset, value] of fields) header.writeBigUInt64LE(BigInt(value), offset)
  header[96] = header[97] = header[98] = header[99] = 1
  header.writeInt32LE(-180 * 1e7, 102)
  header.writeInt32LE(-85 * 1e7, 106)
  header.writeInt32LE(180 * 1e7, 110)
  header.writeInt32LE(85 * 1e7, 114)
  return Buffer.concat([header, root, metadata, mvt])
}
