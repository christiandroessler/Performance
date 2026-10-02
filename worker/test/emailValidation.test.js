import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidEmail } from '../src/emailValidation.js';

test('normale Adressen werden akzeptiert', () => {
  for (const e of ['christian.droessler@googlemail.com', 'a@b.de', 'max+tag@firma.example.org', 'vor_name-1@sub.domain.co.uk']) {
    assert.equal(isValidEmail(e), true, e);
  }
});

test('XSS-/Markup-Payloads werden abgelehnt', () => {
  for (const e of ['<img src=x onerror=alert(1)>@x.de', 'a@b.de<script>', '"><svg/onload=alert(1)>@x.de', "o'brien@x.de", 'a&b@x.de', 'a@b.de"onmouseover="x']) {
    assert.equal(isValidEmail(e), false, e);
  }
});

test('Strukturell ungueltige Adressen werden abgelehnt', () => {
  for (const e of ['', 'ohne-at.de', '@x.de', 'a@', 'a@@b.de', 'a@b', 'a@b..de', 'a b@x.de', 'a@b .de', 'a@.de', 'a@b.de ']) {
    assert.equal(isValidEmail(e), false, JSON.stringify(e));
  }
});

test('Laengenlimit 254 und Nicht-Strings', () => {
  const longLocal = 'a'.repeat(250);
  assert.equal(isValidEmail(`${longLocal}@x.de`), false);
  assert.equal(isValidEmail(`${'a'.repeat(240)}@x.de`), true);
  for (const v of [null, undefined, 42, {}, ['a@b.de']]) assert.equal(isValidEmail(v), false);
});
