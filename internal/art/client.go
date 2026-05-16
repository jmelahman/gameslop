package art

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Locked sampling parameters. Flux Schnell is a 4-step distilled model
// designed for fast inference; raising Steps does not improve quality.
// Width/Height are Flux's native resolution. Quality > speed is an explicit
// project choice (CPU-only, build-time generation).
const (
	UNetModel  = "flux1-schnell-Q8_0.gguf"
	CLIPModelL = "clip_l.safetensors"
	CLIPModelT = "t5xxl_fp8_e4m3fn.safetensors"
	VAEModel   = "ae.safetensors"

	Width  = 1024
	Height = 1024
	Steps  = 4

	defaultHTTPTimeout = 90 * time.Minute
	pollInterval       = 5 * time.Second
)

// Client talks to a local ComfyUI server.
type Client struct {
	BaseURL  string
	HTTP     *http.Client
	ClientID string
}

// NewClient constructs a Client with a long HTTP timeout suitable for CPU
// generation (a single 1024x1024 Flux render can take 5-10 minutes; the
// HTTP timeout governs the per-call POST/GET, not the polling loop).
func NewClient(baseURL string) *Client {
	var idBytes [8]byte
	_, _ = rand.Read(idBytes[:])
	return &Client{
		BaseURL:  strings.TrimRight(baseURL, "/"),
		HTTP:     &http.Client{Timeout: defaultHTTPTimeout},
		ClientID: hex.EncodeToString(idBytes[:]),
	}
}

type queueResponse struct {
	PromptID string `json:"prompt_id"`
}

type historyEntry struct {
	Status struct {
		Completed bool   `json:"completed"`
		StatusStr string `json:"status_str"`
		Messages  [][]any `json:"messages"`
	} `json:"status"`
	Outputs map[string]struct {
		Images []struct {
			Filename  string `json:"filename"`
			Subfolder string `json:"subfolder"`
			Type      string `json:"type"`
		} `json:"images"`
	} `json:"outputs"`
}

// Generate queues a Flux workflow with the given prompt+seed, polls until
// ComfyUI finishes, and returns the PNG bytes plus the seed actually used
// (echoed back so callers can persist it).
func (c *Client) Generate(ctx context.Context, prompt string, seed int64) ([]byte, int64, error) {
	wf := buildFluxWorkflow(prompt, seed)
	body, err := json.Marshal(map[string]any{
		"prompt":    wf,
		"client_id": c.ClientID,
	})
	if err != nil {
		return nil, 0, fmt.Errorf("marshal prompt: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.BaseURL+"/prompt", bytes.NewReader(body))
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("queue prompt: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return nil, 0, fmt.Errorf("queue prompt %d: %s", resp.StatusCode, strings.TrimSpace(string(b)))
	}
	var queued queueResponse
	if err := json.NewDecoder(resp.Body).Decode(&queued); err != nil {
		return nil, 0, fmt.Errorf("decode queue response: %w", err)
	}
	if queued.PromptID == "" {
		return nil, 0, errors.New("queue prompt: empty prompt_id")
	}

	entry, err := c.waitForHistory(ctx, queued.PromptID)
	if err != nil {
		return nil, 0, err
	}

	for _, out := range entry.Outputs {
		for _, img := range out.Images {
			data, err := c.fetchImage(ctx, img.Filename, img.Subfolder, img.Type)
			if err != nil {
				return nil, 0, err
			}
			return data, seed, nil
		}
	}
	return nil, 0, errors.New("workflow completed but no images in outputs")
}

func (c *Client) waitForHistory(ctx context.Context, promptID string) (*historyEntry, error) {
	url := c.BaseURL + "/history/" + promptID
	for {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		default:
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err != nil {
			return nil, err
		}
		resp, err := c.HTTP.Do(req)
		if err != nil {
			return nil, fmt.Errorf("poll history: %w", err)
		}
		var raw map[string]historyEntry
		dec := json.NewDecoder(resp.Body)
		decErr := dec.Decode(&raw)
		resp.Body.Close()
		if decErr != nil {
			return nil, fmt.Errorf("decode history: %w", decErr)
		}
		if entry, ok := raw[promptID]; ok && entry.Status.Completed {
			if strings.HasPrefix(strings.ToLower(entry.Status.StatusStr), "error") {
				return nil, fmt.Errorf("workflow failed: %s", entry.Status.StatusStr)
			}
			return &entry, nil
		}

		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(pollInterval):
		}
	}
}

func (c *Client) fetchImage(ctx context.Context, filename, subfolder, kind string) ([]byte, error) {
	q := url.Values{}
	q.Set("filename", filename)
	q.Set("subfolder", subfolder)
	q.Set("type", kind)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.BaseURL+"/view?"+q.Encode(), nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch image: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("fetch image %d: %s", resp.StatusCode, strings.TrimSpace(string(b)))
	}
	return io.ReadAll(resp.Body)
}

// ModelTitle returns the configured Flux UNet filename, after a quick
// liveness check against the ComfyUI server. Returns an error if the server
// isn't reachable.
func (c *Client) ModelTitle(ctx context.Context) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.BaseURL+"/system_stats", nil)
	if err != nil {
		return "", err
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("system_stats %d: %s", resp.StatusCode, strings.TrimSpace(string(b)))
	}
	io.Copy(io.Discard, resp.Body)
	return UNetModel, nil
}
