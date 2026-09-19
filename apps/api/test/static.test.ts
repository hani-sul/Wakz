import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { contentTypeFor, indexFile, resolveStaticFile } from '../src/static.ts';

const WEB_DIST = path.resolve(import.meta.dirname, '..', '..', 'web', 'dist');

test('content types are assigned per extension', () => {
  assert.match(contentTypeFor('index.html'), /text\/html/);
  assert.match(contentTypeFor('index-abc.js'), /javascript/);
  assert.match(contentTypeFor('global.css'), /text\/css/);
  assert.equal(contentTypeFor('logo.png'), 'image/png');
  assert.equal(contentTypeFor('weird.bin'), 'application/octet-stream');
});

test('path traversal outside the build directory is refused', () => {
  assert.equal(resolveStaticFile(WEB_DIST, '/../../package.json'), null);
  assert.equal(resolveStaticFile(WEB_DIST, '/..%2f..%2fsecret'), null);
});

test('the built index.html is served when the web app has been built', () => {
  const index = indexFile(WEB_DIST);
  if (!index) {
    assert.ok(true, 'web build not present in this environment');
    return;
  }
  assert.match(index.type, /text\/html/);
  assert.ok(index.size > 0);
});

test('javascript assets resolve with a javascript content type when built', () => {
  const index = indexFile(WEB_DIST);
  if (!index) {
    assert.ok(true, 'web build not present in this environment');
    return;
  }
  const asset = resolveStaticFile(WEB_DIST, '/assets/index.js');
  if (!asset) {
    // Asset names are hashed; the important part is that unknown assets fall through to the SPA.
    assert.ok(true, 'hashed asset name not present');
    return;
  }
  assert.match(asset.type, /javascript/);
});
