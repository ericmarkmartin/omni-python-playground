import type { TypeChecker, PythonVersion } from '../App'
import './Controls.css'

interface ControlsProps {
  typeChecker: TypeChecker
  pythonVersion: PythonVersion
  onTypeCheckerChange: (checker: TypeChecker) => void
  onPythonVersionChange: (version: PythonVersion) => void
}

const TYPE_CHECKERS: { value: TypeChecker; label: string }[] = [
  { value: 'pyright', label: 'Pyright' },
  { value: 'basedpyright', label: 'BasedPyright' },
  { value: 'ty', label: 'ty' },
  { value: 'pyrefly', label: 'Pyrefly' },
]

const PYTHON_VERSIONS: PythonVersion[] = ['3.9', '3.10', '3.11', '3.12', '3.13', '3.14']

function Controls({
  typeChecker,
  pythonVersion,
  onTypeCheckerChange,
  onPythonVersionChange,
}: ControlsProps) {
  return (
    <div className="controls">
      <div className="control-group">
        <label htmlFor="typechecker-select">Type Checker:</label>
        <select
          id="typechecker-select"
          value={typeChecker}
          onChange={(e) => onTypeCheckerChange(e.target.value as TypeChecker)}
        >
          {TYPE_CHECKERS.map((tc) => (
            <option key={tc.value} value={tc.value}>
              {tc.label}
            </option>
          ))}
        </select>
      </div>
      <div className="control-group">
        <label htmlFor="python-version-select">Python Version:</label>
        <select
          id="python-version-select"
          value={pythonVersion}
          onChange={(e) => onPythonVersionChange(e.target.value as PythonVersion)}
        >
          {PYTHON_VERSIONS.map((version) => (
            <option key={version} value={version}>
              {version}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

export default Controls
