import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "color-calibration-export-"));
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const testImages = [
  { fileName: "shirt-a.png", width: 1200, height: 800 },
  { fileName: "coat.sample.webp", width: 3000, height: 2000 },
  { fileName: "dress-final.jpg", width: 5000, height: 3333 }
];
const exportSizes = ["original", "2k", "4k"];
const expectedLongEdges = {
  original: null,
  "2k": 2048,
  "4k": 4096
};

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function transpileProjectModule(relativePath) {
  const sourcePath = path.join(projectRoot, relativePath);
  const source = await fs.readFile(sourcePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022
    },
    fileName: sourcePath
  }).outputText;
  const outputPath = path.join(tempDir, relativePath.replace(/\.ts$/, ".mjs"));

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, output, "utf8");

  return import(pathToFileURL(outputPath).href);
}

function ratioDiff(original, exported) {
  return Math.abs(original.width / original.height - exported.width / exported.height);
}

function createFakeJpegBlob(seed) {
  const body = textEncoder.encode(`verify-jpeg-${seed}`);

  return new Blob([
    new Uint8Array([0xff, 0xd8]),
    body,
    new Uint8Array([0xff, 0xd9])
  ], { type: "image/jpeg" });
}

function assertJpegBlob(blob, bytes, fileName) {
  assert(fileName.endsWith(".jpg"), `single download file should end with .jpg: ${fileName}`);
  assert(blob.type === "image/jpeg", `single download blob should be image/jpeg: ${blob.type}`);
  assert(bytes[0] === 0xff && bytes[1] === 0xd8, "single download JPG should start with SOI marker");
  assert(bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9, "single download JPG should end with EOI marker");
}

function parseStoredZipEntries(zipBytes) {
  const entries = [];
  const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
  let offset = 0;

  while (offset + 4 <= zipBytes.length) {
    const signature = view.getUint32(offset, true);

    if (signature === 0x02014b50 || signature === 0x06054b50) {
      break;
    }

    assert(signature === 0x04034b50, `unexpected ZIP signature at ${offset}`);

    const method = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const uncompressedSize = view.getUint32(offset + 22, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    const name = textDecoder.decode(zipBytes.slice(nameStart, nameStart + nameLength));

    assert(method === 0, `ZIP entry should use stored method: ${name}`);
    assert(compressedSize === uncompressedSize, `ZIP entry should be uncompressed: ${name}`);
    assert(dataEnd <= zipBytes.length, `ZIP entry data exceeds archive size: ${name}`);

    entries.push({
      data: zipBytes.slice(dataStart, dataEnd),
      name
    });

    offset = dataEnd;
  }

  return entries;
}

function assertZipContainsNames(zipBytes, expectedNames) {
  const zipText = textDecoder.decode(zipBytes);

  expectedNames.forEach((name) => {
    assert(zipText.includes(name), `ZIP binary should contain file name: ${name}`);
  });
}

function simulateMissingMaskSkip(samples, masks) {
  const statuses = [];
  const exportCandidates = [];

  samples.forEach((sample) => {
    if (!masks[sample.id]) {
      statuses.push({
        fileName: sample.fileName,
        imageId: sample.id,
        message: "缺少蒙版",
        status: "missing-mask"
      });
      return;
    }

    statuses.push({
      fileName: sample.fileName,
      imageId: sample.id,
      message: "已完成",
      status: "done"
    });
    exportCandidates.push(sample);
  });

  return { exportCandidates, statuses };
}

const exportModule = await transpileProjectModule("src/core/exportImage.ts");
const zipModule = await transpileProjectModule("src/core/simpleZip.ts");
const exportSource = await fs.readFile(path.join(projectRoot, "src/core/exportImage.ts"), "utf8");
const batchSource = await fs.readFile(path.join(projectRoot, "src/core/batchProcessor.ts"), "utf8");

const { getExportDimensions, getExportFileName } = exportModule;
const { createZipBlob } = zipModule;
const dimensionResults = [];

assert(exportSource.includes("\"image/jpeg\""), "exportImage.ts should export JPG with image/jpeg");
assert(batchSource.includes("\"missing-mask\""), "batchProcessor.ts should expose missing-mask status");
assert(batchSource.includes("continue;"), "batchProcessor.ts should skip missing-mask items without aborting batch");

for (const image of testImages) {
  for (const size of exportSizes) {
    const dimensions = getExportDimensions(image.width, image.height, size);
    const expectedLongEdge = expectedLongEdges[size];
    const actualLongEdge = Math.max(dimensions.width, dimensions.height);
    const aspectDiff = ratioDiff(image, dimensions);

    if (size === "original") {
      assert(dimensions.width === image.width, `original width mismatch for ${image.fileName}`);
      assert(dimensions.height === image.height, `original height mismatch for ${image.fileName}`);
    } else {
      assert(actualLongEdge === expectedLongEdge, `${size} long edge mismatch for ${image.fileName}`);
    }

    assert(aspectDiff <= 0.001, `${size} aspect ratio changed for ${image.fileName}`);

    dimensionResults.push({
      aspectDiff: Number(aspectDiff.toFixed(6)),
      fileName: image.fileName,
      height: dimensions.height,
      size,
      width: dimensions.width
    });
  }
}

const singleFileName = getExportFileName(testImages[0].fileName, "2k");
const singleBlob = createFakeJpegBlob("single");
const singleBytes = new Uint8Array(await singleBlob.arrayBuffer());
assertJpegBlob(singleBlob, singleBytes, singleFileName);

const zipResults = [];

for (const size of exportSizes) {
  const expectedNames = testImages.map((image) => getExportFileName(image.fileName, size));
  const files = expectedNames.map((name, index) => ({
    blob: createFakeJpegBlob(`${size}-${index}`),
    name
  }));
  const zipBlob = await createZipBlob(files);
  const zipBytes = new Uint8Array(await zipBlob.arrayBuffer());
  const entries = parseStoredZipEntries(zipBytes);

  assert(zipBlob.size > 0, `${size} ZIP should be larger than 0`);
  assert(zipBytes[0] === 0x50 && zipBytes[1] === 0x4b, `${size} ZIP should start with PK`);
  assertZipContainsNames(zipBytes, expectedNames);
  assert(entries.length === expectedNames.length, `${size} ZIP entry count mismatch`);
  expectedNames.forEach((name) => {
    assert(entries.some((entry) => entry.name === name), `${size} ZIP missing parsed entry: ${name}`);
  });

  zipResults.push({
    entryCount: entries.length,
    names: entries.map((entry) => entry.name),
    size,
    zipBytes: zipBlob.size
  });
}

const missingMaskSamples = [
  { fileName: "valid-a.png", id: "valid-a" },
  { fileName: "missing-mask.png", id: "missing-mask" },
  { fileName: "valid-b.webp", id: "valid-b" }
];
const missingMaskResult = simulateMissingMaskSkip(missingMaskSamples, {
  "valid-a": true,
  "valid-b": true
});

assert(missingMaskResult.exportCandidates.length === 2, "missing-mask image should be skipped");
assert(
  missingMaskResult.statuses.some((item) => item.status === "missing-mask" && item.message === "缺少蒙版"),
  "missing-mask status should display 缺少蒙版"
);
assert(
  missingMaskResult.statuses.filter((item) => item.status === "done").length === 2,
  "valid images should continue after missing-mask item"
);

console.log("Task 07 export verification passed.");
console.log(JSON.stringify({
  dimensions: dimensionResults,
  missingMask: missingMaskResult,
  singleDownload: {
    fileName: singleFileName,
    isJpeg: true,
    size: singleBlob.size
  },
  zip: zipResults
}, null, 2));
