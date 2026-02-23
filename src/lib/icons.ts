/**
 * Generate a placeholder icon PNG using Canvas.
 * Renders the first letter of the script name on a colored background.
 */
export async function generateIcon(name: string, size: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Background gradient
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#6366f1'); // indigo-500
  gradient.addColorStop(1, '#8b5cf6'); // violet-500
  ctx.fillStyle = gradient;

  // Rounded rect
  const radius = size * 0.2;
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(size - radius, 0);
  ctx.quadraticCurveTo(size, 0, size, radius);
  ctx.lineTo(size, size - radius);
  ctx.quadraticCurveTo(size, size, size - radius, size);
  ctx.lineTo(radius, size);
  ctx.quadraticCurveTo(0, size, 0, size - radius);
  ctx.lineTo(0, radius);
  ctx.quadraticCurveTo(0, 0, radius, 0);
  ctx.closePath();
  ctx.fill();

  // Letter
  const letter = (name.trim()[0] || 'S').toUpperCase();
  ctx.fillStyle = 'white';
  ctx.font = `bold ${Math.floor(size * 0.55)}px -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, size / 2, size / 2);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas toBlob failed'));
    }, 'image/png');
  });
}

export async function generateIcons(name: string): Promise<Record<string, Blob>> {
  const sizes = [16, 48, 128] as const;
  const entries = await Promise.all(
    sizes.map(async size => [String(size), await generateIcon(name, size)] as const)
  );
  return Object.fromEntries(entries);
}
