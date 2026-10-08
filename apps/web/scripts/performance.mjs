import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const args = Object.fromEntries(process.argv.slice(2).map(argument => argument.replace(/^--/, '').split('=')))
const base = args.url || 'http://127.0.0.1:4318'
const output = resolve(args.output || 'docs/acceptance/loading-performance.json')
const viewport = { width: Number(args.width || 1280), height: Number(args.height || 720) }
const duration = Number(args.duration || 30) * 1000
const browser = await chromium.launch({
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }),
  headless: true,
  args: ['--enable-webgl', '--ignore-gpu-blocklist'],
})
const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
const reports = []
try {
  for (const cache of ['cold', 'warm']) {
    const page = await context.newPage()
    const requests = new Map(), resources = [], errors = []
    const cdp = await context.newCDPSession(page)
    await cdp.send('Network.enable')
    cdp.on('Network.requestWillBeSent', event => requests.set(event.requestId, { url: event.request.url, start: event.timestamp, type: event.type }))
    cdp.on('Network.responseReceived', event => {
      const request = requests.get(event.requestId)
      if (request) Object.assign(request, { status: event.response.status, mime: event.response.mimeType, diskCache: event.response.fromDiskCache, headers: event.response.headers })
    })
    cdp.on('Network.loadingFinished', event => {
      const request = requests.get(event.requestId)
      if (request) resources.push({ ...request, durationMs: Math.round((event.timestamp - request.start) * 1000), transferredBytes: event.encodedDataLength })
      requests.delete(event.requestId)
    })
    cdp.on('Network.loadingFailed', event => {
      const request = requests.get(event.requestId)
      if (request) errors.push({ url: request.url, error: event.errorText, cancelled: event.canceled })
      requests.delete(event.requestId)
    })
    page.on('pageerror', error => errors.push({ error: error.message }))
    await page.addInitScript(() => {
      window.__loadingMeasurements = { firstMarkerMs: null, firstImageMs: null }
      const observer = new MutationObserver(() => {
        if (document.querySelector('.map-marker-host button') && window.__loadingMeasurements.firstMarkerMs == null) window.__loadingMeasurements.firstMarkerMs = performance.now()
      })
      observer.observe(document, { childList: true, subtree: true })
      document.addEventListener('load', event => {
        if (event.target instanceof HTMLImageElement && event.target.closest('.map-marker-host') && window.__loadingMeasurements.firstImageMs == null) window.__loadingMeasurements.firstImageMs = performance.now()
      }, true)
    })
    const started = Date.now()
    await page.goto(base, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(Math.max(0, duration - (Date.now() - started)))
    const snapshot = await page.evaluate(() => ({
      ...window.__loadingMeasurements,
      marks: Object.fromEntries(performance.getEntriesByType('mark').map(mark => [mark.name, Math.round(mark.startTime)])),
      domMarkers: document.querySelectorAll('.map-marker-host').length,
      alerts: [...document.querySelectorAll('[role="alert"]')].map(element => element.textContent),
      images: [...document.querySelectorAll('.map-marker-host img')].map(image => ({ url: image.src, loaded: image.complete && image.naturalWidth > 0, width: image.naturalWidth })),
      navigation: performance.getEntriesByType('navigation')[0]?.toJSON(),
    }))
    const initialResources = [...resources], initialErrors = [...errors], initialPending = [...requests.values()]
    await mkdir(resolve(output, '..'), { recursive: true })
    await page.screenshot({ path: output.replace(/\.json$/, `-${cache}.png`) })
    let detailMs = null
    const button = page.locator('.map-marker-host button').filter({ visible: true }).first()
    if (await button.count()) {
      const click = Date.now()
      await button.click({ timeout: 5000 }).catch(() => {})
      await page.locator('.map-occurrence-popup .occurrence-card, .map-occurrence-popup .occurrence-list, .occurrence-card, .occurrence-list').first().waitFor({ state: 'visible', timeout: 10000 }).then(() => { detailMs = Date.now() - click }).catch(() => {})
    }
    await page.screenshot({ path: output.replace(/\.json$/, `-${cache}-detail.png`) })
    const report = { cache, viewport, sampleDurationMs: duration, ...snapshot, detailMs, transferredBytes: initialResources.reduce((sum, item) => sum + item.transferredBytes, 0), resources:initialResources, pending:initialPending, errors:initialErrors, detailResources:resources.slice(initialResources.length) }
    reports.push(report)
    console.log(JSON.stringify({ cache, firstMarkerMs: snapshot.firstMarkerMs, firstImageMs: snapshot.firstImageMs, domMarkers: snapshot.domMarkers, transferredMiB: +(report.transferredBytes / 1048576).toFixed(2), detailMs, errors: errors.length }))
    await page.close()
  }
  await writeFile(output, JSON.stringify({ measuredAt: new Date().toISOString(), base, reports }, null, 2))
  console.log(`Saved ${output}`)
  if (args.verify === 'true') {
    for (const report of reports) {
      if (!report.firstMarkerMs || report.domMarkers === 0 || report.alerts.length || report.errors.some(error => !error.cancelled)) throw new Error(`Loading verification failed (${report.cache}); inspect ${output}`)
      if (report.images.some(image => /\/original\./.test(image.url) || image.width > 128)) throw new Error('Map pins loaded original images')
    }
  }
} finally { await context.close(); await browser.close() }
