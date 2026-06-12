# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-06-12

### Removed

- The `input-gain` attribute and `inputGain` property. They were documented and typed but never wired to a `GainNode` — setting them had no effect in any released version. Input gain is permanently a host responsibility: build a gain chain and pass the processed stream as `inputStream` (see [docs/examples/host-gain.md](docs/examples/host-gain.md)). Consumer impact: TypeScript code referencing `inputGain` will no longer compile, and `'input-gain'` is no longer listed in `LatencyTest.observedAttributes` — runtime behavior is otherwise unchanged. Policy note: this project treats removal of documented-but-never-functional API as a minor release; strict semver would classify any public API removal as major.

## [1.1.0] - 2026-06-05

### Changed

- Default `recording-mode="mediarecorder"` upgraded to 2-channel capture (`ChannelMergerNode` + `MediaStreamDestinationNode`), removing start-timing bias; emits `latency-error` if the browser downmixes to mono.

### Added

- `recording-mode="mediarecorder-1ch"` single-channel fallback mode (direct mic stream, start-timing bias present).

## [1.0.2] - 2026-06-03

### Fixed

- Web component, build, and error-handling fixes plus documentation accuracy corrections from the Phases 1–3a review; CI workflow added (test, build, docs, pack verification).

## [1.0.1] - 2026-06-02

### Fixed

- Documentation accuracy and hardening patch; removed a duplicate `inputGain` declaration.

## [1.0.0] - 2026-06-02

### Added

- Initial release: headless `<latency-test>` Web Component measuring browser round-trip audio latency via MLS and cross-correlation, with `mediarecorder` and `audioworklet` recording modes, ESM/IIFE bundles, TypeScript declarations, VitePress documentation, and live demo.
