import type { Diagnostic, PythonVersion } from '../App'
import init, { Workspace, PositionEncoding, Severity } from 'ty_wasm'

let wasmInitialized = false
let workspace: Workspace | null = null

async function initializeWasm() {
  if (!wasmInitialized) {
    await init()
    wasmInitialized = true
  }
}

export async function checkWithTy(
  code: string,
  pythonVersion: PythonVersion
): Promise<Diagnostic[]> {
  try {
    // Initialize WASM module if not already done
    await initializeWasm()

    // Create a new workspace for each check
    workspace = new Workspace("/", PositionEncoding.Utf16, {
      "environment": {
        "python-version": pythonVersion
      }
    })

    // Open the file
    const handle = workspace.openFile("test.py", code)

    // Check the file and get diagnostics
    const tyDiagnostics = workspace.checkFile(handle)

    // Map ty diagnostics to our format
    const diagnostics: Diagnostic[] = tyDiagnostics.map(diag => {
      const range = diag.toRange(workspace!)
      const severity = diag.severity()

      return {
        start: range ? { line: range.start.line, column: range.start.column } : undefined,
        end: range ? { line: range.end.line, column: range.end.column } : undefined,
        message: diag.message(),
        severity: severity === Severity.Error ? 'error' :
                 severity === Severity.Warning ? 'warning' : 'info',
        source: 'ty'
      }
    })

    // Close the file when done
    workspace.closeFile(handle)

    return diagnostics
  } catch (error) {
    console.error('Error running ty:', error)
    return [{
      start: { line: 1, column: 1 },
      end: { line: 1, column: 1 },
      message: `Failed to run ty: ${error}`,
      severity: 'error',
      source: 'ty'
    }]
  }
}
