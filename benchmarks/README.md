# Large-board baseline

Run with:

```bash
npm run benchmark:capacity
```

The benchmark keeps persistence, layout inspection, bounded MCP reads, and a
two-element update observable as separate costs. It intentionally does not
claim browser FPS; pan/zoom rendering still needs a real Canvas benchmark.

Baseline captured on 2026-09-02 with Node.js 25.5.0, Apple M4, 16 GiB RAM:

| Elements | Canonical | Persisted | Capacity p95 | Layout p95 | Load p95 | 2-element update p50 / p95 | Bounded read p95 | MCP response |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 500 | 0.3 MiB | 0.5 MiB | 4.6 ms | 1.1 ms | 1.3 ms | 18.0 / 18.5 ms | 6.9 ms | 1.4 KiB |
| 2,000 | 1.4 MiB | 1.8 MiB | 11.3 ms | 1.2 ms | 6.2 ms | 66.8 / 74.2 ms | 18.0 ms | 1.5 KiB |
| 5,000 | 3.4 MiB | 4.6 MiB | 28.7 ms | 1.4 ms | 15.0 ms | 165.8 / 189.3 ms | 43.4 ms | 1.5 KiB |
| 10,000 | 6.8 MiB | 9.1 MiB | 61.5 ms | 1.9 ms | 29.4 ms | 336.4 / 400.7 ms | 108.4 ms | 1.5 KiB |

Interpretation:

- 10,000 ordinary elements remain well below the 256 MiB anomaly fuse.
- Default model-facing reads stay around 1.5 KiB instead of serializing the
  complete 9.1 MiB persisted board.
- Small updates still rewrite the atomic scene file, so persistence time grows
  with board size, but the request/context payload remains two ops and the
  measured 10,000-element p95 is below 0.5 s on this machine.
- Canvas interaction FPS and image-heavy boards are separate follow-up
  benchmarks; JSON byte size is not used as a substitute for either.
