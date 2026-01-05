import CodeMirror from '@uiw/react-codemirror'
import { python } from '@codemirror/lang-python'
import { EditorView, Decoration } from '@codemirror/view'
import { StateField, StateEffect } from '@codemirror/state'
import { useRef, useImperativeHandle, forwardRef, useMemo, useState, useCallback } from 'react'
import {
  type LSPClient,
  jumpToDefinition,
  jumpToTypeDefinition,
  findReferences
} from '@codemirror/lsp-client'
import { lintGutter, linter } from '@codemirror/lint'
import './CodeEditor.css'

interface CodeEditorProps {
  code: string
  onChange: (value: string) => void
  lspClient?: LSPClient | null
}

export interface DiagnosticRange {
  line: number
  column: number
}

export interface CodeEditorHandle {
  jumpToLocation: (start: DiagnosticRange, end?: DiagnosticRange) => void
}

// State effect to add a highlight
const addHighlight = StateEffect.define<{ from: number; to: number }>()
// State effect to clear highlights
const clearHighlight = StateEffect.define()

// State field to manage highlights
const highlightField = StateField.define({
  create() {
    return Decoration.none
  },
  update(highlights, tr) {
    highlights = highlights.map(tr.changes)
    for (const effect of tr.effects) {
      if (effect.is(addHighlight)) {
        const mark = Decoration.mark({
          class: 'cm-diagnostic-highlight'
        })
        highlights = Decoration.set([mark.range(effect.value.from, effect.value.to)])
      } else if (effect.is(clearHighlight)) {
        highlights = Decoration.none
      }
    }
    return highlights
  },
  provide: f => EditorView.decorations.from(f)
})

interface ContextMenuState {
  visible: boolean
  x: number
  y: number
}

const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(({ code, onChange, lspClient }, ref) => {
  const editorRef = useRef<EditorView | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0 })

  // Close context menu when clicking elsewhere
  const handleClickOutside = useCallback(() => {
    setContextMenu(prev => prev.visible ? { ...prev, visible: false } : prev)
  }, [])

  // Handle context menu
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (!lspClient) return // Only show LSP menu when LSP is available

    e.preventDefault()
    const container = containerRef.current
    const view = editorRef.current
    if (!container || !view) return

    // Get the position in the document where the user right-clicked
    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY })
    if (pos !== null) {
      // Move the cursor to the clicked position
      view.dispatch({
        selection: { anchor: pos }
      })
    }

    const rect = container.getBoundingClientRect()
    setContextMenu({
      visible: true,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    })
  }, [lspClient])

  // Execute an LSP command
  const executeCommand = useCallback((command: (view: EditorView) => boolean) => {
    const view = editorRef.current
    if (view) {
      // Focus the view first, then execute the command
      view.focus()
      const result = command(view)
      console.log('[LSP Command] Result:', result)
    }
    setContextMenu({ visible: false, x: 0, y: 0 })
  }, [])

  // Create extensions array with LSP support if client is available
  const extensions = useMemo(() => {
    // We provide a never-resolving promise as source to install the lint UI
    // but prevent the polling linter from clearing diagnostics pushed by LSP.
    const exts = [python(), highlightField, lintGutter(), linter(() => new Promise(() => { }))]

    if (lspClient) {
      // Create plugin for the main.py document
      // plugin() returns an Extension which can be an array
      const lspExtensions = lspClient.plugin('file:///workspace/main.py', 'python') as any
      exts.push(...lspExtensions)
    }

    return exts
  }, [lspClient])

  useImperativeHandle(ref, () => ({
    jumpToLocation: (start: DiagnosticRange, end?: DiagnosticRange) => {
      const view = editorRef.current
      if (!view) return

      // Convert 1-indexed line to 0-indexed
      const startLine = view.state.doc.line(start.line)
      // Column is also 1-indexed, convert to 0-indexed position
      const startPos = startLine.from + (start.column - 1)

      // Calculate end position
      let endPos: number
      if (end) {
        const endLine = view.state.doc.line(end.line)
        endPos = endLine.from + (end.column - 1)
      } else {
        // If no end specified, highlight to end of start line
        endPos = startLine.to
      }

      // Scroll to the position and set cursor
      view.dispatch({
        selection: { anchor: startPos, head: startPos },
        scrollIntoView: true
      })

      // Clear any existing highlight first to restart the animation
      view.dispatch({
        effects: clearHighlight.of(null)
      })

      // Add a highlight effect that will flash (on next frame to ensure animation restarts)
      requestAnimationFrame(() => {
        view.dispatch({
          effects: addHighlight.of({ from: startPos, to: endPos })
        })
      })

      // Focus the editor
      view.focus()
    }
  }))

  return (
    <div
      className="code-editor"
      ref={containerRef}
      onContextMenu={handleContextMenu}
      onClick={handleClickOutside}
    >
      <CodeMirror
        value={code}
        height="100%"
        extensions={extensions}
        onChange={onChange}
        theme="dark"
        onCreateEditor={(view) => {
          editorRef.current = view
        }}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLineGutter: true,
          highlightSpecialChars: true,
          foldGutter: true,
          drawSelection: true,
          dropCursor: true,
          allowMultipleSelections: true,
          indentOnInput: true,
          syntaxHighlighting: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: true,
          rectangularSelection: true,
          crosshairCursor: true,
          highlightActiveLine: true,
          highlightSelectionMatches: true,
          closeBracketsKeymap: true,
          searchKeymap: true,
          foldKeymap: true,
          completionKeymap: true,
          lintKeymap: true,
        }}
      />
      {contextMenu.visible && lspClient && (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button onClick={() => executeCommand(jumpToDefinition)}>
            Go to Definition
          </button>
          <button onClick={() => executeCommand(jumpToTypeDefinition)}>
            Go to Type Definition
          </button>
          <button onClick={() => executeCommand(findReferences)}>
            Find References
          </button>
        </div>
      )}
    </div>
  )
})

CodeEditor.displayName = 'CodeEditor'

export default CodeEditor
