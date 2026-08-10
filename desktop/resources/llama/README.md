# llama.cpp runtime

Run `npm run desktop:fetch-runtime` on the target OS to download the matching binary here:

- **Windows x64** → `llama-server.exe` (+ DLLs)
- **macOS Apple Silicon (arm64)** → `llama-server` (+ dylibs)

Newer llama.cpp builds ship a small `llama-server` stub plus supporting libraries — keep this whole folder intact when packaging.
