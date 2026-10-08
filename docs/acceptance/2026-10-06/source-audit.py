import zipfile, xml.etree.ElementTree as ET, io, csv, collections, json, time, math, hashlib
from pathlib import Path
archive=Path('/Users/zhengyuan/Downloads/0038781-260806074905277.zip')
started=time.time()
csv.field_size_limit(20_000_000)
ns={'d':'http://rs.tdwg.org/dwc/text/'}
z=zipfile.ZipFile(archive)
meta=ET.fromstring(z.read('meta.xml'))
def rows(section):
    cols={f.attrib['term'].split('/')[-1].split('#')[-1]:int(f.attrib['index']) for f in section.findall('d:field',ns) if 'index' in f.attrib}
    key=section.find('d:id',ns) if section.tag.endswith('core') else section.find('d:coreid',ns)
    if key is not None: cols['gbifID']=int(key.attrib['index'])
    delim=section.attrib.get('fieldsTerminatedBy',r'\t').replace(r'\t','\t')
    quote=section.attrib.get('fieldsEnclosedBy','')
    for loc in section.findall('d:files/d:location',ns):
        with z.open(loc.text) as raw:
            text=io.TextIOWrapper(raw,encoding=section.attrib.get('encoding','UTF-8'),newline='')
            reader=csv.reader(text,delimiter=delim,quotechar=quote or None,quoting=csv.QUOTE_MINIMAL if quote else csv.QUOTE_NONE)
            for _ in range(int(section.attrib.get('ignoreHeaderLines','0'))): next(reader,None)
            for row in reader:
                yield {name:(row[index].strip() if index<len(row) else '') for name,index in cols.items()}
def valid_geo(r):
    try:
        lat=float(r['decimalLatitude']); lon=float(r['decimalLongitude'])
        return math.isfinite(lat) and math.isfinite(lon) and -90<=lat<=90 and -180<=lon<=180
    except (ValueError,KeyError): return False
stats={'archive':str(archive),'archiveBytes':archive.stat().st_size,'uncompressedBytes':sum(f.file_size for f in z.infolist()),'occurrenceRows':0,'selectedRows':0,'duplicateSelectedIds':0}
kingdoms=collections.Counter(); selected={}; samples=[]
for r in rows(meta.find('d:core',ns)):
    stats['occurrenceRows']+=1; kingdoms[r.get('kingdom','')]+=1
    if r.get('kingdom')=='Animalia' and r.get('gbifID','').isdigit() and r.get('scientificName'):
        stats['selectedRows']+=1
        gbif=r['gbifID']
        if gbif in selected: stats['duplicateSelectedIds']+=1
        else: selected[gbif]=(valid_geo(r),r.get('class',''),r.get('speciesKey',''))
        if len(samples)<12: samples.append({k:r.get(k) for k in ['gbifID','scientificName','decimalLatitude','decimalLongitude','class']})
    if stats['occurrenceRows']%100000==0: print('Source occurrences',stats['occurrenceRows'],flush=True)
stats.update(kingdomRows=dict(kingdoms),uniqueSelectedOccurrences=len(selected),plottable=sum(v[0] for v in selected.values()),aves=sum(v[0] and v[1]=='Aves' for v in selected.values()),insecta=sum(v[0] and v[1]=='Insecta' for v in selected.values()),species=len({v[2] for v in selected.values() if v[2].isdigit()}),sourceSpecies=len({v[2] for v in selected.values() if v[2]}),nonNumericSpeciesOccurrences=sum(bool(v[2]) and not v[2].isdigit() for v in selected.values()),missingSpeciesOccurrences=sum(not v[2] for v in selected.values()))
media=set(); audio_ids=set(); image_ids=set(); type_counts=collections.Counter(); scanned=0; parsed=0; unmatched=0
from urllib.parse import urlsplit
media_extensions=[ext for ext in meta.findall('d:extension',ns) if ext.attrib.get('rowType','').lower().endswith('/multimedia')]
stats['mediaSections']=[ext.find('d:files/d:location',ns).text for ext in media_extensions]
for ext in media_extensions[:1]:
    for r in rows(ext):
        scanned+=1; gbif=r.get('gbifID','')
        url=next((r.get(k,'') for k in ['identifier','references','source'] if urlsplit(r.get(k,'')).scheme.lower() in ['https','http'] and urlsplit(r.get(k,'')).netloc),'')
        if not gbif.isdigit() or not url: continue
        parsed+=1
        if gbif not in selected: unmatched+=1; continue
        key=(gbif,url)
        if key in media: continue
        media.add(key)
        typ=r.get('type','').lower(); fmt=r.get('format','').lower()
        if 'sound' in typ or fmt.startswith('audio/'): type_counts['audio']+=1; audio_ids.add(gbif)
        if 'stillimage' in typ or fmt.startswith('image/'): type_counts['image']+=1; image_ids.add(gbif)
        if 'movingimage' in typ or 'video' in typ or fmt.startswith('video/'): type_counts['video']+=1
        if scanned%100000==0: print('Source media',scanned,flush=True)
stats.update(mediaRows=scanned,validMediaRows=parsed,unmatchedMediaRows=unmatched,uniqueLinkedMedia=len(media),mediaTypes=dict(type_counts),audioOccurrences=len(audio_ids),plottableAudioOccurrences=sum(selected[k][0] for k in audio_ids),imageOccurrences=len(image_ids),samples=samples)
h=hashlib.sha256()
with archive.open('rb') as f:
    for chunk in iter(lambda:f.read(8*1024*1024),b''): h.update(chunk)
stats['archiveSha256']=h.hexdigest(); stats['auditSeconds']=round(time.time()-started,2)
Path('/private/tmp/gbif-real-source-audit.json').write_text(json.dumps(stats,ensure_ascii=False,indent=2))
Path('/private/tmp/gbif-real-source-ids.txt').write_text('\n'.join(sorted(selected,key=int))+'\n')
print(json.dumps(stats,ensure_ascii=False,indent=2),flush=True)
