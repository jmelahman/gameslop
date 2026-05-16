package art

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// Locked sampling parameters. Quality > speed is an explicit project choice
// (CPU-only, build-time generation). Changing these will desync the visual
// style of any already-generated art.
const (
	Sampler            = "DPM++ 2M Karras"
	Steps              = 35
	CFGScale           = 6.5
	BaseWidth          = 1024
	BaseHeight         = 1024
	HiResScale         = 1.5
	HiResUpscaler      = "R-ESRGAN 4x+ Anime6B"
	HiResSteps         = 15
	HiResDenoising     = 0.35
	defaultHTTPTimeout = 90 * time.Minute
)

// GenerateRequest is the subset of A1111's `/sdapi/v1/txt2img` payload we use.
// JSON tags match the WebUI's field names exactly.
type GenerateRequest struct {
	Prompt            string  `json:"prompt"`
	NegativePrompt    string  `json:"negative_prompt"`
	Seed              int64   `json:"seed"`
	SamplerName       string  `json:"sampler_name"`
	Steps             int     `json:"steps"`
	CFGScale          float64 `json:"cfg_scale"`
	Width             int     `json:"width"`
	Height            int     `json:"height"`
	EnableHR          bool    `json:"enable_hr"`
	HRScale           float64 `json:"hr_scale"`
	HRUpscaler        string  `json:"hr_upscaler"`
	HRSecondPassSteps int     `json:"hr_second_pass_steps"`
	DenoisingStrength float64 `json:"denoising_strength"`
}

// DefaultRequest builds a GenerateRequest with the project's locked style
// parameters baked in. Only prompt + seed vary per item.
func DefaultRequest(prompt string, seed int64) GenerateRequest {
	return GenerateRequest{
		Prompt:            prompt,
		NegativePrompt:    NegativePrompt,
		Seed:              seed,
		SamplerName:       Sampler,
		Steps:             Steps,
		CFGScale:          CFGScale,
		Width:             BaseWidth,
		Height:            BaseHeight,
		EnableHR:          true,
		HRScale:           HiResScale,
		HRUpscaler:        HiResUpscaler,
		HRSecondPassSteps: HiResSteps,
		DenoisingStrength: HiResDenoising,
	}
}

// Client talks to a local AUTOMATIC1111 WebUI API.
type Client struct {
	BaseURL string
	HTTP    *http.Client
}

// NewClient constructs a Client with a long HTTP timeout suitable for CPU
// generation (a single Hires Fix render can take 30+ minutes).
func NewClient(baseURL string) *Client {
	return &Client{
		BaseURL: strings.TrimRight(baseURL, "/"),
		HTTP:    &http.Client{Timeout: defaultHTTPTimeout},
	}
}

type txt2imgResponse struct {
	Images []string `json:"images"`
	Info   string   `json:"info"`
}

type txt2imgInfo struct {
	Seed int64 `json:"seed"`
}

// Generate sends a txt2img request to the WebUI and returns the decoded PNG
// bytes plus the actual seed the server used (A1111 echoes the seed back in
// `info`; when the caller passed -1 this will be the random one chosen).
func (c *Client) Generate(ctx context.Context, req GenerateRequest) ([]byte, int64, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return nil, 0, fmt.Errorf("marshal request: %w", err)
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.BaseURL+"/sdapi/v1/txt2img", bytes.NewReader(body))
	if err != nil {
		return nil, 0, err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.HTTP.Do(httpReq)
	if err != nil {
		return nil, 0, fmt.Errorf("txt2img request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return nil, 0, fmt.Errorf("txt2img %d: %s", resp.StatusCode, strings.TrimSpace(string(b)))
	}

	var decoded txt2imgResponse
	if err := json.NewDecoder(resp.Body).Decode(&decoded); err != nil {
		return nil, 0, fmt.Errorf("decode txt2img response: %w", err)
	}
	if len(decoded.Images) == 0 {
		return nil, 0, errors.New("txt2img: no images in response")
	}
	img, err := base64.StdEncoding.DecodeString(decoded.Images[0])
	if err != nil {
		return nil, 0, fmt.Errorf("decode base64 image: %w", err)
	}

	seed := req.Seed
	var info txt2imgInfo
	if jsonErr := json.Unmarshal([]byte(decoded.Info), &info); jsonErr == nil && info.Seed != 0 {
		seed = info.Seed
	}
	return img, seed, nil
}

// ModelTitle returns the name of the currently-loaded checkpoint via
// `/sdapi/v1/options`. Empty string if the field isn't reported.
func (c *Client) ModelTitle(ctx context.Context) (string, error) {
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, c.BaseURL+"/sdapi/v1/options", nil)
	if err != nil {
		return "", err
	}
	resp, err := c.HTTP.Do(httpReq)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("options %d: %s", resp.StatusCode, strings.TrimSpace(string(b)))
	}
	var opts map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&opts); err != nil {
		return "", err
	}
	if v, ok := opts["sd_model_checkpoint"].(string); ok {
		return v, nil
	}
	return "", nil
}
