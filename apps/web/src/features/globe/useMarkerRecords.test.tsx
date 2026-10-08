// @vitest-environment jsdom
import React from 'react'
import { renderHook, waitFor, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useMarkerRecords } from './useMarkerRecords.js'
afterEach(() => { cleanup();vi.unstubAllGlobals() })
describe('progressive representative records', () => {
  it('renders the first batch before slower batches complete and aborts an abandoned view', async () => {
    const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
    const requests: Array<{ids:string[];signal:AbortSignal;finish:() => void}> = []
    vi.stubGlobal('fetch',vi.fn((raw:string,options:{signal:AbortSignal}) => new Promise<Response>((resolve,reject) => {
      const ids=new URL(raw,'https://example.com').searchParams.get('ids')!.split(',')
      const finish=() => resolve(Response.json({datasetRevision:'r',items:ids.map(gbifId => ({gbifId,scientificName:'Bird',media:[]}))}))
      options.signal.addEventListener('abort',() => reject(new DOMException('Aborted','AbortError')))
      requests.push({ids,signal:options.signal,finish})
    })))
    const wrapper=({children}:{children:React.ReactNode}) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const hook=renderHook(({ids}) => useMarkerRecords('r',ids,false),{wrapper,initialProps:{ids:Array.from({length:32},(_,index) => String(index+1))}})
    await waitFor(() => expect(requests).toHaveLength(2))
    requests[0].finish()
    await waitFor(() => expect(hook.result.current.records.size).toBe(24))
    expect(requests[1].signal.aborted).toBe(false)
    hook.rerender({ids:['1000']})
    await waitFor(() => expect(requests[1].signal.aborted).toBe(true))
    expect(hook.result.current.records.size).toBe(0)
    hook.unmount();client.clear()
  })
})
