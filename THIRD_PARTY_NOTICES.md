# Third-party notices

motion-console's own code is under the MIT licence (`LICENSE`). It includes, unchanged, these files from
Google's MediaPipe, so the console works offline:

| Files | What | Licence |
|---|---|---|
| `vendor/vision_bundle.mjs`, `vendor/wasm/*` | MediaPipe Tasks Vision runtime, version 0.10.14 (the `@mediapipe/tasks-vision` npm package) | Apache License 2.0, `vendor/LICENSE` |
| `models/pose_landmarker_full.task`, `models/pose_landmarker_lite.task` | MediaPipe Pose Landmarker models (float16, version 1), from Google's MediaPipe model storage | Apache License 2.0, `models/LICENSE` |

Copyright Google LLC. Source: https://github.com/google-ai-edge/mediapipe. These files have not been modified.

The browser test's photo (`test/fixtures/pose.jpg`) is not included: it is downloaded from MediaPipe's public
test assets when needed (see `test/fixtures/README.md`).
