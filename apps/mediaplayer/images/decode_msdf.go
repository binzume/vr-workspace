package main

import (
	"flag"
	"image"
	"image/color"
	"image/png"
	"log"
	"os"

	"golang.org/x/image/draw"
)

func max(x, y uint32) uint32 {
	if x < y {
		return y
	}
	return x
}

func min(x, y uint32) uint32 {
	if x < y {
		return x
	}
	return y
}

func median(c color.Color) uint32 {
	r, g, b, _ := c.RGBA()
	return max(min(r, g), min(max(r, g), b))
}

func clamp(v int32, l, u uint32) uint32 {
	if v < int32(l) {
		return l
	}
	return min(uint32(v), u)
}

func main() {
	ofile := flag.String("o", "out.png", "output file")
	flag.Parse()

	reader, err := os.Open(flag.Args()[0])
	if err != nil {
		log.Fatal(err)
	}
	defer reader.Close()
	m, _, err := image.Decode(reader)
	if err != nil {
		log.Fatal(err)
	}

	var scale float32 = 16
	var pxRange float32 = 4
	bounds := m.Bounds()
	outWidth := int(float32(bounds.Dx()) * scale)
	outHeight := int(float32(bounds.Dy()) * scale)
	dst := image.NewRGBA(image.Rect(0, 0, outWidth, outHeight))

	draw.BiLinear.Scale(dst, dst.Bounds(), m, m.Bounds(), draw.Over, nil)
	for y := 0; y < outHeight; y++ {
		for x := 0; x < outWidth; x++ {
			sigDist := (float32(median(dst.At(x, y)))/65535 - 0.5) * pxRange * scale
			c := uint16(clamp(int32((sigDist+0.5)*65535.99), 0, 0xffff))
			dst.Set(x, y, color.RGBA64{c, c, c, 0xffff})
		}
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
