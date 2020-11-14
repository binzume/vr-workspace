package main

import (
	"flag"
	"image"
	"image/png"
	"log"
	"os"

	"golang.org/x/image/draw"
)

func main() {
	ofile := flag.String("o", "out.png", "output file")
	flag.Parse()

	var images []image.Image
	for _, f := range flag.Args() {
		reader, err := os.Open(f)
		if err != nil {
			log.Fatal(err)
		}
		defer reader.Close()
		m, _, err := image.Decode(reader)
		if err != nil {
			log.Fatal(err)
		}
		images = append(images, m)
	}

	if len(images) == 0 {
		log.Fatal("no image")
	}

	outWidth := images[0].Bounds().Dx() * 2
	outHeight := images[0].Bounds().Dx() * 4
	dst := image.NewRGBA(image.Rect(0, 0, outWidth, outHeight))

	x := 0
	y := 0
	for _, src := range images {
		w := src.Bounds().Dx()
		if x+w > outWidth {
			x = 0
			y += src.Bounds().Dy()
		}
		log.Println(x, y)
		draw.Draw(dst, image.Rect(x, y, x+w, y+src.Bounds().Dy()), src, image.ZP, draw.Src)
		x += w
	}

	writer, err := os.Create(*ofile)
	if err != nil {
		log.Fatal(err)
	}
	defer writer.Close()

	err = png.Encode(writer, dst)
	if err != nil {
		log.Fatal(err)
	}
}
