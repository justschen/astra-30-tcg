export async function compressedAsset(url, label = 'Asset') {
  const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error(`${label} could not load (HTTP ${response.status}): ${url}`);
  if (!response.body) throw new Error(`${label} response was empty.`);
  if (response.headers.get('content-encoding')?.includes('gzip')) return response.arrayBuffer();
  if (typeof DecompressionStream === 'undefined') throw new Error(`This browser cannot decode ${label.toLowerCase()}. Use a current browser or Pocket view.`);
  return new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}
