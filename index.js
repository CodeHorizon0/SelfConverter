let ffmpeg = null;
let tryMultiThread = false;
let ffmpegLoadPromise = null;
let ffmpegBlobURLs = [];
let ffmpegProgressHandlers = [];
let ffmpegConfig = null;

const FFMPEG_VERSION = "0.12.15";
const baseURLFFMPEG = `https://unpkg.com/@ffmpeg/ffmpeg@${FFMPEG_VERSION}/dist/umd`;
const CORE_VERSION = "0.12.10";
const baseURLCore = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`;
const CORE_MT_VERSION = "0.12.9";
const baseURLCoreMT = `https://unpkg.com/@ffmpeg/core-mt@${CORE_MT_VERSION}/dist/umd`;
const CORE_SIZE = {
    [`https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd/ffmpeg-core.js`]: 112059,
    [`https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd/ffmpeg-core.wasm`]: 32232419,
    [`https://unpkg.com/@ffmpeg/core-mt@${CORE_MT_VERSION}/dist/umd/ffmpeg-core.js`]: 129115,
    [`https://unpkg.com/@ffmpeg/core-mt@${CORE_MT_VERSION}/dist/umd/ffmpeg-core.wasm`]: 32718323,
    [`https://unpkg.com/@ffmpeg/core-mt@${CORE_MT_VERSION}/dist/umd/ffmpeg-core.worker.js`]: 2213,
    [`https://unpkg.com/@ffmpeg/ffmpeg@${FFMPEG_VERSION}/dist/umd/814.ffmpeg.js`]: 3177
};

const AUDIO_MIME_TYPES = new Set([
    "audio/aac",
    "audio/flac",
    "audio/mp4",
    "audio/m4a",
    "audio/mpeg",
    "audio/ogg",
    "audio/opus",
    "audio/wav",
    "audio/wave",
    "audio/x-flac",
    "audio/x-m4a",
    "audio/x-mpeg",
    "audio/x-wav",
    "audio/webm",
    "audio/x-ms-wma"
]);

const VIDEO_MIME_TYPES = new Set([
    "video/3gpp",
    "video/avi",
    "video/mp4",
    "video/mpeg",
    "video/quicktime",
    "video/webm",
    "video/x-flv",
    "video/x-m4v",
    "video/x-matroska",
    "video/x-ms-asf",
    "video/x-ms-wmv"
]);

function hasBytes(bytes, offset, values) {
    if (offset + values.length > bytes.length) {
        return false;
    }
    for (let index = 0; index < values.length; index += 1) {
        if (bytes[offset + index] !== values[index]) {
            return false;
        }
    }
    return true;
}

function hasAscii(bytes, offset, value) {
    return hasBytes(bytes, offset, Array.from(value, function(char) {
        return char.charCodeAt(0);
    }));
}

function isMpegAudio(bytes) {
    for (let index = 0; index + 1 < bytes.length; index += 1) {
        if (bytes[index] === 0xff && (bytes[index + 1] & 0xe0) === 0xe0) {
            const layer = (bytes[index + 1] >> 1) & 0x03;
            if (layer !== 0) {
                return true;
            }
        }
    }
    return false;
}

function isAdts(bytes) {
    if (bytes.length < 2 || bytes[0] !== 0xff) {
        return false;
    }
    return (bytes[1] & 0xf6) === 0xf0;
}

function getFileType(file) {
    const mimeType = file.type.toLowerCase().split(";")[0].trim();
    return file.arrayBuffer().then(function(buffer) {
        const bytes = new Uint8Array(buffer.slice(0, 4100));
        let format = "unknown";
        let type = "unknown";

        if (hasAscii(bytes, 0, "RIFF") && hasAscii(bytes, 8, "WAVE")) {
            type = "audio";
            format = "wav";
        } else if (hasAscii(bytes, 0, "fLaC")) {
            type = "audio";
            format = "flac";
        } else if (hasAscii(bytes, 0, "OggS")) {
            type = "audio";
            format = "ogg";
        } else if (hasAscii(bytes, 0, "ID3") || isMpegAudio(bytes)) {
            type = "audio";
            format = "mp3";
        } else if (isAdts(bytes)) {
            type = "audio";
            format = "aac";
        } else if (hasAscii(bytes, 0, "RIFF") && hasAscii(bytes, 8, "AVI ")) {
            type = "video";
            format = "avi";
        } else if (hasAscii(bytes, 0, "\u001aE\u001a\u001a")) {
            type = mimeType.startsWith("audio/") ? "audio" : "video";
            format = "webm";
        } else if (hasBytes(bytes, 0, [0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11, 0xa6, 0xd9, 0x00, 0xaa, 0x00, 0x62, 0xce, 0x6c])) {
            type = mimeType === "audio/x-ms-wma" ? "audio" : "video";
            format = "asf";
        } else {
            const ftypOffset = bytes.length >= 12 && hasAscii(bytes, 4, "ftyp") ? 8 : -1;
            if (ftypOffset >= 0) {
                const brand = String.fromCharCode(bytes[ftypOffset], bytes[ftypOffset + 1], bytes[ftypOffset + 2], bytes[ftypOffset + 3]).toLowerCase();
                const audioBrands = ["m4a ", "m4b ", "m4p ", "f4a ", "isom", "mp42", "mp41", "dash"];
                const isAudioBrand = audioBrands.includes(brand) && (mimeType.startsWith("audio/") || brand === "m4a " || brand === "m4b " || brand === "m4p " || brand === "f4a ");
                type = isAudioBrand ? "audio" : "video";
                format = "mp4";
            }
        }

        if (type === "unknown") {
            if (AUDIO_MIME_TYPES.has(mimeType)) {
                type = "audio";
                format = mimeType.replace("audio/", "");
            } else if (VIDEO_MIME_TYPES.has(mimeType)) {
                type = "video";
                format = mimeType.replace("video/", "");
            }
        }

        return { type, format, mimeType };
    });
}

function log(message) {
    const terminal = document.getElementById("tty");
    if (!terminal) {
        return;
    }
    const line = document.createElement("div");
    line.textContent = message;
    terminal.appendChild(line);
    terminal.scrollTop = terminal.scrollHeight;
}

function cleanLog() {
    const terminal = document.getElementById("tty");
    if (terminal) {
        terminal.textContent = "";
    }
}

async function toBlobURLPatched(url, mimeType, patcher) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    let body = await response.text();
    if (patcher) {
        body = patcher(body);
    }
    const blobURL = URL.createObjectURL(new Blob([body], { type: mimeType }));
    ffmpegBlobURLs.push(blobURL);
    return blobURL;
}

async function toBlobURL(url, mimeType, cb) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    const total = CORE_SIZE[url] || -1;
    let received = 0;
    const reader = response.body.getReader();
    const chunks = [];

    for (;;) {
        const result = await reader.read();
        if (result.done) {
            if (total !== -1 && total !== received) {
                throw new Error("Incomplete download");
            }
            cb && cb({ url, total, received, delta: 0, done: true });
            break;
        }
        const delta = result.value ? result.value.length : 0;
        if (result.value) {
            chunks.push(result.value);
        }
        received += delta;
        if (cb) {
            cb({ url, total, received, delta, done: false });
        }
    }

    const data = new Uint8Array(received);
    let position = 0;
    for (const chunk of chunks) {
        data.set(chunk, position);
        position += chunk.length;
    }

    const blobURL = URL.createObjectURL(new Blob([data], { type: mimeType }));
    ffmpegBlobURLs.push(blobURL);
    return blobURL;
}

async function disposeFFmpeg() {
    if (ffmpeg) {
        try {
            ffmpeg.terminate();
        } catch (error) {
            console.warn(error);
        }
        ffmpeg = null;
    }
    for (const url of ffmpegBlobURLs) {
        URL.revokeObjectURL(url);
    }
    ffmpegBlobURLs = [];
}

async function load(threadMode, cb) {
    if (ffmpegLoadPromise) {
        return ffmpegLoadPromise;
    }

    ffmpegLoadPromise = (async function() {
        await disposeFFmpeg();
        tryMultiThread = threadMode;
        const ffmpegBlobURL = await toBlobURLPatched(`${baseURLFFMPEG}/ffmpeg.js`, "text/javascript", function(js) {
            return js.replace("new URL(e.p+e.u(814),e.b)", "r.workerLoadURL");
        });
        await import(ffmpegBlobURL);
        ffmpeg = new FFmpegWASM.FFmpeg();
        ffmpeg.on("log", function(data) {
            log(data.message);
            console.log(data.message);
        });
        ffmpeg.on("progress", function(data) {
            for (const handler of ffmpegProgressHandlers) {
                handler(data);
            }
        });

        if (tryMultiThread && window.crossOriginIsolated) {
            ffmpegConfig = {
                workerLoadURL: await toBlobURL(`${baseURLFFMPEG}/814.ffmpeg.js`, "text/javascript", cb),
                coreURL: await toBlobURL(`${baseURLCoreMT}/ffmpeg-core.js`, "text/javascript", cb),
                wasmURL: await toBlobURL(`${baseURLCoreMT}/ffmpeg-core.wasm`, "application/wasm", cb),
                workerURL: await toBlobURL(`${baseURLCoreMT}/ffmpeg-core.worker.js`, "application/javascript", cb)
            };
        } else {
            ffmpegConfig = {
                workerLoadURL: await toBlobURL(`${baseURLFFMPEG}/814.ffmpeg.js`, "text/javascript", cb),
                coreURL: await toBlobURL(`${baseURLCore}/ffmpeg-core.js`, "text/javascript", cb),
                wasmURL: await toBlobURL(`${baseURLCore}/ffmpeg-core.wasm`, "application/wasm", cb)
            };
        }
        await ffmpeg.load(ffmpegConfig);
        console.log("ffmpeg load success");
        return ffmpeg;
    })();

    try {
        return await ffmpegLoadPromise;
    } finally {
        ffmpegLoadPromise = null;
    }
}

function createVfsName(prefix, name) {
    const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    return `/${prefix}_${id}_${safeName}`;
}

function getOutputMime(format) {
    const mimeTypes = {
        aac: "audio/aac",
        flac: "audio/flac",
        m4a: "audio/mp4",
        mp3: "audio/mpeg",
        ogg: "audio/ogg",
        opus: "audio/opus",
        wav: "audio/wav",
        mp4: "video/mp4",
        webm: "video/webm",
        mkv: "video/x-matroska",
        avi: "video/x-msvideo"
    };
    return mimeTypes[format] || "application/octet-stream";
}

function downloadFileByBlob(blobUrl, filename) {
    const link = document.createElement("a");
    link.download = filename;
    link.style.display = "none";
    link.href = blobUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function() {
        URL.revokeObjectURL(blobUrl);
    }, 1000);
}


function addFFmpegProgressHandler(handler) {
    if (!ffmpegProgressHandlers.includes(handler)) {
        ffmpegProgressHandlers.push(handler);
    }
}

function removeFFmpegProgressHandler(handler) {
    const index = ffmpegProgressHandlers.indexOf(handler);
    if (index >= 0) {
        ffmpegProgressHandlers.splice(index, 1);
    }
}


async function restartFFmpeg() {
    if (!ffmpegConfig) {
        throw new Error("FFmpeg is not configured");
    }

    if (ffmpeg) {
        try {
            ffmpeg.terminate();
        } catch (error) {
            console.warn(error);
        }
    }

    ffmpeg = new FFmpegWASM.FFmpeg();
    ffmpeg.on("log", function(data) {
        log(data.message);
        console.log(data.message);
    });
    ffmpeg.on("progress", function(data) {
        for (const handler of ffmpegProgressHandlers) {
            handler(data);
        }
    });
    await ffmpeg.load(ffmpegConfig);
    return ffmpeg;
}
