# Test fixtures

`pose.jpg` is not stored in this repository. The browser test of the camera path
(`test/e2e/webcam.e2e.test.js`) plays it as a fake webcam. It is a photo of a person with arms out from
MediaPipe's public test assets; download it before running that test:

```
curl -o test/fixtures/pose.jpg https://storage.googleapis.com/mediapipe-assets/pose.jpg
```

Without it, that test is skipped (everything else still runs).
