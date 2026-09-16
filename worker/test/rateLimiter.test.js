import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseStravaRateLimitHeaders,
  hasQuota,
  isDailyQuotaExhausted,
  secondsUntilNextWindow,
  secondsUntilNextDay,
} from '../src/rateLimiter.js';

test('parseStravaRateLimitHeaders liest Strava-Header korrekt (15min,Tag)', () => {
  const headers = new Headers({ 'X-RateLimit-Limit': '200,2000', 'X-RateLimit-Usage': '15,340' });
  const state = parseStravaRateLimitHeaders(headers);
  assert.equal(state.limit15min, 200);
  assert.equal(state.limitDaily, 2000);
  assert.equal(state.usage15min, 15);
  assert.equal(state.usageDaily, 340);
  assert.ok(state.updatedAt > 0);
});

test('parseStravaRateLimitHeaders liefert null ohne die Header', () => {
  const headers = new Headers();
  assert.equal(parseStravaRateLimitHeaders(headers), null);
});

test('hasQuota: kein bekannter Stand -> erlaubt (erster Aufruf)', () => {
  assert.equal(hasQuota(null), true);
});

test('hasQuota: deutlich unter beiden Limits -> erlaubt', () => {
  const state = { limit15min: 200, limitDaily: 2000, usage15min: 10, usageDaily: 100, updatedAt: Date.now() };
  assert.equal(hasQuota(state), true);
});

test('hasQuota: 15-Minuten-Limit nahezu ausgeschoepft (>=90%) -> gesperrt', () => {
  const state = { limit15min: 200, limitDaily: 2000, usage15min: 185, usageDaily: 100, updatedAt: Date.now() };
  assert.equal(hasQuota(state), false);
});

test('hasQuota: Tageslimit nahezu ausgeschoepft -> gesperrt, auch wenn 15-Minuten-Fenster noch Luft hat', () => {
  const state = { limit15min: 200, limitDaily: 2000, usage15min: 5, usageDaily: 1850, updatedAt: Date.now() };
  assert.equal(hasQuota(state), false);
});

test('hasQuota: veralteter Stand (aelter als 15 Minuten) wird ignoriert -> erlaubt', () => {
  const state = { limit15min: 200, limitDaily: 2000, usage15min: 199, usageDaily: 1999, updatedAt: Date.now() - 16 * 60 * 1000 };
  assert.equal(hasQuota(state), true);
});

test('isDailyQuotaExhausted: erkennt ausgeschoepftes Tageskontingent', () => {
  const state = { limit15min: 200, limitDaily: 2000, usage15min: 5, usageDaily: 1850, updatedAt: Date.now() };
  assert.equal(isDailyQuotaExhausted(state), true);
});

test('isDailyQuotaExhausted: false, wenn noch Kontingent da', () => {
  const state = { limit15min: 200, limitDaily: 2000, usage15min: 5, usageDaily: 100, updatedAt: Date.now() };
  assert.equal(isDailyQuotaExhausted(state), false);
});

test('secondsUntilNextWindow liegt immer zwischen 0 und 900', () => {
  for (const minute of [0, 1, 14, 15, 29, 44, 59]) {
    const now = new Date(Date.UTC(2026, 0, 1, 10, minute, 30));
    const s = secondsUntilNextWindow(now);
    assert.ok(s > 0 && s <= 900, `minute=${minute} -> ${s}`);
  }
});

test('secondsUntilNextDay liegt immer zwischen 0 und 86400', () => {
  const now = new Date(Date.UTC(2026, 0, 1, 23, 59, 59));
  const s = secondsUntilNextDay(now);
  assert.ok(s > 0 && s <= 86400);
});
