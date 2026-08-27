const messages = {
  en: {
    controls: {
      home: 'Reset map',
      filter: 'Filter observations',
      useLight: 'Use light map',
      useDark: 'Use dark map',
      zoomIn: 'Zoom in',
      zoomOut: 'Zoom out',
      bearing: 'Reset bearing',
      switchToChinese: 'Switch to Chinese',
      switchToEnglish: 'Switch to English',
    },
    filters: {
      aria: 'Occurrence annotation',
      title: 'Occurrence Annotation',
      subtitle: 'View geographic distribution by taxonomy',
      all: 'Default',
      allSubtitle: 'Show every observation',
      kingdom: 'Kingdom',
      kingdomSubtitle: 'Animalia records',
      birds: 'Birds',
      birdsSubtitle: 'Class Aves',
      insects: 'Insects',
      insectsSubtitle: 'Class Insecta',
      audio: 'Audio',
      audioSubtitle: 'Records with playable audio',
      count: '{count} observations visible',
    },
    list: {
      aria: 'Cluster observations',
      kicker: 'Cluster observations',
      title: '{count} observations',
      hint: 'Select an observation to view its details.',
      footer: '{count} nearby records',
      open: 'Open {name}',
    },
    card: {
      dateUnavailable: 'Date unavailable',
      coordinateUnavailable: 'Coordinate precision unavailable',
      uncertainty: '{value} m uncertainty',
      openInGbif: 'Open this observation on GBIF',
      basis: {
        MACHINE_OBSERVATION: 'Machine observation',
        MATERIAL_CITATION: 'Material citation',
        HUMAN_OBSERVATION: 'Human observation',
        PRESERVED_SPECIMEN: 'Preserved specimen',
      },
    },
    media: {
      imageCount: '{count} images',
      audio: 'Audio',
      video: 'Video',
      playAudio: 'Play audio',
      playVideo: 'Play video',
      openSource: 'Open media source',
      cacheAndPlay: 'Cache & play',
      cacheLoading: 'Downloading audio for offline replay…',
      cacheRetry: 'Retry audio download',
      cacheError: 'Audio could not be downloaded',
      cacheHit: 'Playing from this browser’s cache',
      cacheStored: 'Saved in this browser for later playback',
      cacheStoreFailed: 'Playing now, but browser storage was unavailable',
    },
    marker: {
      map: 'Map',
      unnamed: 'Map marker',
      named: 'Map marker: {name}',
      cluster: 'Map marker cluster: {count} observations',
    },
  },
  zh: {
    controls: {
      home: '重置地图',
      filter: '筛选观测记录',
      useLight: '切换到浅色地图',
      useDark: '切换到深色地图',
      zoomIn: '放大地图',
      zoomOut: '缩小地图',
      bearing: '重置地图方向',
      switchToChinese: '切换到中文',
      switchToEnglish: '切换到英文',
    },
    filters: {
      aria: '观测记录标注',
      title: '观测记录标注',
      subtitle: '按分类查看地理分布',
      all: '全部',
      allSubtitle: '显示全部观测记录',
      kingdom: '界',
      kingdomSubtitle: '动物界记录',
      birds: '鸟类',
      birdsSubtitle: '鸟纲记录',
      insects: '昆虫',
      insectsSubtitle: '昆虫纲记录',
      audio: '音频',
      audioSubtitle: '含可播放音频的记录',
      count: '当前显示 {count} 条观测记录',
    },
    list: {
      aria: '聚合点观测记录',
      kicker: '聚合点观测记录',
      title: '{count} 条观测记录',
      hint: '选择一条记录查看详情。',
      footer: '附近 {count} 条记录',
      open: '打开 {name}',
    },
    card: {
      dateUnavailable: '日期未知',
      coordinateUnavailable: '坐标精度未知',
      uncertainty: '{value} 米误差',
      openInGbif: '在 GBIF 中打开此观测记录',
      basis: {
        MACHINE_OBSERVATION: '机器观测',
        MATERIAL_CITATION: '标本引用',
        HUMAN_OBSERVATION: '人工观测',
        PRESERVED_SPECIMEN: '保存标本',
      },
    },
    media: {
      imageCount: '{count} 张图片',
      audio: '音频',
      video: '视频',
      playAudio: '播放音频',
      playVideo: '播放视频',
      openSource: '打开媒体来源',
      cacheAndPlay: '缓存并播放',
      cacheLoading: '正在下载音频并写入浏览器缓存…',
      cacheRetry: '重新下载音频',
      cacheError: '音频下载失败',
      cacheHit: '正在从此浏览器的缓存中读取',
      cacheStored: '已保存到此浏览器，后续可直接播放',
      cacheStoreFailed: '本次可以播放，但浏览器缓存写入失败',
    },
    marker: {
      map: '地图',
      unnamed: '地图标记',
      named: '地图标记：{name}',
      cluster: '地图聚合点：{count} 条观测记录',
    },
  },
}

export function normalizeLanguage(language) {
  return language === 'zh' ? 'zh' : 'en'
}

export function localeFor(language) {
  return normalizeLanguage(language) === 'zh' ? 'zh-CN' : 'en'
}

export function translate(language, key, values = {}) {
  const locale = messages[normalizeLanguage(language)]
  const value = key.split('.').reduce((current, part) => current?.[part], locale)
  if (typeof value !== 'string') return key
  return value.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? `{${name}}`))
}

export function translateBasis(language, value) {
  if (!value) return ''
  const key = `card.basis.${value}`
  const translated = translate(language, key)
  return translated === key ? value.replaceAll('_', ' ').toLowerCase() : translated
}
