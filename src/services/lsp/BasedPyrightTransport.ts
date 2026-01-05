/**
 * BasedPyrightTransport implements the Transport interface for @codemirror/lsp-client
 * to communicate with basedpyright running in a Web Worker.
 *
 * The basedpyright worker uses a special boot protocol:
 * 1. Create foreground worker from the browser-basedpyright package
 * 2. Send { type: "browser/boot", mode: "foreground" } to boot it
 * 3. Worker will request background workers via "browser/newWorker" messages
 * 4. After boot, the worker speaks standard LSP JSON-RPC
 */

// Import the worker script URL from the package
import pyrightWorkerUrl from 'browser-basedpyright/dist/pyright.worker.js?url'

import type { PythonVersion } from '../../App'
import typeshedFiles from './typeshed.json'

export interface Transport {
  send(message: string): void
  subscribe(handler: (message: string) => void): void
  unsubscribe(handler: (message: string) => void): void
}

export interface BasedPyrightTransportOptions {
  /**
   * Python version for configuration
   */
  pythonVersion?: PythonVersion

  /**
   * Optional error handler for worker errors
   */
  onError?: (error: ErrorEvent | Error) => void

  /**
   * Optional handler for when the worker terminates
   */
  onClose?: () => void
}

interface LSPMessage {
  jsonrpc: string
  id?: number | string
  method?: string
  params?: Record<string, unknown>
  result?: unknown
  error?: unknown
}

export class BasedPyrightTransport implements Transport {
  private foregroundWorker: Worker | null = null
  private backgroundWorkers: Worker[] = []
  private handlers: Set<(message: string) => void> = new Set()
  private closed = false
  private _ready: Promise<void>
  private _resolveReady!: () => void
  private _rejectReady!: (error: Error) => void
  private options: BasedPyrightTransportOptions

  constructor(options: BasedPyrightTransportOptions) {
    this.options = options

    // Create a promise that resolves when the worker is ready
    this._ready = new Promise((resolve, reject) => {
      this._resolveReady = resolve
      this._rejectReady = reject
    })

    this.initializeWorker()
  }

  /**
   * Promise that resolves when the transport is ready
   */
  get ready(): Promise<void> {
    return this._ready
  }

  private initializeWorker(): void {
    try {
      // Create the foreground worker from the local package
      this.foregroundWorker = new Worker(pyrightWorkerUrl, {
        name: 'BasedPyright-foreground',
        type: 'classic'
      })

      // Set up message listener
      this.foregroundWorker.addEventListener('message', this.handleMessage.bind(this))

      // Set up error listener
      this.foregroundWorker.addEventListener('error', (event: ErrorEvent) => {
        console.error('[BasedPyright] Worker error:', event)
        if (this.options.onError) {
          this.options.onError(event)
        }
        this._rejectReady(new Error(event.message))
      })

      // Boot the foreground worker
      this.foregroundWorker.postMessage({
        type: 'browser/boot',
        mode: 'foreground'
      })

      // The worker is ready after boot message is sent
      // We'll resolve ready on the first LSP response or after a short delay
      setTimeout(() => {
        if (!this.closed) {
          this._resolveReady()
        }
      }, 100)

    } catch (error) {
      console.error('[BasedPyright] Failed to create worker:', error)
      this._rejectReady(error as Error)
    }
  }

  private handleMessage(event: MessageEvent): void {
    const data = event.data

    if (!data || typeof data !== 'object') {
      return
    }

    // Handle background worker requests
    if (data.type === 'browser/newWorker') {
      this.createBackgroundWorker(data)
      return
    }

    // Forward LSP messages (JSON-RPC) to handlers
    if (data.jsonrpc === '2.0') {
      const message = JSON.stringify(data)
      this.handlers.forEach(handler => {
        try {
          handler(message)
        } catch (error) {
          console.error('[BasedPyright] Error in LSP message handler:', error)
        }
      })
    }
  }

  private createBackgroundWorker(data: { initialData: unknown; port: MessagePort }): void {
    try {
      // Create background worker from the same local package
      const background = new Worker(pyrightWorkerUrl, {
        name: `BasedPyright-background-${this.backgroundWorkers.length + 1}`,
        type: 'classic'
      })

      this.backgroundWorkers.push(background)

      // Transfer the port to the background worker
      background.postMessage(
        {
          type: 'browser/boot',
          mode: 'background',
          initialData: data.initialData,
          port: data.port
        },
        [data.port]
      )
    } catch (error) {
      console.error('[BasedPyright] Failed to create background worker:', error)
    }
  }

  /**
   * Send a JSON-RPC message to the language server
   */
  send(message: string): void {
    if (this.closed) {
      throw new Error('Transport is closed')
    }

    if (!this.foregroundWorker) {
      throw new Error('Worker not initialized')
    }

    try {
      // Parse and send as object for structured cloning
      const parsed = JSON.parse(message) as LSPMessage

      // Intercept initialize request to inject initializationOptions
      if (parsed.method === 'initialize' && parsed.params) {
        // Force rootUri and workspaceFolders to match our VFS structure
        parsed.params.rootUri = 'file:///workspace'
        parsed.params.workspaceFolders = [{
          uri: 'file:///workspace',
          name: 'workspace'
        }]

        const pythonVersion = this.options.pythonVersion || '3.12'
        parsed.params.initializationOptions = {
          files: {
            '/workspace/main.py': '', // Will be populated by didOpen
            // Map typeshed files to /workspace prefix
            ...Object.fromEntries(
              Object.entries(typeshedFiles).map(([path, content]) => [`/workspace${path}`, content])
            ),
            '/workspace/.root': '', // Dummy file to ensure root exists
            '/workspace/pyrightconfig.json': JSON.stringify({
              pythonVersion,
              typeCheckingMode: 'strict',
              typeshedPath: '/workspace/typeshed', // Update typeshedPath
              stubPath: '',
              reportMissingModuleSource: false
            })
          }
        }
      }



      this.foregroundWorker.postMessage(parsed)
    } catch {
      // If parsing fails, send as string
      this.foregroundWorker.postMessage(message)
    }
  }

  /**
   * Subscribe to messages from the language server
   */
  subscribe(handler: (message: string) => void): void {
    this.handlers.add(handler)
  }

  /**
   * Unsubscribe from messages
   */
  unsubscribe(handler: (message: string) => void): void {
    this.handlers.delete(handler)
  }

  /**
   * Close the transport and terminate all workers
   */
  close(): void {
    if (this.closed) return

    this.closed = true

    if (this.foregroundWorker) {
      this.foregroundWorker.terminate()
      this.foregroundWorker = null
    }

    this.backgroundWorkers.forEach(worker => worker.terminate())
    this.backgroundWorkers = []

    this.handlers.clear()

    if (this.options.onClose) {
      this.options.onClose()
    }
  }

  /**
   * Check if the transport is closed
   */
  isClosed(): boolean {
    return this.closed
  }
}
