# SelfConverter
Audio &amp; Video serverless converter, using client WASM FFMPEG.

A browser-based media converter powered by FFmpeg WebAssembly. The application processes files locally in the browser without uploading media to a remote server.

## Features

The converter supports three explicit conversion modes:

* Video to Video
* Video to Audio
* Audio to Audio

Supported formats depend on the selected mode and available FFmpeg codecs. Video conversion can produce common video containers such as MP4, WebM, MKV and AVI. Video files can also be converted to audio formats, while audio files can be converted between supported audio formats.

## Technical Details

The project uses FFmpeg WebAssembly (FFmpeg.wasm) to perform media processing directly in the browser. No backend media-processing service is required.

FFmpeg is initialized once and reused during the session. After a conversion, the internal FFmpeg instance and virtual filesystem are cleaned up so subsequent conversions can be performed without reloading the page.

Each conversion uses unique virtual filesystem filenames. This prevents collisions when different input files have the same original filename or when multiple conversions are performed during the same session.

File type detection is not based only on the filename extension. The application checks the browser-provided MIME type together with the actual file signature where possible. This prevents files with misleading extensions from being incorrectly classified.

Conversion progress is obtained from FFmpeg processing events and displayed as a real progress percentage rather than using a fixed or simulated value.

## File Size Limit

The maximum input file size is **1 GiB (1024 MiB)**.

The limit is intentionally lower than the theoretical 32-bit WASM address-space limit. FFmpeg requires additional memory for the WebAssembly runtime, virtual filesystem, decoding buffers, encoding buffers and output data. Allowing files close to the theoretical address-space maximum would therefore be unreliable in a browser environment.

The size limit is checked before the file is loaded into memory and before it is written to the FFmpeg virtual filesystem.

## Requirements

A modern browser with WebAssembly support is required. Media processing is performed locally, so available system memory can affect the maximum practical conversion workload.
