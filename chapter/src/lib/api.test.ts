import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NO_SERVER, probeServer, resetServerProbe, serverFeatures } from './api'

beforeEach(resetServerProbe)

describe('probeServer', () => {
  it('reports what the deployment actually has', async () => {
    const f = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, transcribe: true, grade: false }), { status: 200 }),
    ) as unknown as typeof fetch
    expect(await probeServer(f)).toEqual({ transcribe: true, grade: false })
  })

  it('reports nothing on a static host with no functions', async () => {
    const f = vi.fn(async () => new Response('<html>404</html>', { status: 404 })) as unknown as typeof fetch
    expect(await probeServer(f)).toEqual(NO_SERVER)
  })

  it('reports nothing when offline', async () => {
    const f = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    expect(await probeServer(f)).toEqual(NO_SERVER)
  })

  it('reports nothing when the body is not what we expect', async () => {
    const f = vi.fn(async () => new Response('null', { status: 200 })) as unknown as typeof fetch
    expect(await probeServer(f)).toEqual(NO_SERVER)
  })

  it('treats a missing flag as absent rather than present', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })) as unknown as typeof fetch
    expect(await probeServer(f)).toEqual(NO_SERVER)
  })
})

describe('serverFeatures', () => {
  it('asks once per launch, not once per screen', async () => {
    const f = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, transcribe: true, grade: true }), { status: 200 }),
    ) as unknown as typeof fetch
    await Promise.all([serverFeatures(f), serverFeatures(f), serverFeatures(f)])
    await serverFeatures(f)
    expect(f).toHaveBeenCalledTimes(1)
  })
})
