import {
  COMPANION_PROTOCOL_VERSION,
  type CompanionCapability,
  type CompanionConnectionState,
  type CompanionHandshakeResponse,
} from './protocol'

export type CompanionStatus = {
  state: CompanionConnectionState
  endpoint: string | null
  capabilities: CompanionCapability[]
  protocolVersion: typeof COMPANION_PROTOCOL_VERSION
  notice: string
}

export function createDisconnectedCompanionStatus(): CompanionStatus {
  return {
    state: 'disconnected',
    endpoint: null,
    capabilities: [],
    protocolVersion: COMPANION_PROTOCOL_VERSION,
    notice:
      'No Local Companion is paired. Browser sandbox mode is active; local PTY, CLI auth, and disk write-back require pairing a local companion daemon.',
  }
}

export async function probeCompanionEndpoint(
  endpoint: string,
  fetchFn: typeof fetch = fetch,
): Promise<CompanionStatus> {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return {
      ...createDisconnectedCompanionStatus(),
      state: 'error',
      notice: 'Invalid companion endpoint URL.',
    }
  }

  // Only loopback endpoints are permitted for direct local companion pairing
  if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost' && url.hostname !== '[::1]') {
    return {
      ...createDisconnectedCompanionStatus(),
      state: 'error',
      notice: 'Direct companion probing is restricted to loopback hosts.',
    }
  }

  try {
    const response = await fetchFn(`${url.origin}/v1/handshake`, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'error',
    })
    if (!response.ok) {
      throw new Error(`Companion returned ${response.status}`)
    }
    const payload = (await response.json()) as CompanionHandshakeResponse
    if (payload.version !== COMPANION_PROTOCOL_VERSION) {
      throw new Error(`Unsupported companion protocol version: ${payload.version}`)
    }
    return {
      state: payload.state,
      endpoint: url.origin,
      capabilities: payload.capabilities,
      protocolVersion: COMPANION_PROTOCOL_VERSION,
      notice: `Connected to companion ${payload.companionId} (${payload.platform}).`,
    }
  } catch (error) {
    return {
      ...createDisconnectedCompanionStatus(),
      state: 'disconnected',
      notice: error instanceof Error ? error.message : 'Unable to reach local companion daemon.',
    }
  }
}
