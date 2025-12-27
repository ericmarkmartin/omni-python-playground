# Omni-Python Playground

A web-based playground for testing Python code with multiple type checkers: Pyright, BasedPyright, ty, and Pyrefly.

## Features

- **Multiple Type Checkers**: Switch between Pyright, BasedPyright, ty, and Pyrefly
- **Python Version Selection**: Test your code against Python 3.9 through 3.13
- **Live Type Checking**: See diagnostics update as you type (with 500ms debouncing)
- **Code Editor**: Built with CodeMirror for a smooth editing experience
- **Clean UI**: Dark theme with syntax highlighting

## Getting Started

### Prerequisites

You must have the following installed:

1. **Node.js** (v25.2.1 recommended via Volta)
2. **Yarn** (v4.12.0 recommended via Volta)
3. **Rust toolchain** (for building WASM modules)
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```
4. **wasm-pack** (for compiling Rust to WebAssembly)
   ```bash
   cargo install wasm-pack
   ```

The project uses Volta to pin Node and Yarn versions. If you have Volta installed, it will automatically use the correct versions.

### Installation

1. Clone the repository with submodules:

   ```bash
   git clone --recursive <repo-url>
   cd omni-python-playground
   ```

   Or if you already cloned without `--recursive`:

   ```bash
   git submodule update --init --recursive
   ```

2. Install dependencies (this will automatically build the ty WASM module):

   ```bash
   yarn install
   ```

   The `postinstall` script will build the `ty_wasm` package from the ruff submodule.
   **This takes about 2-5 minutes on the first run.**

3. Start the development server:
   ```bash
   yarn dev
   ```

The app will be available at `http://localhost:5173`

### Building for Production

```bash
yarn build
```

The built files will be in the `dist/` directory.

## Architecture

### Type Checker Integration Approach

The type checkers run in "normal mode" - they analyze the code and return diagnostics (errors, warnings, info). This approach is simpler than implementing a full Language Server Protocol integration and is sufficient for displaying type errors.

Future enhancements could include LSP features like:

- Hover information
- Go-to-definition
- Autocomplete
- Code actions

### Type Checker Implementations

- **Pyright**: TypeScript-based, can run directly in the browser
- **BasedPyright**: Fork of Pyright with additional features, similar integration approach
- **ty**: Rust-based, compiled to WebAssembly for browser execution
- **Pyrefly**: Rust-based, compiled to WebAssembly for browser execution

### Current Status

- ✅ UI layout and controls
- ✅ Code editor with Python syntax highlighting
- ✅ Diagnostics panel with live updates
- ✅ Click diagnostics to jump to error location with flash highlight
- ✅ Type checker service architecture
- ✅ Debounced type checking (500ms)
- ✅ **ty WASM integration** - fully functional!
- 🚧 Pyright integration (will use server-side approach)
- 🚧 BasedPyright integration (will use server-side approach)
- 🚧 Pyrefly WASM integration (planned)

### Next Steps

1. **Pyright Integration**: Import and configure Pyright's type checking API

   - Reference: [Pyright Playground](https://github.com/erictraut/pyright-playground)

2. **BasedPyright Integration**: Similar to Pyright with additional configuration

3. **ty WASM**: Build ty to WebAssembly and integrate

   - Reference: [ty Playground](https://github.com/astral-sh/ruff/tree/main/playground/ty)
   - Uses wasm-pack to compile Rust to WASM

4. **Pyrefly WASM**: Build Pyrefly to WebAssembly and integrate

## Project Structure

```
omni-python-playground/
├── ruff-source/            # Git submodule containing ruff/ty source code
├── ty_wasm/                # Generated WASM build output (gitignored)
├── src/
│   ├── components/          # React components
│   │   ├── CodeEditor.tsx   # CodeMirror-based editor
│   │   ├── Controls.tsx     # Type checker and Python version selectors
│   │   └── DiagnosticsPanel.tsx  # Displays type errors/warnings
│   ├── services/            # Type checker integrations
│   │   ├── pyrightService.ts
│   │   ├── basedpyrightService.ts
│   │   ├── tyService.ts     # ty WASM integration
│   │   ├── pyreflyService.ts
│   │   └── typecheckerService.ts  # Orchestrates all checkers
│   ├── App.tsx             # Main application component
│   ├── App.css             # Application styles
│   ├── index.css           # Global styles
│   └── main.tsx            # Entry point
├── public/                 # Static assets
├── package.json
├── tsconfig.json
├── vite.config.ts
├── IMPLEMENTATION.md       # Detailed implementation notes
└── README.md
```

## How ty Integration Works

1. **Build Process**:

   - `yarn build:wasm` compiles `ruff-source/crates/ty_wasm` to WebAssembly
   - Output goes to `./ty_wasm/` (outside the submodule, gitignored)
   - This directory is a local package: `"ty_wasm": "file:ty_wasm"`
   - Automatically runs on `postinstall`, `predev`, and `prebuild`

2. **Runtime**:

   - WASM module initializes on first type check
   - Creates a `Workspace` with the selected Python version
   - Opens a file with the user's code
   - Runs `checkFile()` to get diagnostics
   - Diagnostics are mapped to our UI format
   - Click a diagnostic to jump to that location in the editor

3. **Vite Configuration**:
   - `ty_wasm` is excluded from dependency optimization
   - This prevents Vite from trying to pre-bundle the WASM binary

## Available Scripts

- `yarn build:wasm` - Build the ty WASM module
- `yarn dev` - Start development server (auto-builds WASM first)
- `yarn build` - Build for production (auto-builds WASM first)
- `yarn typecheck` - Run TypeScript type checking
- `yarn lint` - Run ESLint

## Troubleshooting

### WASM build fails

Make sure you have:

- Rust toolchain installed (`rustup --version`)
- wasm-pack installed (`wasm-pack --version`)
- The ruff-source submodule initialized (`git submodule status`)

### "Module not found: ty_wasm"

Run `yarn build:wasm` manually to rebuild the WASM module.

### Blank page in browser

Check the browser console for errors. Common issues:

- WASM module didn't build (run `yarn build:wasm`)
- Module resolution errors (try `yarn install` again)

## References

- [Pyright Playground](https://github.com/erictraut/pyright-playground) - Reference implementation
- [ty Playground](https://github.com/astral-sh/ruff/tree/main/playground/ty) - ty WASM integration example
- [Pyright](https://github.com/microsoft/pyright)
- [ty](https://github.com/astral-sh/ty)
- [BasedPyright](https://github.com/DetachHead/basedpyright)
- [Pyrefly](https://github.com/astral-sh/pyrefly)

## License

MIT
