// genart-placeholders generates tier+tag-aware placeholder PNGs for items
// in the catalog so the shop UI has something to render before real SD art
// is generated. Run once, commit the PNGs, then remove this directory.
//
//	go run ./cmd/genart-placeholders
package main

import (
	"image"
	"image/color"
	"image/png"
	"log"
	"math"
	"os"
	"path/filepath"
	"sort"

	"github.com/jmelahman/gameslop/internal/catalog"
	"github.com/jmelahman/gameslop/internal/db"
	"github.com/jmelahman/gameslop/internal/model"
)

const (
	size      = 1024
	outputDir = "web/public/items"
)

type palette struct {
	bgInner color.RGBA
	bgOuter color.RGBA
	ring    color.RGBA
	fg      color.RGBA
}

var tierPalettes = map[model.Tier]palette{
	model.TierBronze:  {rgb(0x6b, 0x44, 0x23), rgb(0x2a, 0x18, 0x0a), rgb(0xb4, 0x71, 0x2b), rgb(0xfb, 0xbf, 0x77)},
	model.TierSilver:  {rgb(0x6b, 0x72, 0x80), rgb(0x1f, 0x29, 0x37), rgb(0xcb, 0xd5, 0xe1), rgb(0xf1, 0xf5, 0xf9)},
	model.TierGold:    {rgb(0xa1, 0x62, 0x07), rgb(0x3a, 0x1f, 0x08), rgb(0xfd, 0xe0, 0x47), rgb(0xfe, 0xf3, 0xc7)},
	model.TierDiamond: {rgb(0x0e, 0x74, 0x90), rgb(0x06, 0x2a, 0x37), rgb(0x67, 0xe8, 0xf9), rgb(0xcf, 0xfa, 0xfe)},
}

func main() {
	database, err := db.Open(envOr("GAMESLOP_DB", "gameslop.db"))
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer database.Close()
	cat, err := catalog.Load(database)
	if err != nil {
		log.Fatalf("load catalog: %v", err)
	}
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		log.Fatalf("mkdir: %v", err)
	}

	items := cat.All()
	sort.Slice(items, func(i, j int) bool { return items[i].ID < items[j].ID })
	for _, it := range items {
		path := filepath.Join(outputDir, it.ID+".png")
		img := renderPlaceholder(it)
		f, err := os.Create(path)
		if err != nil {
			log.Fatalf("create %s: %v", path, err)
		}
		if err := png.Encode(f, img); err != nil {
			f.Close()
			log.Fatalf("encode %s: %v", path, err)
		}
		f.Close()
		log.Printf("wrote %s", path)
	}
}

func renderPlaceholder(item model.ItemDef) *image.RGBA {
	pal, ok := tierPalettes[item.Tier]
	if !ok {
		pal = tierPalettes[model.TierBronze]
	}
	img := image.NewRGBA(image.Rect(0, 0, size, size))

	// Radial gradient background.
	cx, cy := float64(size)/2, float64(size)/2
	maxR := math.Sqrt(cx*cx + cy*cy)
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			dx, dy := float64(x)-cx, float64(y)-cy
			t := math.Sqrt(dx*dx+dy*dy) / maxR
			if t > 1 {
				t = 1
			}
			img.SetRGBA(x, y, blend(pal.bgInner, pal.bgOuter, t))
		}
	}

	// Tier-colored ring border (4% inset, 1.5% thick).
	inset := size * 4 / 100
	thick := size * 15 / 1000
	drawRect(img, inset, inset, size-inset, size-inset, thick, pal.ring)

	tag := ""
	if len(item.Tags) > 0 {
		tag = item.Tags[0]
	}
	drawTagShape(img, tag, pal.fg, pal.ring)
	return img
}

func drawTagShape(img *image.RGBA, tag string, fg, accent color.RGBA) {
	cx, cy := size/2, size/2
	r := size * 28 / 100
	switch tag {
	case "Weapon":
		// Vertical blade + horizontal guard.
		drawFilledRect(img, cx-r/8, cy-r, cx+r/8, cy+r, fg)
		drawFilledRect(img, cx-r/2, cy+r/3, cx+r/2, cy+r/2, accent)
		// Pommel circle.
		drawFilledCircle(img, cx, cy+r+r/8, r/10, accent)
	case "Shield":
		// Rounded shield.
		drawFilledRoundedRect(img, cx-r, cy-int(float64(r)*1.1), cx+r, cy+int(float64(r)*1.1), r/3, fg)
		drawFilledRoundedRect(img, cx-r*2/3, cy-int(float64(r)*0.7), cx+r*2/3, cy+int(float64(r)*0.8), r/4, accent)
	case "Potion":
		// Flask: round bottom + neck.
		drawFilledCircle(img, cx, cy+r/4, r, fg)
		drawFilledRect(img, cx-r/4, cy-r, cx+r/4, cy-r/3, fg)
		drawFilledRect(img, cx-r/3, cy-r-r/8, cx+r/3, cy-r, accent)
		// Liquid highlight.
		drawFilledCircle(img, cx-r/3, cy+r/8, r/4, accent)
	case "Trinket":
		// Five-point star.
		drawStar(img, cx, cy, r, r/2, 5, fg)
	case "Gold":
		// Coin: filled disc + inner ring.
		drawFilledCircle(img, cx, cy, r, fg)
		drawFilledCircle(img, cx, cy, r*4/5, accent)
		drawFilledCircle(img, cx, cy, r*2/3, fg)
	default:
		// Generic diamond.
		drawDiamond(img, cx, cy, r, fg)
	}
}

func rgb(r, g, b uint8) color.RGBA { return color.RGBA{r, g, b, 0xff} }

func blend(a, b color.RGBA, t float64) color.RGBA {
	lerp := func(x, y uint8) uint8 { return uint8(float64(x)*(1-t) + float64(y)*t) }
	return color.RGBA{lerp(a.R, b.R), lerp(a.G, b.G), lerp(a.B, b.B), 0xff}
}

func drawRect(img *image.RGBA, x0, y0, x1, y1, thick int, c color.RGBA) {
	for t := 0; t < thick; t++ {
		drawHLine(img, x0+t, x1-t, y0+t, c)
		drawHLine(img, x0+t, x1-t, y1-1-t, c)
		drawVLine(img, x0+t, y0+t, y1-t, c)
		drawVLine(img, x1-1-t, y0+t, y1-t, c)
	}
}

func drawFilledRect(img *image.RGBA, x0, y0, x1, y1 int, c color.RGBA) {
	if x0 > x1 {
		x0, x1 = x1, x0
	}
	if y0 > y1 {
		y0, y1 = y1, y0
	}
	for y := y0; y < y1; y++ {
		for x := x0; x < x1; x++ {
			setPixel(img, x, y, c)
		}
	}
}

func drawFilledRoundedRect(img *image.RGBA, x0, y0, x1, y1, r int, c color.RGBA) {
	drawFilledRect(img, x0+r, y0, x1-r, y1, c)
	drawFilledRect(img, x0, y0+r, x1, y1-r, c)
	drawFilledCircle(img, x0+r, y0+r, r, c)
	drawFilledCircle(img, x1-r, y0+r, r, c)
	drawFilledCircle(img, x0+r, y1-r, r, c)
	drawFilledCircle(img, x1-r, y1-r, r, c)
}

func drawFilledCircle(img *image.RGBA, cx, cy, r int, c color.RGBA) {
	for y := -r; y <= r; y++ {
		for x := -r; x <= r; x++ {
			if x*x+y*y <= r*r {
				setPixel(img, cx+x, cy+y, c)
			}
		}
	}
}

func drawHLine(img *image.RGBA, x0, x1, y int, c color.RGBA) {
	if x0 > x1 {
		x0, x1 = x1, x0
	}
	for x := x0; x <= x1; x++ {
		setPixel(img, x, y, c)
	}
}

func drawVLine(img *image.RGBA, x, y0, y1 int, c color.RGBA) {
	if y0 > y1 {
		y0, y1 = y1, y0
	}
	for y := y0; y <= y1; y++ {
		setPixel(img, x, y, c)
	}
}

func drawDiamond(img *image.RGBA, cx, cy, r int, c color.RGBA) {
	for y := -r; y <= r; y++ {
		dy := abs(y)
		w := r - dy
		drawHLine(img, cx-w, cx+w, cy+y, c)
	}
}

// drawStar draws a regular n-point star centered at (cx,cy) with outer
// radius rOut and inner radius rIn, filled via scanline conversion.
func drawStar(img *image.RGBA, cx, cy, rOut, rIn, n int, c color.RGBA) {
	pts := make([][2]float64, 2*n)
	for i := 0; i < 2*n; i++ {
		theta := -math.Pi/2 + float64(i)*math.Pi/float64(n)
		r := float64(rOut)
		if i%2 == 1 {
			r = float64(rIn)
		}
		pts[i] = [2]float64{float64(cx) + r*math.Cos(theta), float64(cy) + r*math.Sin(theta)}
	}
	fillPolygon(img, pts, c)
}

func fillPolygon(img *image.RGBA, pts [][2]float64, c color.RGBA) {
	minY, maxY := math.MaxFloat64, -math.MaxFloat64
	for _, p := range pts {
		if p[1] < minY {
			minY = p[1]
		}
		if p[1] > maxY {
			maxY = p[1]
		}
	}
	for y := int(minY); y <= int(maxY); y++ {
		fy := float64(y) + 0.5
		var xs []float64
		for i := 0; i < len(pts); i++ {
			j := (i + 1) % len(pts)
			y0, y1 := pts[i][1], pts[j][1]
			if (y0 <= fy && y1 > fy) || (y1 <= fy && y0 > fy) {
				x := pts[i][0] + (fy-y0)/(y1-y0)*(pts[j][0]-pts[i][0])
				xs = append(xs, x)
			}
		}
		sort.Float64s(xs)
		for k := 0; k+1 < len(xs); k += 2 {
			drawHLine(img, int(xs[k]), int(xs[k+1]), y, c)
		}
	}
}

func setPixel(img *image.RGBA, x, y int, c color.RGBA) {
	if x < 0 || y < 0 || x >= img.Bounds().Max.X || y >= img.Bounds().Max.Y {
		return
	}
	img.SetRGBA(x, y, c)
}

func abs(x int) int {
	if x < 0 {
		return -x
	}
	return x
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
