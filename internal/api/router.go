package api

import (
	"net/http"

	"github.com/jmelahman/gameslop/internal/catalog"
	"github.com/jmelahman/gameslop/internal/store"
)

// Deps bundles every dependency the API layer needs.
type Deps struct {
	Catalog *catalog.Catalog
	Runs    *store.RunStore
}

// Register attaches every /api/* route handler to mux.
func Register(mux *http.ServeMux, d Deps) {
	rh := &runHandler{deps: d}

	mux.HandleFunc("/api/hello", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"message": "Hello, World!"})
	})

	mux.HandleFunc("POST /api/runs", rh.create)
	mux.HandleFunc("GET /api/runs/active", rh.active)
	mux.HandleFunc("DELETE /api/runs/active", rh.abandon)
}
