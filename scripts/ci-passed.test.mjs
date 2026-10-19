import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ciPassed } from './ci-passed.mjs'

const job = (result, outputs = {}) => ({ result, outputs })
const four = (result) => ({
  static: job(result),
  build: job(result),
  e2e: job(result),
  'e2e-report': job(result),
})

test('T-36-03 push, verified, four skipped passes', () => {
  const needs = {
    'pr-verified': job('success', { verified: 'true' }),
    ...four('skipped'),
  }
  assert.equal(ciPassed({ event: 'push', needs }).ok, true)
})

test('T-36-03 push, verified, pr-verified failed fails', () => {
  const needs = {
    'pr-verified': job('failure', { verified: 'true' }),
    ...four('skipped'),
  }
  assert.equal(ciPassed({ event: 'push', needs }).ok, false)
})

test('T-36-03 push, verified, a test job ran but failed fails', () => {
  const needs = {
    'pr-verified': job('success', { verified: 'true' }),
    ...four('skipped'),
    build: job('failure'),
  }
  assert.equal(ciPassed({ event: 'push', needs }).ok, false)
})

test('T-36-03 pull request with one skipped job fails', () => {
  const needs = {
    'pr-verified': job('skipped'),
    ...four('success'),
    build: job('skipped'),
  }
  const r = ciPassed({ event: 'pull_request', needs })
  assert.equal(r.ok, false)
  assert.deepEqual(r.bad, [['build', 'skipped']])
})

test('T-36-03 pull request with all success and a skipped pr-verified passes', () => {
  const needs = { 'pr-verified': job('skipped'), ...four('success') }
  assert.equal(ciPassed({ event: 'pull_request', needs }).ok, true)
})

test('T-36-03 push, not verified, all success passes', () => {
  const needs = {
    'pr-verified': job('success', { verified: 'false' }),
    ...four('success'),
  }
  assert.equal(ciPassed({ event: 'push', needs }).ok, true)
})

test('T-36-03 push, not verified, skipped tests fail', () => {
  const needs = {
    'pr-verified': job('success', { verified: 'false' }),
    ...four('skipped'),
  }
  assert.equal(ciPassed({ event: 'push', needs }).ok, false)
})
