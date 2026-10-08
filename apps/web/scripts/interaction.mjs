import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const base=process.argv[2] || 'http://127.0.0.1:4318'
const output=resolve(process.argv[3] || 'docs/acceptance/2026-10-08/interaction.json')
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']})
const results=[]
async function checkMarkers(page, limit) {
  const positions = await page.locator('.map-marker-host button').evaluateAll(buttons => buttons.map(button => {
    const rect = button.getBoundingClientRect()
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
  }))
  assert(positions.length > 0 && positions.length <= limit, `Marker budget: ${positions.length}/${limit}`)
  for (let i = 0; i < positions.length; i++) for (let j = i + 1; j < positions.length; j++) {
    assert(Math.hypot(positions[i].x - positions[j].x, positions[i].y - positions[j].y) >= 50, 'Marker circles overlap')
  }
  const controls = await page.locator('.control-top-left, .control-top-right, .control-zoom').evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect()
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
  }))
  for (const point of positions) assert(!controls.some(rect => point.x >= rect.left - 28 && point.x <= rect.right + 28 && point.y >= rect.top - 28 && point.y <= rect.bottom + 28), 'A marker is obscured by map controls')
  return positions.length
}
await mkdir(resolve(output,'..'),{recursive:true})
try {
  for (const viewport of [{width:1280,height:720},{width:390,height:844}]) {
    const context=await browser.newContext({viewport,deviceScaleFactor:1})
    await context.addInitScript(() => { localStorage.setItem('photo-globe-language','en');localStorage.setItem('photo-globe-theme','dark') })
    const page=await context.newPage(),errors=[]
    page.on('pageerror',error => errors.push(error.message))
    await page.goto(base,{waitUntil:'domcontentloaded'})
    await page.waitForFunction(() => document.querySelectorAll('.map-marker-host button').length > 0)
    await page.waitForTimeout(1000)
    const markers=await checkMarkers(page,32)
    // Select a smaller cluster to exercise list → detail while preserving the clicked anchor.
    const choices=await page.locator('.map-marker-host button').evaluateAll(buttons => buttons.map((button,index) => ({index,count:Number(button.querySelector('.photo-pin__count')?.textContent || 1)})))
    const chosen=choices.sort((a,b) => a.count-b.count)[0]
    await page.locator('.map-marker-host button').nth(chosen.index).click()
    const popup=page.locator('.map-occurrence-popup')
    await popup.waitFor({state:'visible'})
    const row=page.locator('.map-occurrence-popup .occurrence-list__item').first()
    if(await row.count())await row.click()
    await page.locator('.map-occurrence-popup .occurrence-card').waitFor({state:'visible'})
    const title=await page.locator('.map-occurrence-popup h3').innerText()
    await page.waitForTimeout(300)
    const anchor=await page.locator('.map-selected-location').boundingBox()
    const rectangle=await popup.boundingBox()
    await page.screenshot({path:output.replace(/\.json$/,`-${viewport.width}-bounds.png`)})
    assert(anchor && rectangle)
    assert(rectangle.x>=0 && rectangle.x+rectangle.width<=viewport.width+1,'Popup exceeds horizontal bounds')
    assert(rectangle.y>=0 && rectangle.y+rectangle.height<=viewport.height+1,'Popup exceeds vertical bounds')
    const drag=viewport.width>800 ? {from:[180,220],to:[280,260]} : {from:[160,710],to:[215,740]}
    await page.mouse.move(...drag.from);await page.mouse.down();await page.mouse.move(...drag.to,{steps:12});await page.mouse.up()
    await page.waitForTimeout(600)
    assert.equal(await page.locator('.map-occurrence-popup h3').innerText(),title,'Map drag replaced clicked selection')
    const moved=await page.locator('.map-selected-location').boundingBox()
    assert(Math.hypot(moved.x-anchor.x,moved.y-anchor.y)>10,'Popup anchor did not follow map movement')
    await page.screenshot({path:output.replace(/\.json$/,`-${viewport.width}-popup.png`)})
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => !document.querySelector('.map-occurrence-popup') && !document.querySelector('.map-selected-location'))
    await page.getByRole('button',{name:'Use light map',exact:true}).click()
    await page.waitForFunction(() => document.body.classList.contains('theme-light'))
    await page.screenshot({path:output.replace(/\.json$/,`-${viewport.width}-light.png`)})
    await page.getByRole('button',{name:'Use dark map',exact:true}).click()
    await page.getByRole('button',{name:'Filter observations',exact:true}).click()
    await page.locator('.filter-panel__option').filter({hasText:'Audio'}).click()
    await page.getByRole('button',{name:'Close filters',exact:true}).click()
    await page.getByRole('button',{name:'Zoom in',exact:true}).click()
    await page.waitForTimeout(400)
    await page.getByRole('button',{name:'Zoom in',exact:true}).click()
    await page.waitForFunction(() => !!document.querySelector('.map-marker-host .lucide-audio-lines'))
    await page.waitForTimeout(700)
    const audioMarkers=await checkMarkers(page,64)
    const audioMarker=page.locator('.map-marker-host button').filter({has:page.locator('.lucide-audio-lines')}).first()
    await audioMarker.click()
    await page.locator('.map-occurrence-popup .cached-audio-player__action').first().waitFor({state:'visible'})
    await page.screenshot({path:output.replace(/\.json$/,`-${viewport.width}-audio.png`)})
    assert.equal(await page.locator('[role="alert"]').count(),0,'Map reported a resource error')
    assert.deepEqual(errors,[])
    const result={viewport,markers,audioMarkers,title,popupFits:true,popupFollowsMap:true,audioDetails:true,themeRoundTrip:true,controlsClear:true,errors}
    results.push(result);console.log(JSON.stringify(result))
    await context.close()
  }
  await writeFile(output,JSON.stringify({measuredAt:new Date().toISOString(),base,results},null,2))
}finally{await browser.close()}
