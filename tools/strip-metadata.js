#!/usr/bin/env node
/**
 * Losslessly strip privacy metadata (EXIF / XMP / IPTC / comments / text chunks)
 * from JPEG and PNG files WITHOUT re-encoding the image data.
 *
 * Node port of tools/strip_metadata.py - same output, same exit codes, no deps.
 *
 * - JPEG: removes APP1 (EXIF/XMP), APP13 (IPTC/Photoshop), APP12 and COM segments.
 *         Keeps APP0 (JFIF), APP2 (ICC colour profile) and APP14 (Adobe) so
 *         colours look identical.
 * - PNG:  removes tEXt / iTXt / zTXt / eXIf / tIME chunks.
 *         Keeps iCCP / sRGB / gAMA / cHRM / pHYs.
 *
 * Usage
 * -----
 *     node tools/strip-metadata.js assets             # clean a folder
 *     node tools/strip-metadata.js assets --dry-run   # preview only
 *     node tools/strip-metadata.js assets --check     # report metadata, change nothing
 *
 * The --check mode exits with code 1 if any metadata is found, so it can be
 * used in a pre-commit hook or CI step.
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const JPEG_EXTS = new Set([".jpg", ".jpeg", ".jpe", ".jfif"]);

// JPEG markers that carry privacy metadata and are removed.
const JPEG_META = new Map([
  [0xe1, "APP1 (EXIF/XMP)"],
  [0xed, "APP13 (IPTC/Photoshop)"],
  [0xec, "APP12"],
  [0xfe, "COM (comment)"],
]);

const PNG_EXTS = new Set([".png"]);
const PNG_META = new Map([
  ["tEXt", "tEXt (text)"],
  ["iTXt", "iTXt (international text)"],
  ["zTXt", "zTXt (compressed text)"],
  ["eXIf", "eXIf (EXIF)"],
  ["tIME", "tIME (timestamp)"],
]);

const JPEG_SOI = Buffer.from([0xff, 0xd8]);
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function startsWith(data, prefix) {
  return data.length >= prefix.length && data.subarray(0, prefix.length).equals(prefix);
}

/** Report the metadata markers present in a JPEG, stopping at the image scan. */
function findJpegMeta(data) {
  const names = [];
  if (!startsWith(data, JPEG_SOI)) return names;

  let pos = 2;
  while (pos < data.length) {
    if (data[pos] !== 0xff) return names;
    while (pos < data.length && data[pos] === 0xff) pos += 1;
    if (pos >= data.length) return names;
    const marker = data[pos];
    pos += 1;

    if (marker === 0xd9) return names;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;

    if (pos + 2 > data.length) return names;
    const segLen = data.readUInt16BE(pos);
    const segEnd = pos + segLen;
    if (segLen < 2 || segEnd > data.length) return names;

    const name = JPEG_META.get(marker);
    if (name) names.push(name);

    if (marker === 0xda) return names; // SOS: the rest is entropy-coded image data
    pos = segEnd;
  }

  return names;
}

function stripJpeg(data) {
  if (!startsWith(data, JPEG_SOI)) return { data, changed: false };

  const out = [JPEG_SOI];
  let changed = false;
  let pos = 2;

  while (pos < data.length) {
    if (data[pos] !== 0xff) return { data, changed: false };
    const start = pos;
    while (pos < data.length && data[pos] === 0xff) pos += 1;
    if (pos >= data.length) break;
    const marker = data[pos];
    pos += 1;

    if (marker === 0xd9) {
      out.push(data.subarray(start, pos));
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      out.push(data.subarray(start, pos));
      continue;
    }

    if (pos + 2 > data.length) return { data, changed: false };
    const segLen = data.readUInt16BE(pos);
    const segEnd = pos + segLen;
    if (segLen < 2 || segEnd > data.length) return { data, changed: false };

    if (marker === 0xda) {
      out.push(data.subarray(start, segEnd), data.subarray(segEnd));
      return { data: Buffer.concat(out), changed };
    }

    if (JPEG_META.has(marker)) changed = true;
    else out.push(data.subarray(start, segEnd));
    pos = segEnd;
  }

  return { data: Buffer.concat(out), changed };
}

/** Report the metadata chunks present in a PNG. */
function findPngMeta(data) {
  const names = [];
  if (!startsWith(data, PNG_SIG)) return names;

  let pos = 8;
  while (pos + 12 <= data.length) {
    const length = data.readUInt32BE(pos);
    const ctype = data.toString("latin1", pos + 4, pos + 8);
    const total = 12 + length;
    if (pos + total > data.length) break;
    const name = PNG_META.get(ctype);
    if (name) names.push(name);
    pos += total;
    if (ctype === "IEND") break;
  }

  return names;
}

function stripPng(data) {
  if (!startsWith(data, PNG_SIG)) return { data, changed: false };

  const out = [PNG_SIG];
  let pos = 8;
  let changed = false;

  while (pos + 12 <= data.length) {
    const length = data.readUInt32BE(pos);
    const ctype = data.toString("latin1", pos + 4, pos + 8);
    const total = 12 + length;
    if (pos + total > data.length) return { data, changed: false };
    const chunk = data.subarray(pos, pos + total);

    if (PNG_META.has(ctype)) changed = true;
    else out.push(chunk);

    pos += total;
    if (ctype === "IEND") break;
  }

  return { data: Buffer.concat(out), changed };
}

function* iterImages(root) {
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    const dirs = [];
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== ".git") dirs.push(full);
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (JPEG_EXTS.has(ext) || PNG_EXTS.has(ext)) yield { file: full, ext };
    }
    // Depth-first, visiting subdirectories in name order.
    for (let i = dirs.length - 1; i >= 0; i -= 1) stack.push(dirs[i]);
  }
}

function clean(root, dryRun) {
  let total = 0;
  let changed = 0;
  let saved = 0;
  let failed = false;

  for (const { file, ext } of iterImages(root)) {
    total += 1;
    let data;
    try {
      data = fs.readFileSync(file);
    } catch {
      continue;
    }

    const result = (PNG_EXTS.has(ext) ? stripPng : stripJpeg)(data);
    if (!result.changed || result.data.equals(data)) continue;

    const rel = path.relative(root, file) || path.basename(file);
    const delta = data.length - result.data.length;
    saved += delta;
    changed += 1;
    console.log(`  ${rel}: -${delta} bytes`);

    if (dryRun) continue;
    try {
      fs.writeFileSync(file, result.data);
    } catch (err) {
      failed = true;
      console.error(`  ERROR ${rel}: ${err.message}`);
    }
  }

  const verb = dryRun ? "Would clean" : "Cleaned";
  console.log(`\n${verb} ${changed} of ${total} image(s); ${saved} bytes removed.`);
  return failed ? 1 : 0;
}

function check(root) {
  let total = 0;
  let dirty = 0;

  for (const { file, ext } of iterImages(root)) {
    total += 1;
    let data;
    try {
      data = fs.readFileSync(file);
    } catch {
      continue;
    }

    const tags = (PNG_EXTS.has(ext) ? findPngMeta : findJpegMeta)(data);
    if (tags.length) {
      dirty += 1;
      console.log(`  METADATA  ${path.relative(root, file)}: ${tags.join(", ")}`);
    }
  }

  console.log(`\nChecked ${total} image(s): ${dirty} still contain metadata.`);
  if (dirty === 0) {
    console.log("Result: CLEAN - no privacy metadata found.");
    return 0;
  }
  console.log("Result: run this script without --check to remove it.");
  return 1;
}

function printHelp() {
  console.log(`Usage: node tools/strip-metadata.js [folder] [--check] [--dry-run]

Losslessly strips EXIF / XMP / IPTC / comments / text chunks from JPEG and PNG
files without re-encoding them. Recurses into subfolders, skipping .git.

  (no flag)   remove the metadata in place
  --dry-run   show what would be removed, change nothing
  --check     report metadata only; exits 1 if any is found

  folder      directory to scan (default: .)`);
}

function main(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    return 0;
  }

  const root = argv.find((arg) => !arg.startsWith("-")) ?? ".";

  let stat;
  try {
    stat = fs.statSync(root);
  } catch {
    console.error(`Not found: ${root}`);
    return 2;
  }
  if (!stat.isDirectory()) {
    console.error(`Not a directory: ${root}`);
    return 2;
  }

  if (argv.includes("--check")) return check(root);
  return clean(root, argv.includes("--dry-run"));
}

process.exitCode = main(process.argv.slice(2));
