import { useState, useEffect, useRef, useCallback } from 'react'
import './App.css'
import CodeEditor, { type CodeEditorHandle } from './components/CodeEditor'
import DiagnosticsPanel from './components/DiagnosticsPanel'
import Controls from './components/Controls'
import { runTypeChecker } from './services/typecheckerService'
import { createTyLSPClient, closeTyLSPClient } from './services/lsp/tyLSPService'
import { createBasedPyrightLSPClient, closeBasedPyrightLSPClient } from './services/lsp/basedPyrightLSPService'
import type { LSPClient } from '@codemirror/lsp-client'

export type TypeChecker = 'pyright' | 'basedpyright' | 'ty' | 'pyrefly'
export type PythonVersion = '3.9' | '3.10' | '3.11' | '3.12' | '3.13' | '3.14'

export interface DiagnosticRange {
  line: number
  column: number
}

export interface Diagnostic {
  start?: DiagnosticRange
  end?: DiagnosticRange
  message: string
  severity: 'error' | 'warning' | 'info'
  source: string
}

const DEFAULT_CODE = `def greet(name: str) -> str:
    return f"Hello, {name}!"

# This will cause a type error
result: int = greet("World")
print(result)
`

function App() {
  const [code, setCode] = useState(DEFAULT_CODE)
  const [typeChecker, setTypeChecker] = useState<TypeChecker>('ty')
  const [pythonVersion, setPythonVersion] = useState<PythonVersion>('3.12')
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([])
  const [isChecking, setIsChecking] = useState(false)
  const [lspClient, setLspClient] = useState<LSPClient | null>(null)
  const editorRef = useRef<CodeEditorHandle>(null)

  // Initialize LSP client based on selected type checker
  useEffect(() => {
    let cancelled = false

    const initLSP = async () => {
      try {
        let client: LSPClient | null = null

        const onDiagnostics = (params: any[]) => {
          // Convert LSP diagnostics to our Diagnostic format
          const appDiagnostics: Diagnostic[] = params.map((diag: any) => ({
            start: {
              line: diag.range.start.line + 1,
              column: diag.range.start.character + 1
            },
            end: {
              line: diag.range.end.line + 1,
              column: diag.range.end.character + 1
            },
            message: diag.message,
            severity: diag.severity === 1 ? 'error' : diag.severity === 2 ? 'warning' : 'info',
            source: typeChecker
          }))
          setDiagnostics(appDiagnostics)
          setIsChecking(false)
        }

        if (typeChecker === 'ty') {
          client = await createTyLSPClient({
            pythonVersion,
            documentUri: 'file:///main.py',
            onDiagnostics
          })
        } else if (typeChecker === 'basedpyright') {
          client = await createBasedPyrightLSPClient({
            pythonVersion,
            onDiagnostics
          })
        }

        if (!cancelled && client) {
          setLspClient(client)
        }
      } catch (error) {
        console.error('Failed to initialize LSP client:', error)
      }
    }

    // Close any existing clients first
    const cleanup = () => {
      cancelled = true
      closeTyLSPClient()
      closeBasedPyrightLSPClient()
      setLspClient(null)
    }

    if (typeChecker === 'ty' || typeChecker === 'basedpyright') {
      initLSP()
      return cleanup
    } else {
      // For other type checkers, no LSP client yet
      setLspClient(null)
      return undefined
    }
  }, [typeChecker, pythonVersion])

  // Run type checker whenever code, typeChecker, or pythonVersion changes
  useEffect(() => {
    let cancelled = false

    const checkCode = async () => {
      // For LSP-based checkers, diagnostics are handled via events
      if (typeChecker === 'ty' || typeChecker === 'basedpyright') {
        return
      }

      setIsChecking(true)
      try {
        const results = await runTypeChecker(typeChecker, code, pythonVersion)
        if (!cancelled) {
          setDiagnostics(results)
        }
      } catch (error) {
        console.error('Error checking code:', error)
      } finally {
        if (!cancelled) {
          setIsChecking(false)
        }
      }
    }

    // Debounce the type checking by 500ms
    const timeoutId = setTimeout(checkCode, 500)

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
  }, [code, typeChecker, pythonVersion])

  const handleDiagnosticClick = useCallback((start?: DiagnosticRange, end?: DiagnosticRange) => {
    if (start) {
      editorRef.current?.jumpToLocation(start, end)
    }
  }, [])

  return (
    <div className="app">
      <header className="app-header">
        <h1>Omni-Python Playground</h1>
      </header>
      <div className="main-content">
        <div className="editor-section">
          <Controls
            typeChecker={typeChecker}
            pythonVersion={pythonVersion}
            onTypeCheckerChange={setTypeChecker}
            onPythonVersionChange={setPythonVersion}
          />
          <CodeEditor ref={editorRef} code={code} onChange={setCode} lspClient={lspClient} />
        </div>
        <div className="diagnostics-section">
          <DiagnosticsPanel
            diagnostics={diagnostics}
            typeChecker={typeChecker}
            isChecking={isChecking}
            onDiagnosticClick={handleDiagnosticClick}
          />
        </div>
      </div>
    </div>
  )
}

export default App
