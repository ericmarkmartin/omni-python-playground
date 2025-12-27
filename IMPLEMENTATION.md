# Implementation Guide - Updated Approach

This document provides detailed guidance for implementing each type checker integration using WASM/browser-based approaches.

## Current Status

The prototype has:
- ✅ Complete UI with code editor (CodeMirror) and diagnostics panel
- ✅ Controls for selecting type checker and Python version
- ✅ Service architecture
- ✅ Debounced type checking (500ms)
- ✅ Loading states and error handling
- 🚧 ty integration (WASM) - **IN PROGRESS**

## Architecture Decision: WASM-First Approach

After attempting to use Pyright's TypeScript internals directly (which required complex filesystem mocking), we pivoted to a **WASM-first approach** based on how the official ty playground works.

### Why WASM?

1. **Simpler Integration**: Just call `workspace.checkFile(handle)` - no complex setup
2. **No Filesystem Mocking**: WASM modules handle their own virtual filesystems
3. **Proven Approach**: The official playgrounds use this method
4. **Better Performance**: Compiled code runs faster than interpreted TypeScript

## Type Checker Implementation Details

### 1. ty Integration (WASM) - PRIMARY FOCUS

**Status**: In Progress

**Approach**: Use ty_wasm compiled to WebAssembly

**Reference**: [ty Playground Source](https://github.com/astral-sh/ruff/tree/main/playground/ty)

**Implementation**:

1. **Build WASM Module**:
   ```bash
   # From ruff-source submodule
   wasm-pack build crates/ty_wasm --target web --out-dir ../../ty_wasm
   ```

2. **Install as local package**:
   ```json
   "dependencies": {
     "ty_wasm": "file:ty_wasm"
   }
   ```

3. **Use the Workspace API**:
   ```typescript
   import { Workspace, PositionEncoding } from 'ty_wasm'

   // Create workspace
   const workspace = new Workspace("/", PositionEncoding.Utf16, {})

   // Open file
   const handle = workspace.openFile("test.py", code)

   // Check file and get diagnostics
   const diagnostics = workspace.checkFile(handle)
   ```

4. **Map diagnostics to our format**:
   ```typescript
   const mapped: Diagnostic[] = diagnostics.map(diag => ({
     line: diag.range.start.line + 1,
     column: diag.range.start.character,
     message: diag.message,
     severity: diag.severity,
     source: 'ty'
   }))
   ```

**File to Update**: `src/services/tyService.ts`

**Key Benefits**:
- Extremely fast (Rust compiled to WASM)
- Simple API
- No filesystem mocking needed
- Official playground proves it works

### 2. Pyrefly Integration (WASM)

**Approach**: Similar to ty - compile to WASM

**Status**: Pending (implement after ty works)

### 3. Pyright Integration

**Options**:

**Option A: Pyodide (Attempted - Failed)**
- Tried running Python pyright package in browser
- Issue: `pyright` PyPI package is just a Node.js wrapper
- Verdict: Not viable

**Option B: @zzzen/pyright-internal (Attempted - Complex)**
- Tried using Pyright's TypeScript internals
- Issue: TestFileSystem still tries to access real filesystem
- Verdict: Too complex, filesystem mocking is fragile

**Option C: Server-Side (Recommended for Pyright)**
- Run Pyright on a simple backend server
- Client sends code via HTTP POST
- Server returns JSON diagnostics
- Simple, proven approach (used by official playground)

**Option D: Pyodide + pyright source (Untested)**
- Could potentially work but very heavy (~50MB+ load)

**Recommendation**: Implement a simple backend server for Pyright/BasedPyright

### 4. BasedPyright Integration

**Approach**: Same as Pyright (likely server-side)

## Building WASM Modules

### Prerequisites

```bash
# Install Rust (if not already installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install wasm-pack
cargo install wasm-pack

# Add wasm target
rustup target add wasm32-unknown-unknown
```

### Build ty WASM

```bash
cd ruff-source
wasm-pack build crates/ty_wasm --target web --out-dir ../../ty_wasm
```

This creates:
- `ty_wasm/ty_wasm_bg.wasm` - The compiled WASM binary
- `ty_wasm/ty_wasm.js` - JavaScript bindings
- `ty_wasm/ty_wasm.d.ts` - TypeScript definitions
- `ty_wasm/package.json` - NPM package metadata

### Build Pyrefly WASM (when ready)

Similar process - check Pyrefly's repo for build instructions.

## Development Workflow

```bash
# Install dependencies
yarn install

# Start dev server
yarn dev

# Type check
yarn typecheck
```

## Testing Strategy

1. **Start with ty**: Get one working WASM integration
2. **Test thoroughly**: Verify diagnostics are correct
3. **Add Pyrefly**: Similar WASM approach
4. **Consider Pyright**: May need simple backend server
5. **BasedPyright**: Follow Pyright approach

## Resources

- [ty Playground Source](https://github.com/astral-sh/ruff/tree/main/playground/ty)
- [ty Documentation](https://docs.astral.sh/ty/)
- [wasm-pack Documentation](https://rustwasm.github.io/wasm-pack/)
- [WebAssembly Guide](https://webassembly.org/getting-started/developers-guide/)
