/**
 * ty LSP Service
 *
 * Creates and manages the LSP client connection to the ty worker.
 */

import { LSPClient, languageServerExtensions } from '@codemirror/lsp-client'
import { WebWorkerTransport } from './WebWorkerTransport'
import type { PythonVersion } from '../../App'

let client: LSPClient | null = null
let transport: WebWorkerTransport | null = null
let currentPythonVersion: PythonVersion = '3.12'

export interface TyLSPOptions {
  pythonVersion?: PythonVersion
  documentUri?: string
  rootUri?: string
}

/**
 * Create and initialize a ty LSP client
 */
export async function createTyLSPClient(options: TyLSPOptions = {}): Promise<LSPClient> {
  const {
    pythonVersion = '3.12',
    rootUri = 'file:///'
  } = options

  // Close any existing client and transport FIRST
  if (client) {
    client.disconnect()
    client = null
  }
  if (transport) {
    transport.close()
    transport = null
  }

  currentPythonVersion = pythonVersion

  // Create the LSP client with all language server extensions
  const newClient = new LSPClient({
    rootUri,
    workspace: undefined,
    timeout: 10000, // 10 seconds timeout
    extensions: languageServerExtensions()
  })

  // Create worker transport
  const newTransport = new WebWorkerTransport({
    worker: new URL('../../workers/tyWorker.ts', import.meta.url),
    workerOptions: { type: 'module' },
    onError: (error) => {
      console.error('[LSP] ty worker error:', error)
    },
    onClose: () => {
      console.log('[LSP] ty worker connection closed')
    }
  })

  // Connect the client to the transport and wait for initialization
  newClient.connect(newTransport)
  await newClient.initializing

  // Only assign to module-level variables after successful initialization
  client = newClient
  transport = newTransport

  return client
}

/**
 * Get the current LSP client instance
 */
export function getTyLSPClient(): LSPClient | null {
  return client
}

/**
 * Update the Python version for the LSP server
 */
export async function updatePythonVersion(version: PythonVersion): Promise<void> {
  if (currentPythonVersion === version) {
    return
  }

  currentPythonVersion = version

  // For now, we need to recreate the client with the new Python version
  // A future optimization could add a custom LSP method to update the version
  if (client) {
    await closeTyLSPClient()
    await createTyLSPClient({ pythonVersion: version })
  }
}

/**
 * Close the LSP client and cleanup
 */
export async function closeTyLSPClient(): Promise<void> {
  if (client) {
    client.disconnect()
    client = null
  }
  if (transport) {
    transport.close()
    transport = null
  }
}
