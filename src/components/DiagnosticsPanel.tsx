import type { Diagnostic, DiagnosticRange, TypeChecker } from '../App'
import './DiagnosticsPanel.css'

interface DiagnosticsPanelProps {
  diagnostics: Diagnostic[]
  typeChecker: TypeChecker
  isChecking?: boolean
  onDiagnosticClick?: (start?: DiagnosticRange, end?: DiagnosticRange) => void
}

function DiagnosticsPanel({ diagnostics, typeChecker, isChecking = false, onDiagnosticClick }: DiagnosticsPanelProps) {
  return (
    <div className="diagnostics-panel">
      <div className="diagnostics-header">
        <h2>Diagnostics ({typeChecker})</h2>
        <span className="diagnostics-count">
          {isChecking ? (
            <span className="checking-indicator">Checking...</span>
          ) : (
            `${diagnostics.length} issue${diagnostics.length !== 1 ? 's' : ''}`
          )}
        </span>
      </div>
      <div className="diagnostics-list">
        {isChecking ? (
          <div className="checking-message">Running type checker...</div>
        ) : diagnostics.length === 0 ? (
          <div className="no-diagnostics">No type errors found!</div>
        ) : (
          diagnostics.map((diag, index) => {
            const hasLocation = diag.start !== undefined
            const start = diag.start
            const end = diag.end
            return (
              <div
                key={index}
                className={`diagnostic diagnostic-${diag.severity}`}
                onClick={() => hasLocation && onDiagnosticClick?.(start, end)}
                style={{ cursor: hasLocation && onDiagnosticClick ? 'pointer' : 'default' }}
              >
                <div className="diagnostic-location">
                  {hasLocation && start ? (
                    `Line ${start.line}, Column ${start.column}`
                  ) : (
                    'Unknown location'
                  )}
                </div>
                <div className="diagnostic-message">{diag.message}</div>
                <div className="diagnostic-source">{diag.source}</div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export default DiagnosticsPanel
