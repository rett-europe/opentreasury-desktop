#!/usr/bin/env node

/**
 * OneDrive Multi-Device File Append Smoke Test
 *
 * PURPOSE: Validate that OneDrive does NOT generate conflict copies when two
 * separate processes append to DIFFERENT files in the same synced folder.
 *
 * This is the critical assumption for SPEC-026 v2's per-device-file architecture.
 * If this spike FAILS (conflict copies appear), we need event-file conflict-merge
 * logic (+2 days).
 *
 * USAGE:
 *   node scripts/spikes/onedrive-multi-device.mjs <target-folder-path>
 *
 * BEHAVIOR:
 *   1. Spawns two child processes ("deviceA" and "deviceB")
 *   2. Each child appends 50 lines (1/second) to its own file in the target folder
 *   3. After both complete (~50s), waits 120s for OneDrive sync to settle
 *   4. Scans for conflict copies and validates both files are intact
 *   5. Prints PASS/FAIL with details
 *
 * ASSUMPTIONS:
 *   - Target folder is inside an active OneDrive-synced directory
 *   - No other processes are writing to the same folder during the test
 *   - OneDrive is running and connected
 *
 * THROWAWAY CODE: This script will be deleted after the spike. Do not integrate
 * into the app.
 */

import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- CONFIG ---
const LINES_PER_DEVICE = 50;
const APPEND_INTERVAL_MS = 1000; // 1 second between appends
const POST_WRITE_SETTLE_MS = 120_000; // 2 minutes for OneDrive sync

// Conflict copy patterns used by OneDrive, Dropbox, etc.
const CONFLICT_PATTERNS = [
  /-conflict-/i,
  /\(1\)/,
  /\(2\)/,
  /\([A-Za-z0-9-]+\)/, // e.g., (DESKTOP-NAME)
  /-\d{4}-\d{2}-\d{2}/, // Date suffix
];

// --- MAIN ---
async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1) {
    console.error('USAGE: node onedrive-multi-device.mjs <target-folder-path>');
    process.exit(1);
  }

  const targetFolder = path.resolve(args[0]);

  // Validate target folder exists
  try {
    const stat = await fs.stat(targetFolder);
    if (!stat.isDirectory()) {
      console.error(`ERROR: Target path is not a directory: ${targetFolder}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`ERROR: Cannot access target folder: ${targetFolder}`);
    console.error(err.message);
    process.exit(1);
  }

  console.log('=== OneDrive Multi-Device File Append Smoke Test ===\n');
  console.log(`Target folder: ${targetFolder}`);
  console.log(`Lines per device: ${LINES_PER_DEVICE}`);
  console.log(`Append interval: ${APPEND_INTERVAL_MS}ms`);
  console.log(`Post-write settle time: ${POST_WRITE_SETTLE_MS / 1000}s\n`);

  // Clean any pre-existing test files
  await cleanTestFiles(targetFolder);

  // Spawn two child writer processes
  console.log('Starting writer processes...\n');
  const startTime = Date.now();

  const [resultA, resultB] = await Promise.all([
    runWriter(targetFolder, 'deviceA'),
    runWriter(targetFolder, 'deviceB'),
  ]);

  const writeElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nBoth writers completed in ${writeElapsed}s`);

  if (!resultA.success || !resultB.success) {
    console.error('\n❌ SPIKE FAILED: One or both writer processes failed');
    console.error('DeviceA:', resultA.error || 'OK');
    console.error('DeviceB:', resultB.error || 'OK');
    process.exit(1);
  }

  // Wait for OneDrive sync to settle
  console.log(`\nWaiting ${POST_WRITE_SETTLE_MS / 1000}s for OneDrive sync to settle...`);
  await sleep(POST_WRITE_SETTLE_MS);

  // Validate results
  console.log('\nValidating results...\n');
  const validation = await validateResults(targetFolder);

  // Print summary
  printSummary(validation);

  process.exit(validation.passed ? 0 : 1);
}

// --- WRITER CHILD PROCESS ---
async function runWriter(targetFolder, deviceId) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [__filename, '--child', targetFolder, deviceId, LINES_PER_DEVICE.toString()],
      { stdio: 'inherit' },
    );

    child.on('exit', (code) => {
      if (code === 0) {
        resolve({ success: true, deviceId });
      } else {
        resolve({ success: false, deviceId, error: `Exit code ${code}` });
      }
    });

    child.on('error', (err) => {
      resolve({ success: false, deviceId, error: err.message });
    });
  });
}

// --- CHILD WRITER IMPLEMENTATION ---
async function childWriter(targetFolder, deviceId, lineCount) {
  const filePath = path.join(targetFolder, `events-${deviceId}.ndjson`);
  console.log(`[${deviceId}] Writing ${lineCount} lines to ${filePath}`);

  for (let i = 1; i <= lineCount; i++) {
    const timestamp = new Date().toISOString();
    const line = JSON.stringify({
      deviceId,
      lineNumber: i,
      timestamp,
      message: `Append from ${deviceId} line ${i}`,
    });

    await fs.appendFile(filePath, line + '\n', 'utf8');

    if (i % 10 === 0) {
      console.log(`[${deviceId}] Written ${i}/${lineCount} lines`);
    }

    // Sleep between appends (except after the last line)
    if (i < lineCount) {
      await sleep(APPEND_INTERVAL_MS);
    }
  }

  console.log(`[${deviceId}] Completed ${lineCount} lines`);
}

// --- VALIDATION ---
async function validateResults(targetFolder) {
  const results = {
    passed: true,
    targetFiles: {
      'events-deviceA.ndjson': null,
      'events-deviceB.ndjson': null,
    },
    conflictFiles: [],
    errors: [],
  };

  // Read directory
  let files;
  try {
    files = await fs.readdir(targetFolder);
  } catch (err) {
    results.passed = false;
    results.errors.push(`Cannot read target folder: ${err.message}`);
    return results;
  }

  // Check for conflict copies
  const conflictFiles = files.filter((f) => CONFLICT_PATTERNS.some((pattern) => pattern.test(f)));

  if (conflictFiles.length > 0) {
    results.passed = false;
    results.conflictFiles = conflictFiles;
    results.errors.push(`Found ${conflictFiles.length} conflict copy/copies`);
  }

  // Validate target files
  for (const targetFile of Object.keys(results.targetFiles)) {
    const filePath = path.join(targetFolder, targetFile);

    try {
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.trim().split('\n');

      results.targetFiles[targetFile] = {
        exists: true,
        lineCount: lines.length,
        wellFormed: true,
      };

      // Validate line count
      if (lines.length !== LINES_PER_DEVICE) {
        results.passed = false;
        results.errors.push(
          `${targetFile}: Expected ${LINES_PER_DEVICE} lines, got ${lines.length}`,
        );
        results.targetFiles[targetFile].wellFormed = false;
      }

      // Validate each line is valid JSON
      for (let i = 0; i < lines.length; i++) {
        try {
          JSON.parse(lines[i]);
        } catch {
          results.passed = false;
          results.errors.push(`${targetFile}: Line ${i + 1} is not valid JSON`);
          results.targetFiles[targetFile].wellFormed = false;
          break; // Don't spam errors
        }
      }
    } catch (err) {
      results.passed = false;
      results.targetFiles[targetFile] = { exists: false };
      results.errors.push(`${targetFile}: File missing or unreadable (${err.message})`);
    }
  }

  // Verify combined line count
  const totalLines = Object.values(results.targetFiles)
    .filter((f) => f && f.exists)
    .reduce((sum, f) => sum + (f.lineCount || 0), 0);

  const expectedTotal = LINES_PER_DEVICE * 2;
  if (totalLines !== expectedTotal) {
    results.passed = false;
    results.errors.push(`Combined line count: Expected ${expectedTotal}, got ${totalLines}`);
  }

  return results;
}

// --- CLEANUP ---
async function cleanTestFiles(targetFolder) {
  const files = await fs.readdir(targetFolder);
  const testFiles = files.filter((f) => f.startsWith('events-device'));

  if (testFiles.length > 0) {
    console.log(`Cleaning ${testFiles.length} pre-existing test file(s)...`);
    await Promise.all(testFiles.map((f) => fs.unlink(path.join(targetFolder, f)).catch(() => {})));
  }
}

// --- OUTPUT ---
function printSummary(validation) {
  console.log('='.repeat(60));
  if (validation.passed) {
    console.log('✅ SPIKE PASSED');
    console.log('\nOneDrive did NOT generate conflict copies when two processes');
    console.log('appended to different files in the same folder.');
    console.log('\nIMPLICATION: SPEC-026 v2 per-device-file architecture is safe');
    console.log('to proceed. No conflict-merge logic needed for event files.');
  } else {
    console.log('❌ SPIKE FAILED');
    console.log('\nIMPLICATION: SPEC-026 v2 per-device-file architecture needs');
    console.log('conflict-merge logic for event files. Estimated cost: +2 days.');
  }

  console.log('\n' + '='.repeat(60));
  console.log('DETAILS:\n');

  // Target files
  for (const [filename, info] of Object.entries(validation.targetFiles)) {
    if (info && info.exists) {
      const status = info.wellFormed && info.lineCount === LINES_PER_DEVICE ? '✅' : '❌';
      console.log(`${status} ${filename}: ${info.lineCount} lines (expected ${LINES_PER_DEVICE})`);
    } else {
      console.log(`❌ ${filename}: MISSING`);
    }
  }

  // Conflict files
  if (validation.conflictFiles.length > 0) {
    console.log(`\n❌ Conflict copies found (${validation.conflictFiles.length}):`);
    validation.conflictFiles.forEach((f) => console.log(`   - ${f}`));
  } else {
    console.log('\n✅ No conflict copies detected');
  }

  // Errors
  if (validation.errors.length > 0) {
    console.log('\nERRORS:');
    validation.errors.forEach((e) => console.log(`   - ${e}`));
  }

  console.log('\n' + '='.repeat(60));
}

// --- HELPERS ---
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- ENTRY POINT ---
if (process.argv[2] === '--child') {
  // Child writer process
  const [, , , targetFolder, deviceId, lineCount] = process.argv;
  childWriter(targetFolder, deviceId, parseInt(lineCount, 10))
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(`[${deviceId}] FATAL:`, err);
      process.exit(1);
    });
} else {
  // Main orchestrator
  main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
  });
}
