import assert from 'node:assert/strict';
import test from 'node:test';
import { asArray, isAllowedPublicUrl, parseFeed, parseXml, stripHtml, textOf } from '../src/http.ts';

test('SSRF guard rejects private and non-http targets', () => {
  assert.equal(isAllowedPublicUrl('https://status.github.com'), true);
  assert.equal(isAllowedPublicUrl('http://example.com/feed'), true);
  assert.equal(isAllowedPublicUrl('http://localhost:3000'), false);
  assert.equal(isAllowedPublicUrl('http://127.0.0.1/'), false);
  assert.equal(isAllowedPublicUrl('http://10.0.0.5/'), false);
  assert.equal(isAllowedPublicUrl('http://192.168.1.10/'), false);
  assert.equal(isAllowedPublicUrl('http://169.254.169.254/latest/meta-data'), false);
  assert.equal(isAllowedPublicUrl('file:///etc/passwd'), false);
  assert.equal(isAllowedPublicUrl('gopher://example.com'), false);
  assert.equal(isAllowedPublicUrl('https://user:pass@example.com'), false);
  assert.equal(isAllowedPublicUrl('not a url'), false);
});

test('xml reader parses nested elements, lists and attributes', () => {
  const document = parseXml(`<?xml version="1.0"?><ServiceStatus><Status><State>None</State><Id>1</Id></Status>
    <CoreServices><Category><Id>2</Id><Name>Core</Name><Status><Name>None</Name></Status></Category>
    <Category><Id>3</Id><Name>Purchase</Name><Status><Name>Impact</Name></Status></Category></CoreServices></ServiceStatus>`);

  const serviceStatus = document.ServiceStatus as Record<string, unknown>;
  const statusNode = serviceStatus.Status as Record<string, unknown>;
  assert.equal(textOf(statusNode.State), 'None');
  const categories = asArray<Record<string, unknown>>(((serviceStatus.CoreServices as Record<string, unknown>).Category) as Record<string, unknown>);
  assert.equal(categories.length, 2);
  assert.equal(textOf(categories[1]?.Name), 'Purchase');
});

test('feed reader extracts items, links and dates', () => {
  const items = parseFeed(`<rss version="2.0"><channel>
    <item><title>tmdb-api - Operational</title><link>https://status.example/x</link>
    <pubDate>Mon, 20 Oct 2025 17:07:32 -0600</pubDate>
    <description><![CDATA[tmdb-api is Operational]]></description><guid>abc</guid></item>
    </channel></rss>`);

  assert.equal(items.length, 1);
  assert.equal(items[0]?.title, 'tmdb-api - Operational');
  assert.equal(items[0]?.link, 'https://status.example/x');
  assert.match(items[0]?.description ?? '', /Operational/);
});

test('stripHtml removes markup and entities', () => {
  assert.equal(stripHtml('<p><strong>Status:</strong> resolved &amp; restored</p>'), 'Status: resolved & restored');
});
