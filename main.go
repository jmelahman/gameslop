package main

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/jmelahman/gameslop/web"
)

func main() {
	mux := http.NewServeMux()

	mux.HandleFunc("/api/hello", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"message": "Hello, World!"})
	})

	mux.Handle("/", web.Handler())

	addr := ":7474"
	log.Printf("listening on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}
