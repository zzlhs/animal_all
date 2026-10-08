export type Language = 'en' | 'zh'

export const dictionaries = {
  "en": {
    "app": {
      "title": "GBIF Wildlife Globe",
      "subtitle": "Exploration of species distribution across the globe"
    },
    "controls": {
      "home": "Reset map",
      "filter": "Filter observations",
      "useLight": "Use light map",
      "useDark": "Use dark map",
      "zoomIn": "Zoom in",
      "zoomOut": "Zoom out",
      "bearing": "Reset bearing",
      "switchToChinese": "Switch to Chinese",
      "switchToEnglish": "Switch to English",
      "ambientSound": "Open ambient sound"
    },
    "filters": {
      "title": "Occurrence Annotation",
      "subtitle": "View geographic distribution by taxonomy",
      "all": "Default",
      "allSubtitle": "Show every observation",
      "birds": "Birds",
      "birdsSubtitle": "Class Aves",
      "insects": "Insects",
      "insectsSubtitle": "Class Insecta",
      "audio": "Audio",
      "audioSubtitle": "Records with playable audio",
      "aria": "Occurrence annotation",
      "kingdom": "Kingdom",
      "kingdomSubtitle": "Animalia records",
      "count": "{count} observations visible"
    },
    "list": {
      "aria": "Cluster observations",
      "kicker": "Cluster observations",
      "title": "{count} observations",
      "hint": "Select an observation to view its details.",
      "footer": "{loaded} of {count} nearby records loaded",
      "loadMore": "Load more",
      "loading": "Loading…",
      "open": "Open {name}"
    },
    "card": {
      "openInGbif": "Open this observation on GBIF",
      "dateUnavailable": "Date unavailable",
      "uncertainty": "{value} m uncertainty",
      "coordinateUnavailable": "Coordinate precision unavailable",
      "audioSection": "Recordings",
      "videoSection": "Videos",
      "basis": {
        "MACHINE_OBSERVATION": "Machine observation",
        "MATERIAL_CITATION": "Material citation",
        "HUMAN_OBSERVATION": "Human observation",
        "PRESERVED_SPECIMEN": "Preserved specimen"
      }
    },
    "cluster": {
      "title": "Cluster observations ({count})",
      "viewAll": "View all records",
      "loadMore": "Load more",
      "loadingMore": "Loading more…",
      "noMore": "All records loaded"
    },
    "media": {
      "audio": "Audio",
      "video": "Video",
      "openSource": "Open media source",
      "cacheAndPlay": "Prepare & play",
      "cacheLoading": "Preparing audio…",
      "cacheRetry": "Retry audio download",
      "cacheHit": "Ready on ImageKit",
      "cacheStored": "Saved to ImageKit",
      "cacheStoreFailed": "Audio preparation failed",
      "cacheError": "Audio could not be downloaded",
      "imageCount": "{count} images",
      "playAudio": "Play audio",
      "playVideo": "Play video",
      "openGallery": "Open image gallery",
      "galleryThumbs": "Observation image thumbnails",
      "openImage": "Open image {index}",
      "galleryDialog": "Observation image gallery",
      "closeGallery": "Close image gallery",
      "previousImage": "Previous image",
      "nextImage": "Next image",
      "openOriginal": "Open original",
      "status": {
        "idle": "Ready to play",
        "preparing": "Preparing",
        "buffering": "Buffering",
        "playing": "Playing",
        "paused": "Paused",
        "failed": "Failed",
        "ended": "Finished"
      },
      "retry": "Retry",
      "queueLink": "Audio preparation progress",
      "firstResponseTimeout": "The audio source exceeded the first-response time limit. Retry to download again.",
      "idleTimeout": "Audio stopped arriving for longer than the idle time limit. Retry to download again.",
      "totalTimeout": "The audio download exceeded its total time limit. Retry to download again.",
      "sourceNotFound": "This recording no longer exists at its source.",
      "sourceForbidden": "The source denied access to this recording.",
      "sourceRateLimited": "The audio source is busy. The download will be retried.",
      "unsupportedAudio": "The file is not a supported audio format or cannot be decoded.",
      "fileTooLarge": "This recording exceeds the configured upload size limit.",
      "autoplayBlocked": "Your browser blocked playback. Click Retry to allow playback.",
      "imagekitAuthFailed": "ImageKit rejected authentication. Check the server configuration.",
      "imagekitNotConfigured": "ImageKit is not configured. The task is queued and will resume after configuration.",
      "uploadFailed": "The audio was downloaded, but its upload to ImageKit failed. Retry to prepare it again.",
      "uploadTimeout": "Uploading to ImageKit timed out. Retry to prepare it again.",
      "queueUnavailable": "The audio queue is temporarily unavailable. Please retry.",
      "invalidSource": "The audio source is not supported by the current source configuration.",
      "preparationTimeout": "Audio preparation is taking too long. View progress or retry.",
      "incompleteDownload": "The source connection closed before the recording was fully downloaded.",
      "networkError": "Audio could not be played because its network connection failed. Please retry."
    },
    "floatingPlayer": {
      "nowPlaying": "Now playing",
      "ambientEyebrow": "Nature soundscape",
      "ambientTitle": "Bird-call ambience",
      "ambientSingle": "Single call",
      "ambientMix": "Mixed calls ({count})",
      "remaining": "{time} remaining",
      "openSettings": "Ambient settings",
      "locate": "Locate on map",
      "locateTooltip": "Fly to this observation on the globe",
      "play": "Play",
      "pause": "Pause",
      "replay": "Replay",
      "close": "Close audio player",
      "progress": "Audio playback progress"
    },
    "ambient": {
      "eyebrow": "Nature soundscape",
      "title": "Bird-call ambience",
      "subtitle": "Loop one call or blend several calls from the globe.",
      "close": "Close ambient sound",
      "sources": "Calls to mix",
      "selectedCount": "{count} calls selected",
      "mixHint": "Choose 2–4 different calls for a gentle soundscape.",
      "mixMinimum": "Select at least {count} calls before starting a mix.",
      "mixMaximum": "Up to {count} calls can be mixed at once.",
      "duration": "Play for",
      "durationOption": "{count} minutes",
      "volume": "Volume",
      "remaining": "Time remaining",
      "loop": "Loops until the timer ends",
      "play": "Play ambience",
      "pause": "Pause",
      "resume": "Resume",
      "stop": "Stop",
      "loading": "Preparing audio…",
      "unavailable": "No playable animal calls are available.",
      "selectionError": "Choose a playable call before starting.",
      "error": "This call could not be played. Try another selection.",
      "partialError": "Some selected calls were unavailable; the rest are playing.",
      "mode": "Ambient sound mode",
      "single": "One call",
      "mix": "Mixed calls",
      "source": "Call"
    },
    "data": {
      "loading": "Loading dataset…",
      "ready": "Dataset ready",
      "errorTitle": "The scalable dataset could not be loaded",
      "errorBody": "Check that the API and PMTiles URL are reachable, then try again.",
      "retry": "Retry",
      "featureError": "Observation details could not be loaded.",
      "listError": "More observations could not be loaded.",
      "versionMismatch": "The map tiles and metadata use different dataset versions. Refresh the PMTiles configuration, then retry."
    },
    "marker": {
      "map": "Map",
      "unnamed": "Map marker",
      "named": "Map marker: {name}",
      "cluster": "Map marker cluster: {count} observations"
    }
  },
  "zh": {
    "app": {
      "title": "GBIF 生物多样性地球仪",
      "subtitle": "全球物种分布与多媒体声景探索"
    },
    "controls": {
      "home": "重置地图",
      "filter": "筛选观测记录",
      "useLight": "切换到浅色地图",
      "useDark": "切换到深色地图",
      "zoomIn": "放大地图",
      "zoomOut": "缩小地图",
      "bearing": "重置地图方向",
      "switchToChinese": "切换到中文",
      "switchToEnglish": "切换到英文",
      "ambientSound": "打开环境声"
    },
    "filters": {
      "title": "观测记录标注",
      "subtitle": "按分类查看地理分布",
      "all": "全部",
      "allSubtitle": "显示全部观测记录",
      "birds": "鸟类",
      "birdsSubtitle": "鸟纲记录",
      "insects": "昆虫",
      "insectsSubtitle": "昆虫纲记录",
      "audio": "音频",
      "audioSubtitle": "含可播放音频的记录",
      "aria": "观测记录标注",
      "kingdom": "界",
      "kingdomSubtitle": "动物界记录",
      "count": "当前显示 {count} 条观测记录"
    },
    "list": {
      "aria": "聚合点观测记录",
      "kicker": "聚合点观测记录",
      "title": "{count} 条观测记录",
      "hint": "选择一条记录查看详情。",
      "footer": "附近共 {count} 条，已加载 {loaded} 条",
      "loadMore": "加载更多",
      "loading": "加载中…",
      "open": "打开 {name}"
    },
    "card": {
      "openInGbif": "在 GBIF 中打开此观测记录",
      "dateUnavailable": "日期未知",
      "uncertainty": "{value} 米误差",
      "coordinateUnavailable": "坐标精度未知",
      "audioSection": "叫声音频",
      "videoSection": "视频影像",
      "basis": {
        "MACHINE_OBSERVATION": "机器观测",
        "MATERIAL_CITATION": "标本引用",
        "HUMAN_OBSERVATION": "人工观测",
        "PRESERVED_SPECIMEN": "保存标本"
      }
    },
    "cluster": {
      "title": "聚合观测记录 ({count})",
      "viewAll": "查看全部记录",
      "loadMore": "加载更多",
      "loadingMore": "正在加载…",
      "noMore": "已加载全部记录"
    },
    "media": {
      "audio": "音频",
      "video": "视频",
      "openSource": "打开媒体来源",
      "cacheAndPlay": "准备并播放",
      "cacheLoading": "正在准备音频…",
      "cacheRetry": "重新下载音频",
      "cacheHit": "音频已在 ImageKit 就绪",
      "cacheStored": "音频已保存到 ImageKit",
      "cacheStoreFailed": "音频准备失败",
      "cacheError": "音频下载失败",
      "imageCount": "{count} 张图片",
      "playAudio": "播放音频",
      "playVideo": "播放视频",
      "openGallery": "打开图片画廊",
      "galleryThumbs": "观测图片缩略图",
      "openImage": "打开第 {index} 张图片",
      "galleryDialog": "观测图片画廊",
      "closeGallery": "关闭图片画廊",
      "previousImage": "上一张图片",
      "nextImage": "下一张图片",
      "openOriginal": "打开原图",
      "status": {
        "idle": "等待播放",
        "preparing": "准备中",
        "buffering": "缓冲中",
        "playing": "播放中",
        "paused": "已暂停",
        "failed": "失败",
        "ended": "播放结束"
      },
      "retry": "重试",
      "queueLink": "音频预热进度",
      "firstResponseTimeout": "音频来源未在首次响应时限内响应，请重试下载。",
      "idleTimeout": "音频下载连续一段时间没有收到数据，请重试下载。",
      "totalTimeout": "音频下载超过总时限，请重试下载。",
      "sourceNotFound": "源站上的这条录音已经不存在。",
      "sourceForbidden": "源站拒绝访问这条录音。",
      "sourceRateLimited": "音频源站请求过多，下载任务将稍后重试。",
      "unsupportedAudio": "音频格式不受支持，或文件无法解码。",
      "fileTooLarge": "这条录音超过当前配置的上传大小上限。",
      "autoplayBlocked": "浏览器阻止了播放，请点击重试允许播放。",
      "imagekitAuthFailed": "ImageKit 身份验证失败，请检查服务端配置。",
      "imagekitNotConfigured": "尚未配置 ImageKit。任务已入队，配置完成后可继续处理。",
      "uploadFailed": "音频已下载，但上传 ImageKit 失败，请重试准备。",
      "uploadTimeout": "上传 ImageKit 超时，请重试准备。",
      "queueUnavailable": "音频任务队列暂时不可用，请重试。",
      "invalidSource": "当前来源配置不支持这条音频链接。",
      "preparationTimeout": "音频准备等待时间过长，请查看任务进度或重试。",
      "incompleteDownload": "录音尚未完整下载，源站连接就已中断。",
      "networkError": "音频网络连接失败，暂时无法播放，请重试。"
    },
    "floatingPlayer": {
      "nowPlaying": "正在播放",
      "ambientEyebrow": "自然声景",
      "ambientTitle": "鸟鸣环境声",
      "ambientSingle": "单一鸟鸣",
      "ambientMix": "混合鸟鸣 ({count}种)",
      "remaining": "剩余 {time}",
      "openSettings": "环境声设置",
      "locate": "地图定位",
      "locateTooltip": "在地球仪上飞跃定位到该观测点",
      "play": "播放",
      "pause": "暂停",
      "replay": "重播",
      "close": "关闭音频播放器",
      "progress": "音频播放进度"
    },
    "ambient": {
      "eyebrow": "自然声景",
      "title": "鸟鸣环境声",
      "subtitle": "循环单段鸟鸣，或混合多种地球仪中的鸟鸣。",
      "close": "关闭环境声",
      "sources": "混合声音",
      "selectedCount": "已选择 {count} 种鸟鸣",
      "mixHint": "选择 2–4 种不同鸟鸣，形成柔和的环境声。",
      "mixMinimum": "至少选择 {count} 种鸟鸣后才能混合播放。",
      "mixMaximum": "一次最多混合 {count} 种鸟鸣。",
      "duration": "播放时长",
      "durationOption": "{count} 分钟",
      "volume": "音量",
      "remaining": "剩余时间",
      "loop": "将在倒计时结束前循环播放",
      "play": "播放环境声",
      "pause": "暂停",
      "resume": "继续播放",
      "stop": "停止",
      "loading": "正在准备音频…",
      "unavailable": "没有可播放的动物叫声。",
      "selectionError": "请先选择一段可播放的叫声。",
      "error": "这段声音暂时无法播放，请更换选择后重试。",
      "partialError": "部分声音无法播放，其余声音仍在循环播放。",
      "mode": "环境声模式",
      "single": "单一鸟鸣",
      "mix": "混合鸟鸣",
      "source": "声音来源"
    },
    "data": {
      "loading": "正在加载数据集…",
      "ready": "数据集已就绪",
      "errorTitle": "无法加载大规模数据集",
      "errorBody": "请检查 API 与 PMTiles 地址是否可访问，然后重试。",
      "retry": "重试",
      "featureError": "无法加载观测记录详情。",
      "listError": "无法继续加载观测记录。",
      "versionMismatch": "地图瓦片与元数据的数据版本不一致，请更新 PMTiles 配置后重试。"
    },
    "marker": {
      "map": "地图",
      "unnamed": "地图标记",
      "named": "地图标记：{name}",
      "cluster": "地图聚合点：{count} 条观测记录"
    }
  }
} as const

export function normalizeLanguage(lang?: string | null): Language {
  return String(lang || '').toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

export function localeFor(lang?: string | null): string {
  return normalizeLanguage(lang) === 'zh' ? 'zh-CN' : 'en-US'
}

export function translate(language: string, path: string, params: Record<string, string | number> = {}): string {
  const lang = normalizeLanguage(language)
  const dict = dictionaries[lang]
  const keys = path.split('.')
  let current: any = dict

  for (const k of keys) {
    if (current && typeof current === 'object' && k in current) {
      current = current[k]
    } else {
      // fallback to English
      current = undefined
      break
    }
  }

  if (current === undefined) {
    let fallback: any = dictionaries.en
    for (const k of keys) {
      if (fallback && typeof fallback === 'object' && k in fallback) {
        fallback = fallback[k]
      } else {
        return path
      }
    }
    current = fallback
  }

  let text = String(current ?? path)
  for (const [key, val] of Object.entries(params)) {
    text = text.replace(new RegExp(`\\{${key}\\}`, 'g'), String(val))
  }
  return text
}

export function formatLocation(record: { locality?: string | null; stateProvince?: string | null; country?: string | null; countryCode?: string | null }, language: string): string {
  const isZh = normalizeLanguage(language) === 'zh'
  const parts: string[] = []
  if (record.locality) parts.push(record.locality.trim())
  if (record.stateProvince) parts.push(record.stateProvince.trim())
  if (record.country) parts.push(record.country.trim())

  if (parts.length === 0) {
    return isZh ? '位置未知' : 'Location unavailable'
  }

  return isZh ? parts.reverse().join('，') : parts.join(', ')
}

export function formatEventDate(eventDate?: string | null, language = 'en'): string {
  if (!eventDate) return ''
  const isZh = normalizeLanguage(language) === 'zh'
  try {
    const d = new Date(eventDate)
    if (Number.isNaN(d.getTime())) return eventDate
    return d.toLocaleDateString(isZh ? 'zh-CN' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return eventDate
  }
}

export function translateBasis(language: string, basis?: string | null): string {
  if (!basis) return ''
  const isZh = normalizeLanguage(language) === 'zh'
  if (!isZh) return basis

  const map: Record<string, string> = {
    HUMAN_OBSERVATION: '人工观测',
    MACHINE_OBSERVATION: '机器观测',
    PRESERVED_SPECIMEN: '标本馆标本',
    FOSSIL_SPECIMEN: '化石标本',
    LIVING_SPECIMEN: '活体样本',
    MATERIAL_SAMPLE: '材料样本',
    OCCURRENCE: '分布记录',
  }

  return map[basis.toUpperCase()] || basis
}
