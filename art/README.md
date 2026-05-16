# Local Stable Diffusion for item art

This directory hosts everything needed by `cmd/genart` to generate item icon
art locally — no API keys, no cloud, no data sharing.

```
art/
├── README.md           (this file — committed)
└── sd-data/            (gitignored — models, outputs, configs)
    ├── models/
    │   ├── Stable-diffusion/   <- checkpoint(s) live here
    │   └── Lora/                <- optional style LoRAs
    ├── outputs/                 <- A1111's own image dumps (we ignore)
    └── config/                  <- WebUI settings
```

## One-time setup

### 1. Start the container

```bash
docker compose up -d stable-diffusion
# Wait for the WebUI to come up (slow — pulls the image + boots Python):
until curl -sf http://localhost:7860/ >/dev/null; do sleep 5; done
```

If `docker compose up` fails with `network kanban-network not found`, edit
`docker-compose.yml` and switch the `networks:` block from `kanban-network`
to `gameslop-net` (uncomment the two commented lines).

### 2. Download a model

Pick **one** SDXL fine-tune (≈7 GB each) and drop the `.safetensors` file into
`art/sd-data/models/Stable-diffusion/`. Both produce high-quality painterly
fantasy art:

- **Juggernaut XL v9** — https://civitai.com/models/133005
  - Best general-purpose SDXL fantasy fine-tune. Use this if unsure.
- **DreamShaper XL Turbo** — https://civitai.com/models/112902
  - Faster sampling (≈8 steps), slightly more illustrative. CPU still slow.

Example:

```bash
mkdir -p art/sd-data/models/Stable-diffusion
curl -L -o art/sd-data/models/Stable-diffusion/JuggernautXL_v9.safetensors \
  "https://civitai.com/api/download/models/348913"
```

(The exact Civitai download URL changes — grab it from the model page.)

After dropping the file, refresh the WebUI's model list so A1111 sees it:

```bash
curl -X POST http://localhost:7860/sdapi/v1/refresh-checkpoints
curl http://localhost:7860/sdapi/v1/sd-models | jq '.[].title'
```

### 3. (Optional) Add a style LoRA

For tighter "RPG icon" consistency, drop an SDXL LoRA into
`art/sd-data/models/Lora/`. Good options:

- **Painterly Style** SDXL LoRA — Civitai / HuggingFace
- **Game Icon / RPG Item** SDXL LoRA

`cmd/genart` does not currently inject LoRA syntax into prompts — if you
install one, edit `internal/art/prompt.go` to append `<lora:NAME:0.7>` to
the style suffix.

## Generating art

From the repo root, with the SD container running:

```bash
# Generate only items that don't yet have a PNG (default).
go run ./cmd/genart

# Force-regenerate everything (long — overnight for the full catalog).
go run ./cmd/genart --all

# Regenerate one item with its deterministic seed.
go run ./cmd/genart --item rusty_sword

# Reroll one item with a fresh seed (produces a different image).
go run ./cmd/genart --item rusty_sword --reroll
```

The CLI writes PNGs to `web/public/items/<id>.png` and upserts a row into
the `art_assets` SQLite table tracking prompt, seed, model name, and image
sha256.

By default it talks to `http://localhost:7860`. If you're running `genart`
from inside the devcontainer and joined the SD container to the same docker
network, override:

```bash
GENART_SD_URL=http://stable-diffusion:7860 go run ./cmd/genart
```

## Cost / time expectations

- 1024×1024 SDXL + Hires Fix at 35 steps on a typical desktop CPU:
  **~15–30 minutes per image**.
- A full catalog of ~50 items: **~15–25 hours**, so kick it off overnight.
- Subsequent runs are nearly instant if all art exists (`--missing-only`
  short-circuits).
- The generated PNGs are committed to git, so a fresh checkout has the
  shipped art with no regeneration needed.
