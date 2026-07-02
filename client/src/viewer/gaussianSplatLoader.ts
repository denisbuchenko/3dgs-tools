import * as SPLAT from "gsplat";

type LoadGaussianSplatOptions = {
  coverageScale: number;
  onProgress: (progress: number) => void;
  plyUrl: string;
  scene: SPLAT.Scene;
};

type PlyProperty = {
  name: string;
  offset: number;
  type: string;
};

const propertySizes: Record<string, number> = {
  char: 1,
  double: 8,
  float: 4,
  int: 4,
  short: 2,
  uchar: 1,
  uint: 4,
  ushort: 2,
};

function isPlyUrl(url: string) {
  return url.toLowerCase().split("?")[0].endsWith(".ply");
}

function fetchArrayBuffer(url: string, onProgress: (progress: number) => void) {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("GET", url, true);
    request.responseType = "arraybuffer";
    request.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(event.loaded / event.total);
      }
    };
    request.onerror = () => reject(new Error("Не удалось загрузить gaussian splats."));
    request.onload = () => {
      if (request.status >= 200 && request.status < 300 && request.response) {
        resolve(request.response);
        return;
      }

      reject(new Error("Не удалось загрузить gaussian splats."));
    };
    request.send();
  });
}

function parsePlyHeader(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const headerText = new TextDecoder().decode(bytes.slice(0, 1024 * 16));
  const marker = "end_header\n";
  const headerEnd = headerText.indexOf(marker);
  const vertexMatch = /element vertex (\d+)\n/.exec(headerText);

  if (headerEnd < 0 || !vertexMatch) {
    return null;
  }

  let offset = 0;
  const properties: PlyProperty[] = [];

  for (const line of headerText.slice(0, headerEnd).split("\n")) {
    if (!line.startsWith("property ")) {
      continue;
    }

    const [, type, name] = line.trim().split(/\s+/);
    const size = propertySizes[type];

    if (!size) {
      return null;
    }

    properties.push({ name, offset, type });
    offset += size;
  }

  return {
    dataStart: headerEnd + marker.length,
    properties,
    rowLength: offset,
    vertexCount: Number(vertexMatch[1]),
  };
}

function patchPlyCoverageScale(buffer: ArrayBuffer, coverageScale: number) {
  if (!Number.isFinite(coverageScale) || coverageScale <= 1.001) {
    return buffer;
  }

  const header = parsePlyHeader(buffer);

  if (!header) {
    return buffer;
  }

  const scaleProperties = ["scale_0", "scale_1", "scale_2"]
    .map((name) => header.properties.find((property) => property.name === name))
    .filter((property): property is PlyProperty => property?.type === "float");

  if (scaleProperties.length !== 3) {
    return buffer;
  }

  const patched = buffer.slice(0);
  const view = new DataView(patched);
  const logScale = Math.log(coverageScale);

  // Keep this as a pre-load PLY patch. The server may align centers by robust
  // object bounds, so gaussian footprints need the matching scale boost here.
  // Mutating gsplat buffers after load caused detached/out-of-bounds ArrayBuffer
  // errors, and transforming centers here would break the camera-space bridge.
  for (let index = 0; index < header.vertexCount; index += 1) {
    const rowStart = header.dataStart + index * header.rowLength;

    for (const property of scaleProperties) {
      const offset = rowStart + property.offset;
      view.setFloat32(offset, view.getFloat32(offset, true) + logScale, true);
    }
  }

  return patched;
}

export async function loadGaussianSplat({
  coverageScale,
  onProgress,
  plyUrl,
  scene,
}: LoadGaussianSplatOptions) {
  if (!isPlyUrl(plyUrl)) {
    return SPLAT.Loader.LoadAsync(plyUrl, scene, onProgress);
  }

  const buffer = await fetchArrayBuffer(plyUrl, onProgress);
  const patchedBuffer = patchPlyCoverageScale(buffer, coverageScale);
  const splat = SPLAT.PLYLoader.LoadFromArrayBuffer(patchedBuffer, scene);
  onProgress(1);

  return splat;
}
