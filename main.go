package main

import (
	"log"
	"net/http"
	"os"

	"github.com/jmelahman/gameslop/internal/api"
	"github.com/jmelahman/gameslop/internal/catalog"
	"github.com/jmelahman/gameslop/internal/db"
	"github.com/jmelahman/gameslop/internal/store"
	"github.com/jmelahman/gameslop/web"
)

func main() {
	dbPath := os.Getenv("GAMESLOP_DB")
	if dbPath == "" {
		dbPath = "gameslop.db"
	}

	database, err := db.Open(dbPath)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer database.Close()

	cat, err := catalog.Load(database)
	if err != nil {
		log.Fatalf("load catalog: %v", err)
	}
	log.Printf("catalog: %d items, %d heroes", len(cat.Items), len(cat.Heroes))

	deps := api.Deps{
		Catalog: cat,
		Runs:    store.NewRunStore(database),
	}

	mux := http.NewServeMux()
	api.Register(mux, deps)
	mux.Handle("/", web.Handler())

	addr := ":7474"
	log.Printf("listening on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}
