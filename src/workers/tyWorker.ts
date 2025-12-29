/**
 * ty Language Server Worker
 *
 * This worker implements the LSP protocol for ty_wasm, bridging between
 * the LSP JSON-RPC protocol and ty's native WASM API.
 *
 * Note: ty uses 1-based indexing for positions (line 1, column 1 is the first character)
 * LSP uses 0-based indexing for positions (line 0, character 0 is the first character)
 */

import init, {
  Workspace,
  FileHandle,
  Position as TyPosition,
  PositionEncoding,
  Diagnostic as TyDiagnostic,
  Completion as TyCompletion,
  TextEdit as TyTextEdit,
  LocationLink as TyLocationLink,
  DocumentHighlight as TyDocumentHighlight,
  SignatureInformation as TySignatureInformation,
  ParameterInformation as TyParameterInformation,
  Range as TyRange
} from 'ty_wasm'

// LSP Protocol types
interface LSPPosition {
  line: number
  character: number
}

interface LSPRange {
  start: LSPPosition
  end: LSPPosition
}

interface LSPTextDocumentItem {
  uri: string
  languageId: string
  version: number
  text: string
}

interface LSPRequest {
  jsonrpc: '2.0'
  id?: number | string
  method: string
  params?: any
}

interface LSPResponse {
  jsonrpc: '2.0'
  id?: number | string
  result?: any
  error?: {
    code: number
    message: string
    data?: any
  }
}

interface LSPNotification {
  jsonrpc: '2.0'
  method: string
  params?: any
}

// Worker state
let workspace: Workspace | null = null
let fileHandles = new Map<string, FileHandle>()
let pythonVersion = '3.12'

/**
 * Convert LSP position (0-based) to ty position (1-based)
 */
function lspToTyPosition(pos: LSPPosition): TyPosition {
  return new TyPosition(pos.line + 1, pos.character + 1)
}

/**
 * Convert ty position (1-based) to LSP position (0-based)
 */
function tyToLSPPosition(pos: { line: number; column: number }): LSPPosition {
  return {
    line: pos.line - 1,
    character: pos.column - 1
  }
}

/**
 * Convert ty range to LSP range
 * Handles both plain objects and WASM Range objects
 */
function tyToLSPRange(range: TyRange | { start: { line: number; column: number }; end: { line: number; column: number } }): LSPRange {
  // Access the WASM Range properties directly - they are public fields
  const start = range.start
  const end = range.end
  return {
    start: tyToLSPPosition({ line: start.line, column: start.column }),
    end: tyToLSPPosition({ line: end.line, column: end.column })
  }
}

/**
 * Convert a ty LocationLink to a plain LSP Location object
 * This is necessary because WASM objects can't be serialized across postMessage
 */
function tyLocationLinkToLSPLocation(loc: TyLocationLink): { uri: string; range: LSPRange } {
  // Access the WASM properties and convert to plain objects
  const fullRange = loc.full_range

  // ty_wasm returns paths in its virtual filesystem format
  // When we pass "file:///main.py" as the document URI, ty stores it as "/file:/main.py"
  // We need to convert it back to a proper file:// URI
  let uri = loc.path

  // Handle the case where ty returns "/file:/path" format
  if (uri.startsWith('/file:/')) {
    // Extract the path after "/file:" and make it a proper file URI
    const actualPath = uri.substring(6) // Remove "/file:" prefix, keep the path with leading /
    uri = `file://${actualPath}`
  } else if (!uri.startsWith('file://')) {
    // Regular path - convert to file URI
    uri = `file://${uri}`
  }

  return {
    uri,
    range: tyToLSPRange(fullRange)
  }
}

/**
 * Send a response back to the main thread
 */
function sendResponse(id: number | string | undefined, result: any) {
  const response: LSPResponse = {
    jsonrpc: '2.0',
    id,
    result
  }
  self.postMessage(response)
}

/**
 * Send an error response back to the main thread
 */
function sendError(id: number | string | undefined, code: number, message: string, data?: any) {
  const response: LSPResponse = {
    jsonrpc: '2.0',
    id,
    error: { code, message, data }
  }
  self.postMessage(response)
}

/**
 * Send a notification to the main thread
 */
function sendNotification(method: string, params?: any) {
  const notification: LSPNotification = {
    jsonrpc: '2.0',
    method,
    params
  }
  self.postMessage(notification)
}

/**
 * Handle LSP requests
 */
async function handleRequest(request: LSPRequest) {
  const { id, method, params } = request

  try {
    switch (method) {
      case 'initialize': {
        // Initialize WASM and workspace
        await init()

        const initOptions = params?.initializationOptions || {}
        pythonVersion = initOptions.pythonVersion || '3.12'

        workspace = new Workspace('/', PositionEncoding.Utf16, {
          environment: {
            'python-version': pythonVersion
          }
        })

        sendResponse(id, {
          capabilities: {
            textDocumentSync: {
              openClose: true,
              change: 1, // Full sync
            },
            hoverProvider: true,
            completionProvider: {
              triggerCharacters: ['.', '(']
            },
            definitionProvider: true,
            referencesProvider: true,
            typeDefinitionProvider: true,
            declarationProvider: true,
            documentHighlightProvider: true,
            signatureHelpProvider: {
              triggerCharacters: ['(', ',']
            },
            documentFormattingProvider: true,
            inlayHintProvider: true,
            codeActionProvider: true,
            diagnosticProvider: {
              interFileDependencies: true,
              workspaceDiagnostics: false
            }
          }
        })
        break
      }

      case 'initialized': {
        // Client finished initialization
        sendNotification('window/logMessage', {
          type: 3, // Info
          message: 'ty language server initialized'
        })
        break
      }

      case 'textDocument/didOpen': {
        const doc: LSPTextDocumentItem = params.textDocument
        if (workspace) {
          const handle = workspace.openFile(doc.uri, doc.text)
          fileHandles.set(doc.uri, handle)
        }
        break
      }

      case 'textDocument/didChange': {
        const uri = params.textDocument.uri
        const changes = params.contentChanges
        const handle = fileHandles.get(uri)

        if (workspace && handle && changes.length > 0) {
          // Full document sync
          const newText = changes[0].text
          workspace.updateFile(handle, newText)
        }
        break
      }

      case 'textDocument/didClose': {
        const uri = params.textDocument.uri
        const handle = fileHandles.get(uri)

        if (workspace && handle) {
          workspace.closeFile(handle)
          fileHandles.delete(uri)
        }
        break
      }

      case 'textDocument/diagnostic': {
        const uri = params.textDocument.uri
        const handle = fileHandles.get(uri)

        if (!workspace || !handle) {
          sendResponse(id, { kind: 'full', items: [] })
          break
        }

        const diagnostics = workspace.checkFile(handle)
        const lspDiagnostics = diagnostics.map((diag: TyDiagnostic) => {
          const range = diag.toRange(workspace!)
          const severity = diag.severity()

          return {
            range: range ? tyToLSPRange(range) : { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
            severity: severity === 2 ? 1 : severity === 1 ? 2 : 3, // ty: Error=2, Warning=1, Info=0 -> LSP: Error=1, Warning=2, Info=3
            message: diag.message(),
            source: 'ty'
          }
        })

        sendResponse(id, { kind: 'full', items: lspDiagnostics })
        break
      }

      case 'textDocument/hover': {
        const uri = params.textDocument.uri
        const position: LSPPosition = params.position
        const handle = fileHandles.get(uri)

        if (!workspace || !handle) {
          sendResponse(id, null)
          break
        }

        const tyPos = lspToTyPosition(position)
        const hover = workspace.hover(handle, tyPos)

        if (hover) {
          sendResponse(id, {
            contents: {
              kind: 'markdown',
              value: hover.markdown
            },
            range: tyToLSPRange(hover.range)
          })
        } else {
          sendResponse(id, null)
        }
        break
      }

      case 'textDocument/completion': {
        const uri = params.textDocument.uri
        const position: LSPPosition = params.position
        const handle = fileHandles.get(uri)

        if (!workspace || !handle) {
          sendResponse(id, { items: [] })
          break
        }

        const tyPos = lspToTyPosition(position)
        const completions = workspace.completions(handle, tyPos)

        const items = completions.map((comp: TyCompletion) => ({
          label: comp.name,
          kind: comp.kind ?? 1, // Default to Text
          detail: comp.detail,
          documentation: comp.documentation ? {
            kind: 'markdown',
            value: comp.documentation
          } : undefined,
          insertText: comp.insert_text || comp.name,
          additionalTextEdits: comp.additional_text_edits?.map((edit: TyTextEdit) => ({
            range: tyToLSPRange(edit.range),
            newText: edit.new_text
          }))
        }))

        sendResponse(id, { items })
        break
      }

      case 'textDocument/definition': {
        const uri = params.textDocument.uri
        const position: LSPPosition = params.position
        const handle = fileHandles.get(uri)

        if (!workspace || !handle) {
          sendResponse(id, [])
          break
        }

        const tyPos = lspToTyPosition(position)
        const locations = workspace.gotoDefinition(handle, tyPos)

        const lspLocations = locations.map((loc: TyLocationLink) => tyLocationLinkToLSPLocation(loc))

        sendResponse(id, lspLocations)
        break
      }

      case 'textDocument/references': {
        const uri = params.textDocument.uri
        const position: LSPPosition = params.position
        const handle = fileHandles.get(uri)

        if (!workspace || !handle) {
          sendResponse(id, [])
          break
        }

        const tyPos = lspToTyPosition(position)
        const locations = workspace.gotoReferences(handle, tyPos)

        const lspLocations = locations.map((loc: TyLocationLink) => tyLocationLinkToLSPLocation(loc))

        sendResponse(id, lspLocations)
        break
      }

      case 'textDocument/typeDefinition': {
        const uri = params.textDocument.uri
        const position: LSPPosition = params.position
        const handle = fileHandles.get(uri)

        if (!workspace || !handle) {
          sendResponse(id, [])
          break
        }

        const tyPos = lspToTyPosition(position)
        const locations = workspace.gotoTypeDefinition(handle, tyPos)

        const lspLocations = locations.map((loc: TyLocationLink) => tyLocationLinkToLSPLocation(loc))

        sendResponse(id, lspLocations)
        break
      }

      case 'textDocument/declaration': {
        const uri = params.textDocument.uri
        const position: LSPPosition = params.position
        const handle = fileHandles.get(uri)

        if (!workspace || !handle) {
          sendResponse(id, [])
          break
        }

        const tyPos = lspToTyPosition(position)
        const locations = workspace.gotoDeclaration(handle, tyPos)

        const lspLocations = locations.map((loc: TyLocationLink) => tyLocationLinkToLSPLocation(loc))

        sendResponse(id, lspLocations)
        break
      }

      case 'textDocument/documentHighlight': {
        const uri = params.textDocument.uri
        const position: LSPPosition = params.position
        const handle = fileHandles.get(uri)

        if (!workspace || !handle) {
          sendResponse(id, [])
          break
        }

        const tyPos = lspToTyPosition(position)
        const highlights = workspace.documentHighlights(handle, tyPos)

        const lspHighlights = highlights.map((hl: TyDocumentHighlight) => ({
          range: tyToLSPRange(hl.range),
          kind: hl.kind
        }))

        sendResponse(id, lspHighlights)
        break
      }

      case 'textDocument/signatureHelp': {
        const uri = params.textDocument.uri
        const position: LSPPosition = params.position
        const handle = fileHandles.get(uri)

        if (!workspace || !handle) {
          sendResponse(id, null)
          break
        }

        const tyPos = lspToTyPosition(position)
        const sigHelp = workspace.signatureHelp(handle, tyPos)

        if (sigHelp) {
          sendResponse(id, {
            signatures: sigHelp.signatures.map((sig: TySignatureInformation) => ({
              label: sig.label,
              documentation: sig.documentation ? {
                kind: 'markdown',
                value: sig.documentation
              } : undefined,
              parameters: sig.parameters.map((param: TyParameterInformation) => ({
                label: param.label,
                documentation: param.documentation ? {
                  kind: 'markdown',
                  value: param.documentation
                } : undefined
              })),
              activeParameter: sig.active_parameter
            })),
            activeSignature: sigHelp.active_signature || 0
          })
        } else {
          sendResponse(id, null)
        }
        break
      }

      case 'textDocument/formatting': {
        const uri = params.textDocument.uri
        const handle = fileHandles.get(uri)

        if (!workspace || !handle) {
          sendResponse(id, [])
          break
        }

        const formatted = workspace.format(handle)

        if (formatted) {
          // Get the current text to create the full range
          const currentText = workspace.sourceText(handle)
          const lines = currentText.split('\n')
          const lastLine = lines.length - 1
          const lastChar = lines[lastLine].length

          sendResponse(id, [{
            range: {
              start: { line: 0, character: 0 },
              end: { line: lastLine, character: lastChar }
            },
            newText: formatted
          }])
        } else {
          sendResponse(id, [])
        }
        break
      }

      case 'shutdown': {
        sendResponse(id, null)
        break
      }

      case 'exit': {
        self.close()
        break
      }

      default: {
        sendError(id, -32601, `Method not found: ${method}`)
        break
      }
    }
  } catch (error) {
    console.error('Error handling LSP request:', error)
    sendError(id, -32603, `Internal error: ${error}`)
  }
}

// Listen for messages from the main thread
self.addEventListener('message', async (event: MessageEvent) => {
  const message = event.data

  if (typeof message === 'object' && message.jsonrpc === '2.0') {
    await handleRequest(message as LSPRequest)
  }
})

// Notify that the worker is ready
self.postMessage({ type: 'worker-ready' })
