import { createWriteStream } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import yazl from 'yazl'
import { describeDwcaArchive, readDwcaRows, rowValue } from './dwca-reader.js'

const temporaryDirectories: string[] = []

async function createArchive(files: Readonly<Record<string, string>>) {
  const directory = await mkdtemp(join(tmpdir(), 'gbif-dwca-'))
  temporaryDirectories.push(directory)
  const archivePath = join(directory, 'archive.zip')
  const archive = new yazl.ZipFile()
  for (const [name, content] of Object.entries(files)) archive.addBuffer(Buffer.from(content), name)
  await new Promise<void>((resolve, reject) => {
    archive.outputStream.pipe(createWriteStream(archivePath)).once('close', resolve).once('error', reject)
    archive.end()
  })
  return archivePath
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

describe('DWCA archive reader', () => {
  it('uses meta.xml locations, delimiter, columns and optional media', async () => {
    const archivePath = await createArchive({
      'meta.xml': `<?xml version="1.0" encoding="UTF-8"?>
        <archive xmlns="http://rs.tdwg.org/dwc/text/">
          <core encoding="UTF-8" fieldsTerminatedBy="," fieldsEnclosedBy="&quot;" ignoreHeaderLines="1" rowType="http://rs.tdwg.org/dwc/terms/Occurrence">
            <files><location>data/core.csv</location></files>
            <id index="0"/>
            <field index="1" term="http://rs.tdwg.org/dwc/terms/scientificName"/>
            <field index="2" term="http://rs.tdwg.org/dwc/terms/kingdom"/>
          </core>
        </archive>`,
      'data/core.csv': 'id,name,kingdom\n6360481313,"Panthera, pardus",Animalia\n',
    })

    const descriptor = await describeDwcaArchive(archivePath)
    expect(descriptor.usesMetaXml).toBe(true)
    expect(descriptor.media).toBeNull()
    const values = []
    for await (const value of readDwcaRows(archivePath, descriptor.occurrence)) values.push(value)
    expect(values).toHaveLength(1)
    expect(rowValue(values[0]!.row, values[0]!.columns, 'gbifID')).toBe('6360481313')
    expect(rowValue(values[0]!.row, values[0]!.columns, 'scientificName')).toBe('Panthera, pardus')
  })

  it('falls back to a header-based occurrence file without requiring multimedia', async () => {
    const archivePath = await createArchive({
      'nested/occurrence.txt': 'gbifID\tscientificName\tkingdom\n1\tTest species\tAnimalia\n',
    })
    const descriptor = await describeDwcaArchive(archivePath)
    expect(descriptor.usesMetaXml).toBe(false)
    expect(descriptor.media).toBeNull()
    const values = []
    for await (const value of readDwcaRows(archivePath, descriptor.occurrence)) values.push(value)
    expect(values).toHaveLength(1)
    expect(rowValue(values[0]!.row, values[0]!.columns, 'scientificName')).toBe('Test species')
  })

  it('prefers the exact meta.xml location when another directory has the same basename', async () => {
    const archivePath = await createArchive({
      'meta.xml': `<?xml version="1.0" encoding="UTF-8"?>
        <archive xmlns="http://rs.tdwg.org/dwc/text/">
          <core fieldsTerminatedBy="," ignoreHeaderLines="1" rowType="http://rs.tdwg.org/dwc/terms/Occurrence">
            <files><location>data/core.csv</location></files>
            <id index="0"/>
            <field index="1" term="http://rs.tdwg.org/dwc/terms/scientificName"/>
          </core>
        </archive>`,
      'other/core.csv': 'id,name\n1,Wrong species\n',
      'data/core.csv': 'id,name\n2,Expected species\n',
    })

    const descriptor = await describeDwcaArchive(archivePath)
    const values = []
    for await (const value of readDwcaRows(archivePath, descriptor.occurrence)) values.push(value)
    expect(values).toHaveLength(1)
    expect(rowValue(values[0]!.row, values[0]!.columns, 'scientificName')).toBe('Expected species')
  })

  it('rejects an archive whose header fallback is ambiguous', async () => {
    const archivePath = await createArchive({
      'one/occurrence.txt': 'gbifID\tscientificName\n1\tFirst species\n',
      'two/occurrence.txt': 'gbifID\tscientificName\n2\tSecond species\n',
    })

    await expect(describeDwcaArchive(archivePath)).rejects.toThrow('occurrence.txt is ambiguous')
  })

  it('reads every file listed for a section and resolves paths relative to nested meta.xml', async () => {
    const archivePath = await createArchive({
      'metadata/meta.xml': `<?xml version="1.0" encoding="UTF-8"?>
        <archive xmlns="http://rs.tdwg.org/dwc/text/">
          <core fieldsTerminatedBy="," ignoreHeaderLines="1" rowType="http://rs.tdwg.org/dwc/terms/Occurrence">
            <files>
              <location>../data/core-1.csv</location>
              <location>../data/core-2.csv</location>
            </files>
            <id index="0"/>
            <field index="1" term="http://rs.tdwg.org/dwc/terms/scientificName"/>
          </core>
        </archive>`,
      'data/core-1.csv': 'id,name\n1,First species\n',
      'data/core-2.csv': 'id,name\n2,Second species\n',
    })

    const descriptor = await describeDwcaArchive(archivePath)
    expect(descriptor.occurrence.entryNames).toEqual(['data/core-1.csv', 'data/core-2.csv'])
    const names = []
    for await (const value of readDwcaRows(archivePath, descriptor.occurrence)) {
      names.push(rowValue(value.row, value.columns, 'scientificName'))
    }
    expect(names).toEqual(['First species', 'Second species'])
  })

  it('does not substitute a different directory when a meta.xml path is missing', async () => {
    const archivePath = await createArchive({
      'meta.xml': `<?xml version="1.0" encoding="UTF-8"?>
        <archive xmlns="http://rs.tdwg.org/dwc/text/">
          <core fieldsTerminatedBy="," ignoreHeaderLines="1" rowType="http://rs.tdwg.org/dwc/terms/Occurrence">
            <files><location>expected/core.csv</location></files>
            <id index="0"/>
            <field index="1" term="http://rs.tdwg.org/dwc/terms/scientificName"/>
          </core>
        </archive>`,
      'other/core.csv': 'id,name\n1,Wrong species\n',
    })

    const descriptor = await describeDwcaArchive(archivePath)
    const read = async () => {
      for await (const value of readDwcaRows(archivePath, descriptor.occurrence)) void value
    }
    await expect(read()).rejects.toThrow('expected/core.csv was not found')
  })
})
