// Image files for the conversion tests, made in the browser.

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="3" height="2"><script>alert(1)</script><rect width="3" height="2" fill="red"/></svg>`;

export const svgFile = () =>
  new File([SVG], "drawing.svg", { type: "image/svg+xml" });

// A 3x2 WebP, drawn and encoded by a real canvas
export const webpFile = async () => {
  const canvas = document.createElement("canvas");
  canvas.width = 3;
  canvas.height = 2;
  canvas.getContext("2d")!.fillRect(0, 0, 3, 2);
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/webp");
  });
  return new File([blob!], "screenshot.webp", { type: "image/webp" });
};

export const gifFile = () =>
  new File(["GIF89a"], "animated.gif", { type: "image/gif" });

// Says it's a WebP, but no browser can decode it
export const brokenFile = () =>
  new File(["not an image"], "broken.webp", { type: "image/webp" });
