import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Map as MapInstance } from 'maplibre-gl'
import type { OccurrenceRecord, PageResult, FilterType } from '@gbif-globe/contracts'
import { FeatureSchemaConstants, MapInteractionConstants as C } from '@gbif-globe/contracts'
import { metaQueryOptions, ambientTracksQueryOptions } from '../queries/occurrenceQueries.js'
import { useAudioPlayer } from '../features/media/AudioContext.js'
import { GlobeView } from '../features/globe/appearance.js'
import { MapMarker } from '../features/globe/MapMarker.js'
import { MapPopup } from '../features/globe/MapPopup.js'
import { PhotoPin } from '../features/globe/PhotoPin.js'
import { ClusterPin } from '../features/globe/ClusterPin.js'
import { clusterOccurrences } from '../features/globe/clustering.js'
import { countProperty, featureContainsRecord } from '../features/globe/features.js'
import { MapCanvas } from '../features/globe/MapCanvas.js'
import { featureIdentity, featurePath, selectionCoordinates, type SelectedFeature, type FeatureInteraction } from '../features/globe/features.js'
import { MapControls } from '../features/globe/MapControls.js'
import { FilterPanel } from '../features/filters/FilterPanel.js'
import { FloatingAudioPlayer } from '../features/media/FloatingAudioPlayer.js'
import { AmbientSoundPanel } from '../features/media/AmbientSoundPanel.js'
import { OccurrenceCard } from '../features/occurrences/OccurrenceCard.js'
import { OccurrenceList } from '../features/occurrences/OccurrenceList.js'
import { layoutScreenItems, markerViewport, photoBudget } from '../features/globe/markerLayout.js'
import { useMarkerRecords } from '../features/globe/useMarkerRecords.js'

export const Route = createFileRoute('/')({ component: GlobePage })
class RevisionError extends Error {}
function GlobePage() {
  const queryClient = useQueryClient()
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [language, setLanguage] = useState<'zh' | 'en'>('zh')
  const [preferencesReady, setPreferencesReady] = useState(false)
  const [filter, setFilter] = useState<FilterType>('all')
  const [filterOpen, setFilterOpen] = useState(false)
  const [ambientOpen, setAmbientOpen] = useState(false)
  const [feature, setFeature] = useState<SelectedFeature | null>(null)
  const [visibleFeatures, setVisibleFeatures] = useState<SelectedFeature[]>([])
  const [smallCluster, setSmallCluster] = useState<ReturnType<typeof clusterOccurrences>[number] | null>(null)
  const [zoom, setZoom] = useState<number>(GlobeView.ZOOM)
  const [, setViewRevision] = useState(0)
  const hoverClose = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [selected, setSelected] = useState<OccurrenceRecord | null>(null)
  const [selectionPinned, setSelectionPinned] = useState(false)
  const [notice, setNotice] = useState('')
  const [map, setMap] = useState<MapInstance | null>(null)
  const lastRevision = useRef('')
  const { activeSource, isPlaying, currentTrack, setOnLocateTrack } = useAudioPlayer()
  const meta = useQuery(metaQueryOptions())
  const revision = meta.data?.dataset.revision
  const smallMap = Boolean(meta.data && meta.data.dataset.plottableCount <= C.MAX_RICH_MARKERS)
  const ids = [...new Set(visibleFeatures.map(f => f.properties.representative_occurrence_id))].sort()
  const markerRecords = useMarkerRecords(revision, ids, smallMap)
  const recordMap = markerRecords.records
  const largeNativeReady = Boolean(map && visibleFeatures.length)
  const allSmallRecords = smallMap ? [...recordMap.values()] : []
  const smallClusters = map ? layoutScreenItems(clusterOccurrences(allSmallRecords.filter(r => filter === 'all' || (filter === 'audio' ? r.media.some(m => m.kind === 'audio') : r.class === filter)), zoom)
    .map(cluster => ({ id: cluster.id, coordinates: cluster.coordinates, count: cluster.records.length, priority: cluster.records.some(record => record.gbifId === selected?.gbifId || record.gbifId === currentTrack?.gbifID), item: cluster })),
    markerViewport(map)) : []
  const priorityFeatureIds = useMemo(() => feature ? [featureIdentity(feature)] : [], [feature])
  const priorityRecord = selected || (isPlaying ? currentTrack?.record : null)
  const photos = photoBudget(zoom)
  const keepHoverOpen = () => clearTimeout(hoverClose.current)
  const clearSelection = () => { keepHoverOpen(); setFeature(null); setSmallCluster(null); setSelected(null); setSelectionPinned(false) }
  const scheduleHoverClose = () => { keepHoverOpen(); if (!selectionPinned) hoverClose.current = setTimeout(clearSelection, C.HOVER_CLOSE_DELAY_MS) }
  useEffect(() => () => clearTimeout(hoverClose.current), [])
  useEffect(() => {
    const dismiss = (event: KeyboardEvent) => { if (event.key === 'Escape') clearSelection() }
    window.addEventListener('keydown', dismiss)
    return () => window.removeEventListener('keydown', dismiss)
  }, [])
  useEffect(() => {
    if (!map) return
    const update = () => { setZoom(map.getZoom()); setViewRevision(value => value + 1) }
    update(); map.on('moveend', update); map.on('resize', update)
    return () => { map.off('moveend', update); map.off('resize', update) }
  }, [map])
  const tracks = useQuery({ ...ambientTracksQueryOptions(revision, language), enabled: Boolean(revision && ambientOpen) })
  const page = useInfiniteQuery({
    queryKey: ['map-page', revision, filter, feature ? featureIdentity(feature) : null],
    enabled: Boolean(feature && revision && feature.properties.dataset_revision === revision),
    initialPageParam: null as string | null,
    maxPages: C.MAX_LIST_PAGES,
    staleTime: 60_000,
    queryFn: async ({ pageParam, signal }): Promise<PageResult<OccurrenceRecord>> => {
      const response = await fetch(featurePath(feature!, filter, pageParam), { signal })
      if (response.status === 409 || response.status === 410) throw new RevisionError('数据已更新，请重新选择 / Data updated')
      if (!response.ok) throw new Error(`记录加载失败 / Request failed (${response.status})`)
      const result = await response.json() as PageResult<OccurrenceRecord>
      if (result.datasetRevision !== revision) throw new RevisionError('数据版本已更新 / Data updated')
      return result
    },
    getNextPageParam: last => last.nextCursor ?? undefined,
    retry: (count, error) => !(error instanceof RevisionError) && count < 1,
  })
  useEffect(() => {
    if (!(page.error instanceof RevisionError)) return
    setNotice(page.error.message); clearSelection()
    queryClient.removeQueries({ queryKey: ['map-page', revision] })
    void meta.refetch()
  }, [page.error])
  useEffect(() => {
    if (lastRevision.current && lastRevision.current !== revision) {
      clearSelection()
      queryClient.removeQueries({ queryKey: ['map-page', lastRevision.current] })
    }
    lastRevision.current = revision ?? ''
  }, [revision, queryClient])
  useEffect(() => {
    const cache = queryClient.getQueryCache()
    return cache.subscribe(() => {
      const queries = cache.findAll({ queryKey: ['map-page'] }).filter(q => !q.getObserversCount()).sort((a, b) => a.state.dataUpdatedAt - b.state.dataUpdatedAt)
      const excess = cache.findAll({ queryKey: ['map-page'] }).length - C.MAX_CACHED_TARGETS
      for (const q of queries.slice(0, Math.max(0, excess))) cache.remove(q)
    })
  }, [queryClient])
  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem('photo-globe-theme')
      const savedLanguage = localStorage.getItem('photo-globe-language')
      if (savedTheme === 'dark' || savedTheme === 'light') setTheme(savedTheme)
      if (savedLanguage === 'zh' || savedLanguage === 'en') setLanguage(savedLanguage)
    } catch {}
    setPreferencesReady(true)
  }, [])
  useEffect(() => {
    if (!preferencesReady) return
    try { localStorage.setItem('photo-globe-theme', theme); localStorage.setItem('photo-globe-language', language) } catch {}
  }, [theme, language, preferencesReady])
  useEffect(() => { document.body.classList.toggle('theme-light', theme === 'light') }, [theme])
  useEffect(() => { document.documentElement.lang = language }, [language])
  useEffect(() => {
    setOnLocateTrack(record => {
      map?.easeTo({ center: [record.decimalLongitude, record.decimalLatitude], zoom: Math.max(map.getZoom(), 8), duration: 1000 })
      keepHoverOpen(); setFeature(null); setSmallCluster(null); setSelected(record); setSelectionPinned(true)
    })
    return () => setOnLocateTrack(() => {})
  }, [map, setOnLocateTrack])
  const records = smallCluster?.records ?? page.data?.pages.flatMap(p => p.items) ?? []
  const total = smallCluster?.records.length ?? page.data?.pages[0]?.total
  const record = selected ?? (total === 1 ? records[0] : null)
  const coordinate = selectionCoordinates(feature, smallCluster, record)
  const selectFeature = useCallback((next: SelectedFeature, interaction: FeatureInteraction = 'click') => {
    if (interaction === 'hover' && selectionPinned) return
    if (next.properties.dataset_revision !== meta.data?.dataset.revision || next.properties.feature_schema_version !== FeatureSchemaConstants.CURRENT_FEATURE_SCHEMA_VERSION) {
      setNotice('地图版本不一致，请重新加载已验证的发布 / Map release mismatch')
      clearSelection(); void meta.refetch(); return
    }
    keepHoverOpen(); setNotice(''); setSmallCluster(null); setSelected(null); setSelectionPinned(interaction === 'click')
    setFeature(previous => previous && featureIdentity(previous) === featureIdentity(next) ? previous : next)
  }, [meta.data, selectionPinned])
  return <div className={`globe-page photo-globe-page theme-${theme}`}>
    <MapCanvas theme={theme} language={language} filter={filter} release={meta.data?.map} nativeMarkersReady={smallMap ? allSmallRecords.length === meta.data?.dataset.plottableCount : largeNativeReady} priorityFeatureIds={priorityFeatureIds} priorityRecord={priorityRecord} camera={meta.data?.dataset.mapCamera} onVisibleFeatures={setVisibleFeatures} onMapReady={setMap} onFeature={selectFeature} onDismiss={clearSelection} />
    {smallMap && smallClusters.map((cluster, index) => {
      const choose = (interaction: FeatureInteraction) => {
        if (interaction === 'hover' && selectionPinned) return
        keepHoverOpen(); setFeature(null); setSelectionPinned(interaction === 'click')
        if (cluster.records.length === 1) { setSmallCluster(null); setSelected(cluster.records[0]) } else { setSelected(null); setSmallCluster(cluster) }
      }
      return <MapMarker key={cluster.id} map={map} lngLat={cluster.coordinates}>
        {cluster.records.length > 1 ? <ClusterPin cluster={cluster} showPhoto={index < photos} language={language} onExpand={() => choose('click')} onHoverStart={() => choose('hover')} onHoverEnd={scheduleHoverClose} />
          : <PhotoPin record={cluster.records[0]} showPhoto={index < photos} selected={selected?.gbifId === cluster.records[0].gbifId} language={language} onSelect={() => choose('click')} onHoverStart={() => choose('hover')} onHoverEnd={scheduleHoverClose} />}
      </MapMarker>
    })}
    {!smallMap && largeNativeReady && visibleFeatures.filter(f => f.properties.dataset_revision === revision && Number(f.properties.kind === 'species' && (filter === 'Aves' || filter === 'Insecta') ? f.properties.occurrence_count : f.properties[countProperty(filter)] ?? 0) > 0).map((f, index) => {
      const candidate = recordMap.get(f.properties.representative_occurrence_id)
      const representative = candidate && (filter === 'all' || (filter === 'audio' ? candidate.media.some(media => media.kind === 'audio') : candidate.class === filter)) ? candidate : undefined
      const total = f.properties.kind === 'species' && (filter === 'Aves' || filter === 'Insecta') ? f.properties.occurrence_count : Number(f.properties[countProperty(filter)] ?? 0)
      const choose = (interaction: FeatureInteraction) => {
        if (interaction === 'hover' && selectionPinned) return
        keepHoverOpen(); setSmallCluster(null); setSelectionPinned(interaction === 'click')
        if (total === 1 && representative) { setFeature(f); setSelected(representative) } else selectFeature(f, interaction)
      }
      return <MapMarker key={featureIdentity(f)} map={map} lngLat={f.coordinates}>
        {total > 1 || !representative
          ? <ClusterPin cluster={{ coordinates: f.coordinates, records: representative ? [representative] : [], total }} showPhoto={filter !== 'audio' && index < photos} audioOnly={f.properties.audio_occurrence_count > 0} currentTrackInCluster={Boolean(currentTrack?.record && featureContainsRecord(f, currentTrack.record))} language={language} onExpand={() => choose('click')} onHoverStart={() => choose('hover')} onHoverEnd={scheduleHoverClose} />
          : <PhotoPin record={representative} showPhoto={filter !== 'audio' && index < photos} selected={selected?.gbifId === representative.gbifId} language={language} onSelect={() => choose('click')} onHoverStart={() => choose('hover')} onHoverEnd={scheduleHoverClose} />}
      </MapMarker>
    })}
    <MapControls filterOpen={filterOpen} ambientSoundActive={ambientOpen || (activeSource === 'ambient' && isPlaying)} theme={theme} language={language}
      onHome={() => map?.easeTo({ center: meta.data?.dataset.mapCamera?.center ?? GlobeView.CENTER, zoom: meta.data?.dataset.mapCamera?.zoom ?? GlobeView.ZOOM, pitch: 0, bearing: 0 })}
      onToggleFilter={() => { setFilterOpen(v => !v); setAmbientOpen(false) }}
      onToggleTheme={() => setTheme(v => v === 'dark' ? 'light' : 'dark')}
      onToggleLanguage={() => setLanguage(v => v === 'zh' ? 'en' : 'zh')}
      onToggleAmbientSound={() => { setAmbientOpen(v => !v); setFilterOpen(false) }}
      onZoomIn={() => map?.zoomIn()} onZoomOut={() => map?.zoomOut()} onResetBearing={() => map?.resetNorthPitch()} />
    {filterOpen && <FilterPanel activeFilter={filter} filterCounts={meta.data?.dataset.filterCounts} language={language}
      onSelect={value => { setFilter(value); clearSelection() }} onClose={() => setFilterOpen(false)} />}
    <FloatingAudioPlayer language={language} onOpenAmbientSettings={() => { setAmbientOpen(true); setFilterOpen(false) }} onLocateTrack={record => {
      map?.easeTo({ center: [record.decimalLongitude, record.decimalLatitude], zoom: Math.max(map.getZoom(), 8), duration: 1000 })
      keepHoverOpen(); setFeature(null); setSmallCluster(null); setSelected(record); setSelectionPinned(true)
    }} />
    <AmbientSoundPanel tracks={tracks.data} loading={tracks.isPending && Boolean(revision)} error={tracks.error?.message} isOpen={ambientOpen} language={language} onClose={() => setAmbientOpen(false)} />
    {(meta.isPending || meta.error || markerRecords.error || notice || page.isFetching || page.error) && <aside role="status" className="glass-control" style={{ position: 'absolute', top: 16, left: 16, maxWidth: 420 }}>
      {notice || meta.error?.message || markerRecords.error?.message || page.error?.message || '加载中 / Loading…'}
      {(meta.error || markerRecords.error || page.error) && <button onClick={() => { void meta.refetch(); void markerRecords.refetch(); if (feature) void page.refetch() }}>重试 / Retry</button>}
    </aside>}
    {coordinate && (record || smallCluster || (feature && page.data)) && <MapPopup map={map} coordinates={coordinate} onInteract={() => { keepHoverOpen(); setSelectionPinned(true) }}>
      {record ? <OccurrenceCard record={record} position={{ left: 0, top: 0 }} language={language} onHoverStart={keepHoverOpen} onHoverEnd={scheduleHoverClose} />
        : <OccurrenceList records={records} total={total ?? undefined} position={{ left: 0, top: 0 }} language={language}
          onHoverStart={keepHoverOpen} onHoverEnd={scheduleHoverClose} hasMore={!smallCluster && page.hasNextPage} loadingMore={page.isFetchingNextPage}
          onSelect={next => { keepHoverOpen(); setSelectionPinned(true); setSelected(next) }} onLoadMore={() => { void page.fetchNextPage() }} />}
    </MapPopup>}
  </div>
}
