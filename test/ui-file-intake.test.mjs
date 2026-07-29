import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deriveOutputName, formatBytes, validateFile } from '../src/ui/file-intake.js';

test('formats file sizes', () => {
  assert.equal(formatBytes(500), '500 B');
  assert.equal(formatBytes(1536), '1.5 KB');
});

test('derives a safe output name', () => {
  assert.equal(deriveOutputName('photo.final.png'), 'photo.final-processed');
  assert.equal(deriveOutputName(''), 'output-processed');
});

test('validates file size and accepted MIME type', () => {
  const file = { name: 'photo.png', type: 'image/png', size: 1024 };
  assert.equal(validateFile(file, { accept: 'image/*' }).ok, true);
  assert.equal(validateFile(file, { accept: 'application/pdf' }).ok, false);
  assert.equal(validateFile({ ...file, size: 20 }, { maxSize: 10 }).ok, false);
});
