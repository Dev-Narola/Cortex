// k6 load test for the /api/v1/search endpoint.
//
// Run with:
//   k6 run benchmarks/load/search.js
//
// Thresholds are tuned for the 1,000-tenant deployment
// (see Docs/scaling/capacity-planning.md).

import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const searchLatency = new Trend('search_latency_ms');

export const options = {
  stages: [
    { duration: '30s', target: 50 },
    { duration: '1m', target: 200 },
    { duration: '2m', target: 500 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<300', 'p(99)<500'],
    errors: ['rate<0.01'],
  },
};

const BASE = __ENV.CORTEX_BASE_URL || 'http://localhost:8000';
const TOKEN = __ENV.CORTEX_TOKEN || '';

export default function () {
  const res = http.post(
    `${BASE}/api/v1/search`,
    JSON.stringify({ query: 'load test query', limit: 10 }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TOKEN}`,
      },
    },
  );
  searchLatency.add(res.timings.duration);
  const ok = check(res, {
    'status is 200': (r) => r.status === 200,
    'has results': (r) => {
      const body = JSON.parse(r.body);
      return Array.isArray(body.results);
    },
  });
  errorRate.add(!ok);
}
