# LSP Transport Layer

This directory contains the transport layer implementation for connecting CodeMirror to Language Server Protocol (LSP) servers running in Web Workers.

## WebWorkerTransport

The `WebWorkerTransport` class implements the `Transport` interface required by `@codemirror/lsp-client`. It bridges Web Worker communication (via `postMessage`) to the LSP protocol.

### Usage

#### Basic Usage

```typescript
import { WebWorkerTransport } from './WebWorkerTransport'

// Create transport from worker URL
const transport = new WebWorkerTransport('/workers/tyWorker.js')

// Or from an existing Worker instance
const worker = new Worker('/workers/tyWorker.js', { type: 'module' })
const transport = new WebWorkerTransport(worker)
```

#### Advanced Usage with Options

```typescript
const transport = new WebWorkerTransport({
  worker: '/workers/tyWorker.js',
  workerOptions: { type: 'module' },
  onError: (error) => {
    console.error('Worker error:', error)
  },
  onClose: () => {
    console.log('Worker connection closed')
  }
})
```

#### Integration with @codemirror/lsp-client

```typescript
import { LanguageServerClient } from '@codemirror/lsp-client'
import { WebWorkerTransport } from './lsp/WebWorkerTransport'

const transport = new WebWorkerTransport('/workers/tyWorker.js')

const client = new LanguageServerClient({
  transport,
  rootUri: 'file:///',
  documentUri: 'file:///test.py',
  languageId: 'python'
})

// Initialize and use the client
await client.initialize({
  capabilities: {
    textDocument: {
      hover: { contentFormat: ['markdown', 'plaintext'] },
      completion: {},
      diagnostic: {},
    }
  }
})
```

### API

#### Constructor

```typescript
new WebWorkerTransport(options: WebWorkerTransportOptions | Worker | string | URL)
```

**Parameters:**
- `options.worker` - Worker instance or URL to create worker from
- `options.workerOptions` - Optional WorkerOptions (e.g., `{ type: 'module' }`)
- `options.onError` - Optional error handler
- `options.onClose` - Optional close handler

#### Methods

**`send(message: string): void`**
- Sends a JSON-RPC message to the language server
- Throws if transport is closed

**`subscribe(handler: (message: string) => void): void`**
- Registers a handler for incoming messages from the server
- Multiple handlers can be registered

**`unsubscribe(handler: (message: string) => void): void`**
- Removes a previously registered handler

**`close(): void`**
- Closes the transport and terminates the worker
- Cleans up all listeners and handlers

**`isClosed(): boolean`**
- Returns whether the transport has been closed

## Architecture

```
CodeMirror Editor
    ↓
@codemirror/lsp-client (LanguageServerClient)
    ↓
WebWorkerTransport (this implementation)
    ↓ postMessage
Web Worker (LSP server adapter)
    ↓
Language Server (ty, Pyright, etc.)
```

## Message Flow

1. **Outgoing (Editor → Server):**
   - LSP client calls `transport.send(jsonRpcMessage)`
   - Transport posts message to worker via `postMessage()`
   - Worker forwards to language server

2. **Incoming (Server → Editor):**
   - Worker receives message from language server
   - Worker posts message back via `postMessage()`
   - Transport's message listener receives it
   - Transport calls all subscribed handlers
   - LSP client processes the message

## Next Steps

1. Create worker implementations:
   - `tyWorker.ts` - Adapter for ty_wasm
   - `pyrightWorker.ts` - Adapter for Pyright
   - `basedpyrightWorker.ts` - Adapter for BasedPyright
   - `pyreflyWorker.ts` - Adapter for Pyrefly

2. Each worker needs to:
   - Import the language server/WASM module
   - Implement LSP protocol message handling
   - Forward JSON-RPC requests to the language server
   - Send responses back via `postMessage()`
