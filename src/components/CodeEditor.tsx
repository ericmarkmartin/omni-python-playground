import CodeMirror from '@uiw/react-codemirror'
import { python } from '@codemirror/lang-python'
import { EditorView, Decoration } from '@codemirror/view'
import { StateField, StateEffect } from '@codemirror/state'
import { useRef, useImperativeHandle, forwardRef } from 'react'
import './CodeEditor.css'

interface CodeEditorProps {
  code: string
  onChange: (value: string) => void
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

const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(({ code, onChange }, ref) => {
  const editorRef = useRef<EditorView | null>(null)

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
    <div className="code-editor">
      <CodeMirror
        value={code}
        height="100%"
        extensions={[python(), highlightField]}
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
    </div>
  )
})

CodeEditor.displayName = 'CodeEditor'

export default CodeEditor
