import type { DominantColor } from "./types";

export const extractDominantColor = (imageUrl: string): Promise<DominantColor> =>
  new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve({ r: 30, g: 20, b: 40 });
        return;
      }

      const size = 50;
      canvas.width = size;
      canvas.height = size;
      ctx.drawImage(img, 0, 0, size, size);

      const imageData = ctx.getImageData(0, 0, size, size);
      const pixels = imageData.data;

      let totalR = 0;
      let totalG = 0;
      let totalB = 0;
      let count = 0;

      for (let i = 0; i < pixels.length; i += 16) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        const brightness = (r + g + b) / 3;
        if (brightness > 30 && brightness < 220) {
          totalR += r;
          totalG += g;
          totalB += b;
          count++;
        }
      }

      if (count === 0) {
        resolve({ r: 30, g: 20, b: 40 });
        return;
      }

      resolve({
        r: Math.round(totalR / count),
        g: Math.round(totalG / count),
        b: Math.round(totalB / count),
      });
    };

    img.onerror = () => resolve({ r: 30, g: 20, b: 40 });
    img.src = imageUrl;
  });
