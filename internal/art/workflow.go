package art

// buildFluxWorkflow returns a ComfyUI prompt graph that runs Flux Schnell
// (GGUF Q8) with the given positive prompt and seed. The graph is the
// canonical Flux Schnell pipeline:
//
//	UnetLoaderGGUF (city96/ComfyUI-GGUF) ─┐
//	DualCLIPLoader (t5xxl + clip_l) ──────┤
//	  CLIPTextEncode (prompt) ────────────┤
//	  CLIPTextEncode ("") ────────────────┤
//	EmptySD3LatentImage (1024x1024) ──────┴─→ KSampler (euler/simple, 4 steps)
//	                                                   │
//	                              VAELoader (ae) ──────┴─→ VAEDecode → SaveImage
//
// CFG is locked to 1.0 because Schnell is a guidance-distilled model and
// ignores classifier-free guidance > 1. Steps is locked to 4 (Schnell's
// design point); raising it does not improve quality.
func buildFluxWorkflow(prompt string, seed int64) map[string]any {
	return map[string]any{
		"unet_loader": map[string]any{
			"class_type": "UnetLoaderGGUF",
			"inputs": map[string]any{
				"unet_name": UNetModel,
			},
		},
		"clip_loader": map[string]any{
			"class_type": "DualCLIPLoader",
			"inputs": map[string]any{
				"clip_name1": CLIPModelT,
				"clip_name2": CLIPModelL,
				"type":       "flux",
			},
		},
		"vae_loader": map[string]any{
			"class_type": "VAELoader",
			"inputs": map[string]any{
				"vae_name": VAEModel,
			},
		},
		"positive": map[string]any{
			"class_type": "CLIPTextEncode",
			"inputs": map[string]any{
				"text": prompt,
				"clip": []any{"clip_loader", 0},
			},
		},
		"negative": map[string]any{
			"class_type": "CLIPTextEncode",
			"inputs": map[string]any{
				"text": "",
				"clip": []any{"clip_loader", 0},
			},
		},
		"latent": map[string]any{
			"class_type": "EmptySD3LatentImage",
			"inputs": map[string]any{
				"width":      Width,
				"height":     Height,
				"batch_size": 1,
			},
		},
		"sampler": map[string]any{
			"class_type": "KSampler",
			"inputs": map[string]any{
				"model":        []any{"unet_loader", 0},
				"positive":     []any{"positive", 0},
				"negative":     []any{"negative", 0},
				"latent_image": []any{"latent", 0},
				"seed":         seed,
				"steps":        Steps,
				"cfg":          1.0,
				"sampler_name": "euler",
				"scheduler":    "simple",
				"denoise":      1.0,
			},
		},
		"decode": map[string]any{
			"class_type": "VAEDecode",
			"inputs": map[string]any{
				"samples": []any{"sampler", 0},
				"vae":     []any{"vae_loader", 0},
			},
		},
		"save": map[string]any{
			"class_type": "SaveImage",
			"inputs": map[string]any{
				"images":          []any{"decode", 0},
				"filename_prefix": "gameslop",
			},
		},
	}
}
