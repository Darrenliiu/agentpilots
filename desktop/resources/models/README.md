# Local GGUF models (optional cache)

Models are **not** bundled in desktop installers. Users download them
in-app from **Local models**.

For local development you can prefetch the default model:

```bash
npm run desktop:fetch-models
```

Or the full catalog:

```bash
npm run desktop:fetch-runtime -- --models --all
```

Packaged builds leave this folder empty (aside from this README).
Downloads at runtime go to the app userData `models/` folder.
