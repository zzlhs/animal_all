import React, { useEffect, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AudioQueueConstants as C, type AudioQueueSnapshot } from '@gbif-globe/contracts'
import { audioErrorMessage, AudioPreparationError } from '../features/media/audioCache.js'
import { translate } from '../i18n/i18n.js'

export const Route = createFileRoute('/audio-prewarm')({ component: AudioPrewarmPage })
function bytes(value: number) {
  return value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(2)} GiB`
    : value >= 1024 ** 2 ? `${(value / 1024 ** 2).toFixed(2)} MiB` : `${(value / 1024).toFixed(1)} KiB`
}
function AudioPrewarmPage() {
  const [language, setLanguage] = useState('zh')
  const [retrying, setRetrying] = useState('')
  const [message, setMessage] = useState('')
  const queryClient = useQueryClient()
  useEffect(() => { try { setLanguage(localStorage.getItem('photo-globe-language') || 'zh') } catch {} }, [])
  const zh = language === 'zh'
  const data = useQuery({ queryKey: ['audio-queue'], refetchInterval: C.SNAPSHOT_POLL_MS,
    queryFn: async ({ signal }): Promise<AudioQueueSnapshot> => {
      const response = await fetch(C.ROUTE, { signal, cache: 'no-store' })
      if (!response.ok) throw new AudioPreparationError('QUEUE_UNAVAILABLE')
      return response.json()
    } })
  const retry = async (mediaId: string) => {
    setRetrying(mediaId); setMessage('')
    try {
      const response = await fetch(C.ROUTE, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaIds: [mediaId], priority: 'playback', retry: true }) })
      const result = await response.json()
      if (!response.ok) throw new AudioPreparationError(result.code)
      await queryClient.invalidateQueries({ queryKey: ['audio-queue'] })
    } catch (error) { setMessage(translate(language, audioErrorMessage(error))) }
    finally { setRetrying('') }
  }
  const labels: Record<string, string> = zh ? { total: '总任务数', ready: '已完成', queued: '等待下载', downloading: '下载中', uploading: '上传中', failed: '失败', storedBytes: 'ImageKit 已存储容量' }
    : { total: 'Total tasks', ready: 'Complete', queued: 'Queued', downloading: 'Downloading', uploading: 'Uploading', failed: 'Failed', storedBytes: 'Stored on ImageKit' }
  const statuses: Record<string, string> = zh ? { queued: '等待下载', downloading: '下载中', uploading: '上传 ImageKit', ready: '已就绪', failed: '失败' }
    : { queued: 'Queued', downloading: 'Downloading', uploading: 'Uploading to ImageKit', ready: 'Ready', failed: 'Failed' }
  return <main className="audio-prewarm-page">
    <header><Link to="/">← {zh ? '返回地球仪' : 'Back to globe'}</Link>
      <h1>{zh ? '音频预热进度' : 'Audio preparation progress'}</h1>
      <p>{zh ? '打开录音详情会提前准备音频；点击播放和主动启动声景会提高任务优先级。完成后从 ImageKit 播放。' : 'Opening recording details prepares audio. Playback and soundscapes receive the highest priority. Completed audio plays from ImageKit.'}</p>
    </header>
    {(message || data.error) && <p role="alert">{message || translate(language, audioErrorMessage(data.error))}</p>}
    {data.isPending && <p role="status">{zh ? '正在读取队列…' : 'Loading queue…'}</p>}
    {data.data && <>
      {!data.data.configured && <p role="alert">{translate(language, 'media.imagekitNotConfigured')}</p>}
      {data.data.configured && !data.data.workerActive && data.data.totals.queued > 0 && <p role="status">{zh ? '等待音频 Worker 处理任务。' : 'Waiting for the audio worker.'}</p>}
      <div className="audio-prewarm-page__totals">{Object.entries(data.data.totals).map(([key, value]) => <div key={key}><span>{labels[key]}</span><strong>{key === 'storedBytes' ? bytes(value) : value.toLocaleString()}</strong></div>)}</div>
      <p className="audio-prewarm-page__hint">{zh ? '容量统计为本队列成功上传的音频原文件大小。任务按来源链接去重，列表显示最近 100 条。' : 'Storage counts original audio bytes uploaded by this queue. Sources are deduplicated. The list shows the latest 100 tasks.'}</p>
      <div className="audio-prewarm-page__table"><table><thead><tr>{(zh ? ['录音 / 来源', '优先级', '状态', '下载进度', '尝试次数', '失败原因 / 操作'] : ['Recording / source', 'Priority', 'Status', 'Download', 'Attempts', 'Failure / action']).map(label => <th key={label}>{label}</th>)}</tr></thead>
        <tbody>{data.data.jobs.map(job => <tr key={job.id}>
          <td>{job.scientificName}<small>{job.sourceHost} · GBIF {job.gbifId}</small></td>
          <td>{job.priority === C.PLAYBACK_PRIORITY ? zh ? '主动播放' : 'Playback' : zh ? '详情预热' : 'Details'}</td>
          <td>{statuses[job.status]}</td><td>{bytes(job.receivedBytes)}{job.totalBytes ? ` / ${bytes(job.totalBytes)}` : ''}</td>
          <td>{job.attempts}</td><td>{job.errorCode && <><span>{translate(language, audioErrorMessage(new AudioPreparationError(job.errorCode)))}</span>
            <small>{job.errorCode}: {job.errorMessage}</small>{job.nextAttemptAt && <small>{zh ? '下次尝试：' : 'Next attempt: '}{new Date(job.nextAttemptAt).toLocaleTimeString()}</small>}</>}
            {job.status === 'failed' && <button disabled={Boolean(retrying)} onClick={() => void retry(job.mediaId)}>{translate(language, 'media.retry')}</button>}
            {job.playbackUrl && <a href={job.playbackUrl} target="_blank" rel="noreferrer">{zh ? '打开音频' : 'Open audio'}</a>}</td>
        </tr>)}</tbody></table></div>
      {!data.data.totals.total && <p>{zh ? '暂时没有任务。打开一条带音频的记录详情，或点击播放即可开始。' : 'No tasks yet. Open a recording’s details or start playback.'}</p>}
    </>}
  </main>
}
