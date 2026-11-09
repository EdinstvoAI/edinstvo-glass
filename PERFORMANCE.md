# Rendering measurements

Run `npm run demo`, open `/test/performance.html` in a browser and call `await runBenchmark()` in its console. The fixture updates a canvas backdrop and invalidates 16 surfaces for 40 steps, then checks idle rendering. Each measured step waits for two animation frames; its timing is not an FPS measurement. It counts calls on the WebGL API, not completed GPU work.

Chrome headless, macOS, 9 November 2026, same local session and fixture:

| Operation | Before | After |
| --- | ---: | ---: |
| Texture allocations | 969 | 3 |
| Texture uploads/allocations through `texImage2D` | 1170 | 371 |
| Uniform location lookups | 2340 | 0 |
| Draw calls | 1356 | 1314 |
| Idle draw calls | 0 | 0 |
| Step median | 33.4 ms | 33.3 ms |
| Step p95 | 34.2 ms | 34.3 ms |

The change reduces allocation and driver work. This fixture did not show a measurable improvement in frame scheduling. It does not establish performance for large merged groups, mobile hardware or integrated WebViews.

Blur buffers are reused by size, with four cached blur strengths per source. The source cache uses LRU eviction, at most 32 sources and a target budget of 64 MiB including mip levels and blur buffers. A currently active source can exceed that budget on its own. The texture side limit remains 4096 or the device limit, whichever is smaller.

A nine-sample optimization was tested and removed: pairing samples at fractional mip levels produced visible stripes on Retina displays. The final blur keeps seventeen samples per axis, with precomputed weights. Visual quality takes priority over reducing the sampling count.
