# Document Parser System

## Overview

AskDocs uses a pluggable parser provider pattern (mirroring `EmbeddingProvider` and `LLMProvider`). The active parser is selected by the `PARSER_PROVIDER` env var. New providers can be added by implementing `ParserProvider` and registering in `PARSER_PROVIDER_REGISTRY`.

---

## Default: unstructured

[unstructured.io](https://unstructured.io/) is the default parser. It returns structure-aware elements — `Title`, `NarrativeText`, `Table`, `ListItem`, `Header` — rather than a raw text blob.

**Why unstructured:**
- Structure detection improves chunk quality. Titles and headers become semantic boundaries, not mid-sentence splits.
- Tables are preserved as HTML (`<table>...</table>`) so the LLM can read them accurately.
- `element_type` is stored on every `DocumentChunk` row, enabling future element-type-aware retrieval (e.g., boost Title matches).
- Supports PDF, DOCX, and TXT with a single API.

---

## Fallback: pypdf

For environments where `unstructured`'s dependencies are too heavy, set `PARSER_PROVIDER=pypdf`. This uses [pypdf](https://pypdf.readthedocs.io/) for PDF parsing only.

- Supports: PDF only
- Strategy: `fast` only
- Element type: all chunks are `NarrativeText` (no structure detection)
- For DOCX and TXT files, the factory automatically falls back to `SimpleParserProvider` (python-docx + UTF-8 decode)

```env
PARSER_PROVIDER=pypdf
```

---

## Strategy options

The `UNSTRUCTURED_DEFAULT_STRATEGY` env var (default: `fast`) controls how unstructured processes documents.

| Strategy | Speed | Quality | RAM | Notes |
|----------|-------|---------|-----|-------|
| `fast` | Fast | Good | ~200MB | Uses pdfminer. Recommended default. |
| `hi_res` | Slow | Best | ~2–4GB | Uses detectron2 layout model. Not available without `[local-inference]` extras. |
| `auto` | Variable | Good | ~200MB+ | unstructured picks the strategy per document. |
| `ocr_only` | — | — | — | Not implemented. Raises `NotImplementedError`. |

Per-document override: set `Document.parser_strategy` to override the env default for a specific document.

---

## Enabling hi_res mode

`hi_res` uses a layout detection model (detectron2 + PyTorch) to identify document structure. It is **not installed by default** because it adds ~2GB to the Docker image and requires ~1.5GB RAM at runtime.

To enable:

1. Install the extras:
   ```bash
   pip install 'unstructured[local-inference]'
   ```
   Or add to `requirements.txt`:
   ```
   unstructured[pdf,local-inference]==0.14.4
   ```

2. Rebuild the Docker image.

3. Set the strategy:
   ```env
   UNSTRUCTURED_DEFAULT_STRATEGY=hi_res
   ```

If hi_res is requested but `unstructured_inference` is not installed, the server raises `ParserStrategyUnavailable` with a clear error message pointing to this page.

---

## 8GB Mac / M1 Dev Environment

On an M1 Mac with Docker Desktop capped at 3–4GB:

- **`fast` mode:** Works fine. ~200MB RAM overhead.
- **`hi_res` mode:** Likely OOM. Detectron2 needs ~1.5GB for the layout model alone, plus the base container overhead. It may work at Docker's 4GB limit with nothing else running, but it's unreliable.

**Recommendation:** Keep `UNSTRUCTURED_DEFAULT_STRATEGY=fast` locally. Use `hi_res` in staging/production where containers have 8GB+ available.

---

## Adding a new parser provider

1. Create `apps/documents/parsing/my_provider.py` implementing `ParserProvider`.
2. Add it to `PARSER_PROVIDER_REGISTRY` in `factory.py`:
   ```python
   PARSER_PROVIDER_REGISTRY = {
       "unstructured": UnstructuredParserProvider,
       "pypdf": PypdfParserProvider,
       "myprovider": MyProvider,
   }
   ```
3. Set `PARSER_PROVIDER=myprovider` in your `.env`.
4. Write tests in `tests/test_myprovider_parser.py`.
