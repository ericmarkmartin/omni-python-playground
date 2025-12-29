/**
 * WebWorkerTransport implements the Transport interface for @codemirror/lsp-client
 * to communicate with a language server running in a Web Worker.
 *
 * The LSP protocol uses JSON-RPC messages over a transport layer. This implementation
 * bridges the Web Worker postMessage API to the LSP Transport interface.
 */

export interface Transport {
  send(message: string): void
  subscribe(handler: (message: string) => void): void
  unsubscribe(handler: (message: string) => void): void
}

export interface WebWorkerTransportOptions {
  /**
   * The Worker instance or URL to create a worker from
   */
  worker: Worker | string | URL

  /**
   * Worker options (only used if worker is a string/URL)
   */
  workerOptions?: WorkerOptions

  /**
   * Optional error handler for worker errors
   */
  onError?: (error: ErrorEvent) => void

  /**
   * Optional handler for when the worker terminates
   */
  onClose?: () => void
}

export class WebWorkerTransport implements Transport {
  private worker: Worker
  private handlers: Set<(message: string) => void> = new Set()
  private messageListener: (event: MessageEvent) => void
  private errorListener: (event: ErrorEvent) => void
  private closed = false

  constructor(options: WebWorkerTransportOptions | Worker | string | URL) {
    // Handle both simple and advanced initialization
    const config: WebWorkerTransportOptions =
      typeof options === 'object' && 'worker' in options
        ? options
        : { worker: options }

    // Initialize the worker
    if (config.worker instanceof Worker) {
      this.worker = config.worker
    } else {
      this.worker = new Worker(config.worker, config.workerOptions)
    }

    // Set up message listener to forward to all subscribed handlers
    this.messageListener = (event: MessageEvent) => {
      const data = event.data

      // Only forward valid JSON-RPC messages (must have jsonrpc: '2.0')
      if (typeof data === 'object' && data !== null && data.jsonrpc === '2.0') {
        const message = JSON.stringify(data)
        this.handlers.forEach(handler => {
          try {
            handler(message)
          } catch (error) {
            console.error('Error in LSP message handler:', error)
          }
        })
      } else if (typeof data === 'string') {
        // Try to parse string messages
        try {
          const parsed = JSON.parse(data)
          if (parsed.jsonrpc === '2.0') {
            this.handlers.forEach(handler => {
              try {
                handler(data)
              } catch (error) {
                console.error('Error in LSP message handler:', error)
              }
            })
          }
        } catch {
          // Ignore unparseable messages
        }
      }
      // Ignore non-JSON-RPC messages (like worker-ready)
    }

    // Set up error listener
    this.errorListener = (event: ErrorEvent) => {
      console.error('WebWorker error:', event)
      if (config.onError) {
        config.onError(event)
      }
    }

    // Attach listeners
    this.worker.addEventListener('message', this.messageListener)
    this.worker.addEventListener('error', this.errorListener)

    // Handle worker termination
    this.worker.addEventListener('messageerror', () => {
      this.handleClose()
      config.onClose?.()
    })
  }

  /**
   * Send a JSON-RPC message to the language server
   */
  send(message: string): void {
    if (this.closed) {
      throw new Error('Transport is closed')
    }

    try {
      // Parse and send as object for structured cloning
      const parsed = JSON.parse(message)
      this.worker.postMessage(parsed)
    } catch {
      // If parsing fails, send as string
      this.worker.postMessage(message)
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
   * Close the transport and terminate the worker
   */
  close(): void {
    if (this.closed) return

    this.handleClose()
    this.worker.terminate()
  }

  /**
   * Internal cleanup on close
   */
  private handleClose(): void {
    this.closed = true
    this.worker.removeEventListener('message', this.messageListener)
    this.worker.removeEventListener('error', this.errorListener)
    this.handlers.clear()
  }

  /**
   * Check if the transport is closed
   */
  isClosed(): boolean {
    return this.closed
  }
}
