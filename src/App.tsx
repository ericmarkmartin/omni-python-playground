import { useState, useEffect, useRef, useCallback } from 'react'
import './App.css'
import CodeEditor, { type CodeEditorHandle } from './components/CodeEditor'
import DiagnosticsPanel from './components/DiagnosticsPanel'
import Controls from './components/Controls'
import { runTypeChecker } from './services/typecheckerService'

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
  const editorRef = useRef<CodeEditorHandle>(null)

  // Run type checker whenever code, typeChecker, or pythonVersion changes
  useEffect(() => {
    let cancelled = false

    const checkCode = async () => {
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
          <CodeEditor ref={editorRef} code={code} onChange={setCode} />
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
