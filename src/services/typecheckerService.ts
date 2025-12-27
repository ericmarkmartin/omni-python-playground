import type { Diagnostic, PythonVersion, TypeChecker } from '../App'
import { checkWithPyright } from './pyrightService'
import { checkWithBasedPyright } from './basedpyrightService'
import { checkWithTy } from './tyService'
import { checkWithPyrefly } from './pyreflyService'

export async function runTypeChecker(
  typeChecker: TypeChecker,
  code: string,
  pythonVersion: PythonVersion
): Promise<Diagnostic[]> {
  try {
    switch (typeChecker) {
      case 'pyright':
        return await checkWithPyright(code, pythonVersion)
      case 'basedpyright':
        return await checkWithBasedPyright(code, pythonVersion)
      case 'ty':
        return await checkWithTy(code, pythonVersion)
      case 'pyrefly':
        return await checkWithPyrefly(code, pythonVersion)
      default:
        console.error('Unknown type checker:', typeChecker)
        return []
    }
  } catch (error) {
    console.error('Error running type checker:', error)
    return [
      {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 1 },
        message: `Error running ${typeChecker}: ${error}`,
        severity: 'error',
        source: typeChecker,
      },
    ]
  }
}
