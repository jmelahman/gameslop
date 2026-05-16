package api

import (
	"net/http"

	"github.com/jmelahman/gameslop/internal/catalog"
	"github.com/jmelahman/gameslop/internal/store"
)

// Deps bundles every dependency the API layer needs.
type Deps struct {
	Catalog    *catalog.Catalog
	Runs       *store.RunStore
	Encounters *store.EncounterStore
}

// Register attaches every /api/* route handler to mux.
func Register(mux *http.ServeMux, d Deps) {
	rh := &runHandler{deps: d}
	sh := &shopHandler{deps: d}
	ch := &combatHandler{deps: d}

	mux.HandleFunc("/api/hello", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"message": "Hello, World!"})
	})

	mux.HandleFunc("POST /api/runs", rh.create)
	mux.HandleFunc("GET /api/runs/active", rh.active)
	mux.HandleFunc("DELETE /api/runs/active", rh.abandon)

	mux.HandleFunc("POST /api/runs/active/shop/buy", sh.buy)
	mux.HandleFunc("POST /api/runs/active/shop/refresh", sh.refresh)
	mux.HandleFunc("POST /api/runs/active/shop/freeze", sh.freeze)
	mux.HandleFunc("POST /api/runs/active/shop/xp", sh.xp)
	mux.HandleFunc("POST /api/runs/active/board/place", sh.place)
	mux.HandleFunc("POST /api/runs/active/board/remove", sh.remove)
	mux.HandleFunc("POST /api/runs/active/items/sell", sh.sell)

	mux.HandleFunc("POST /api/runs/active/combat/start", ch.start)
	mux.HandleFunc("GET /api/runs/active/combat/result", ch.result)

	mux.HandleFunc("GET /api/catalog/items", sh.catalogItems)
}
