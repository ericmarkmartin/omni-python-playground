/**
 * BasedPyright LSP Service
 *
 * Creates and manages the LSP client connection to basedpyright running in a web worker.
 * The worker is loaded from the browser-basedpyright package.
 */

import { LSPClient, languageServerExtensions } from '@codemirror/lsp-client'
import { BasedPyrightTransport } from './BasedPyrightTransport'
import type { PythonVersion } from '../../App'

let client: LSPClient | null = null
let transport: BasedPyrightTransport | null = null
let currentPythonVersion: PythonVersion = '3.12'

export interface BasedPyrightLSPOptions {
  pythonVersion?: PythonVersion
  documentUri?: string
  rootUri?: string
  onDiagnostics?: (diagnostics: any[]) => void
}

/**
 * Create and initialize a basedpyright LSP client
 */
export async function createBasedPyrightLSPClient(options: BasedPyrightLSPOptions = {}): Promise<LSPClient> {
  const {
    pythonVersion = '3.12',
    rootUri = 'file:///workspace',
    onDiagnostics
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
  // Note: initializationOptions are injected by the transport when intercepting the initialize request
  const newClient = new LSPClient({
    rootUri,
    workspace: undefined,
    timeout: 30000, // 30 seconds timeout - basedpyright can be slow to initialize
    extensions: languageServerExtensions()
  })

  // Create transport for basedpyright worker
  const newTransport = new BasedPyrightTransport({
    pythonVersion,
    onError: (error) => {
      console.error('[LSP] basedpyright worker error:', error)
    },
    onClose: () => {
      console.log('[LSP] basedpyright worker connection closed')
    }
  })

  // Subscripe to transport to intercept diagnostics
  if (onDiagnostics) {
    newTransport.subscribe((message: string) => {
      try {
        const data = JSON.parse(message)
        if (data.method === 'textDocument/publishDiagnostics' && data.params) {
          onDiagnostics(data.params.diagnostics)
        }
      } catch (e) {
        console.error('Failed to parse LSP message', e)
      }
    })
  }

  // Wait for the transport to be ready (worker booted)
  await newTransport.ready

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
export function getBasedPyrightLSPClient(): LSPClient | null {
  return client
}

/**
 * Update the Python version for the LSP server
 */
export async function updateBasedPyrightPythonVersion(version: PythonVersion): Promise<void> {
  if (currentPythonVersion === version) {
    return
  }

  currentPythonVersion = version

  // Recreate the client with the new Python version
  if (client) {
    await closeBasedPyrightLSPClient()
    await createBasedPyrightLSPClient({ pythonVersion: version })
  }
}

/**
 * Close the LSP client and cleanup
 */
export async function closeBasedPyrightLSPClient(): Promise<void> {
  if (client) {
    client.disconnect()
    client = null
  }
  if (transport) {
    transport.close()
    transport = null
  }
}
