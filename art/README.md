# Local image generation for item art

This directory hosts everything `cmd/genart` needs to generate item icons
locally via [ComfyUI](https://github.com/comfyanonymous/ComfyUI) running
[Flux Schnell](https://huggingface.co/black-forest-labs/FLUX.1-schnell)
(Apache-2.0). No API keys, no cloud, no data sharing.

```
art/
├── README.md           (this file — committed)
├── bootstrap.sh        (downloads models + custom node — committed)
└── comfy-data/         (gitignored — ComfyUI install, models, outputs)
    └── ComfyUI/
        ├── models/
        │   ├── unet/   <- flux1-schnell-Q8_0.gguf
        │   ├── clip/   <- t5xxl_fp8_e4m3fn.safetensors, clip_l.safetensors
        │   └── vae/    <- ae.safetensors
        ├── custom_nodes/
        │   └── ComfyUI-GGUF/   <- lets ComfyUI load .gguf UNets
        └── output/             <- ComfyUI's own image dumps (we don't read these)
```

## One-time setup

### 1. Download models + custom node

```bash
./art/bootstrap.sh
```

Downloads ~18 GB total (Flux Schnell Q8 GGUF, T5-XXL fp8, CLIP-L, Flux VAE)
and clones the [ComfyUI-GGUF](https://github.com/city96/ComfyUI-GGUF) custom
node. Idempotent — re-running skips files that already exist.

### 2. Start the container

```bash
docker compose up -d comfyui
# First boot is slow (ComfyUI installs its Python deps on first run).
# Wait for it to come up:
until curl -sf http://localhost:8188/system_stats >/dev/null; do sleep 5; done
```

If `docker compose up` fails with `network kanban-net not found`, edit
`docker-compose.yml` and switch the `networks:` block from `kanban-net`
to `gameslop-net` (uncomment the two commented lines).

### 3. Smoke test

```bash
go run ./cmd/genart --item rusty_sword
```

You should see a `[1/1] rusty_sword …` line, then ~5–8 minutes later a PNG
at `web/public/items/rusty_sword.png`.

## Generating art

From the repo root, with the container running:

```bash
# Generate only items that don't yet have a PNG (default).
go run ./cmd/genart

# Force-regenerate everything (long — kick off before bed).
go run ./cmd/genart --all

# Regenerate one item with its deterministic seed.
go run ./cmd/genart --item rusty_sword

# Reroll one item with a fresh seed (produces a different image).
go run ./cmd/genart --item rusty_sword --reroll
```

The CLI writes PNGs to `web/public/items/<id>.png` and upserts a row into
the `art_assets` SQLite table tracking prompt, seed, model name, and image
sha256.

By default it talks to `http://localhost:8188`. If you're running `genart`
from inside the devcontainer and joined the ComfyUI container to the same
docker network, override:

```bash
GENART_COMFY_URL=http://comfyui:8188 go run ./cmd/genart
```

## Cost / time expectations

- 1024×1024 Flux Schnell at 4 steps on a 16-core CPU with 60 GB RAM:
  **~5–8 minutes per image**.
- A full catalog of ~50 items: **~4–7 hours**, so kick it off overnight.
- Subsequent runs are nearly instant if all art exists (`--missing-only`
  short-circuits).
- The generated PNGs are committed to git, so a fresh checkout has the
  shipped art with no regeneration needed.

## Tuning

All sampling params are locked in `internal/art/client.go` and
`internal/art/workflow.go`. Things you'd plausibly change:

- **Switch to Flux Dev** (gated, license-restricted, but higher quality at
  20–50 steps): swap the GGUF filename in `bootstrap.sh` and `client.go`'s
  `UNetModel` constant; bump `Steps` to 20–30 and `cfg` in `workflow.go` to
  3.5. Expect 5–10× longer generation.
- **Switch to a smaller quant** (Q4_K_M, ~7 GB) if disk is tight: change
  `UNetModel` and the `bootstrap.sh` URL. Slight quality dip, ~30% less RAM.
- **Add a style LoRA**: drop a `.safetensors` file into
  `comfy-data/ComfyUI/models/loras/` and add a `LoraLoader` node between
  `unet_loader` and `sampler` in `internal/art/workflow.go`.
