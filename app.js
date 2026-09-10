const state = {
    isLoaded: false,
    isConverting: false,
    selectedFile: null,
    fileInfo: null,
    progressHandler: null
};

const dom = {
    fileInput: document.getElementById("mediaFile"),
    fileLabel: document.getElementById("fileLabel"),
    selectedFile: document.getElementById("selectedFile"),
    fileName: document.getElementById("fileName"),
    fileSize: document.getElementById("fileSize"),
    fileType: document.getElementById("fileType"),
    fileStatus: document.getElementById("fileStatus"),
    outputFormat: document.getElementById("outputFormat"),
    bitrateGroup: document.getElementById("bitrateGroup"),
    bitrate: document.getElementById("bitrate"),
    convertBtn: document.getElementById("convertBtn"),
    progressSection: document.getElementById("progressSection"),
    progressLabel: document.getElementById("progressLabel"),
    progressPercent: document.getElementById("progressPercent"),
    progressBar: document.getElementById("progressBar"),
    console: document.getElementById("console")
};

const AUDIO_FORMATS = {
    mp3: {
        label: "MP3",
        extension: "mp3",
        mime: "audio/mpeg"
    },
    aac: {
        label: "AAC",
        extension: "aac",
        mime: "audio/aac"
    },
    ogg: {
        label: "OGG",
        extension: "ogg",
        mime: "audio/ogg"
    },
    wav: {
        label: "WAV",
        extension: "wav",
        mime: "audio/wav"
    },
    flac: {
        label: "FLAC",
        extension: "flac",
        mime: "audio/flac"
    },
    m4a: {
        label: "M4A",
        extension: "m4a",
        mime: "audio/mp4"
    }
};

const VIDEO_FORMATS = {
    mp4: {
        label: "MP4",
        extension: "mp4",
        mime: "video/mp4"
    },
    webm: {
        label: "WebM",
        extension: "webm",
        mime: "video/webm"
    },
    mkv: {
        label: "MKV",
        extension: "mkv",
        mime: "video/x-matroska"
    },
    avi: {
        label: "AVI",
        extension: "avi",
        mime: "video/x-msvideo"
    }
};

const bitrateOptions = {
    mp3: ["320k", "256k", "192k", "128k", "96k", "64k"],
    aac: ["320k", "256k", "192k", "128k", "96k", "64k"],
    ogg: ["320k", "256k", "192k", "128k", "96k", "64k"],
    m4a: ["320k", "256k", "192k", "128k", "96k", "64k"],
    mp4: ["320k", "256k", "192k", "128k", "96k", "64k"],
    webm: ["320k", "256k", "192k", "128k", "96k", "64k"],
    mkv: ["320k", "256k", "192k", "128k", "96k", "64k"],
    avi: ["320k", "256k", "192k", "128k", "96k", "64k"]
};

function formatBytes(bytes) {
    if (bytes === 0) {
        return "0 B";
    }

    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(
        Math.floor(Math.log(bytes) / Math.log(1024)),
        units.length - 1
    );

    return `${(bytes / 1024 ** index).toFixed(2)} ${units[index]}`;
}

function addLog(message, type) {
    const entry = document.createElement("div");
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;

    if (type) {
        entry.className = `log-${type}`;
    }

    dom.console.appendChild(entry);
    dom.console.scrollTop = dom.console.scrollHeight;
}

function setProgress(percent, label) {
    const safePercent = Math.max(0, Math.min(100, Math.round(percent)));

    dom.progressBar.style.width = `${safePercent}%`;
    dom.progressPercent.textContent = `${safePercent}%`;
    dom.progressLabel.textContent = label;
}

function getAvailableFormats() {
    if (state.fileInfo && state.fileInfo.type === "video") {
        return {
            audio: AUDIO_FORMATS,
            video: VIDEO_FORMATS
        };
    }

    return {
        audio: AUDIO_FORMATS
    };
}

function getSelectedFormat() {
    return dom.outputFormat.value;
}

function updateOutputFormats() {
    const currentFormat = getSelectedFormat();
    const groups = getAvailableFormats();
    const fragment = document.createDocumentFragment();

    for (const [groupName, formats] of Object.entries(groups)) {
        const group = document.createElement("optgroup");
        group.label = groupName === "audio" ? "Audio" : "Video";

        for (const [value, format] of Object.entries(formats)) {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = format.label;
            group.appendChild(option);
        }

        fragment.appendChild(group);
    }

    dom.outputFormat.replaceChildren(fragment);

    const availableValues = Object.values(groups)
        .flatMap(function(formats) {
            return Object.keys(formats);
        });

    if (availableValues.includes(currentFormat)) {
        dom.outputFormat.value = currentFormat;
    } else if (state.fileInfo && state.fileInfo.type === "video") {
        dom.outputFormat.value = "mp4";
    } else {
        dom.outputFormat.value = "mp3";
    }

    updateBitrateOptions();
}

function updateBitrateOptions() {
    const format = dom.outputFormat.value;
    const options = bitrateOptions[format] || [];
    const isVideo = Boolean(VIDEO_FORMATS[format]);

    dom.bitrate.replaceChildren();

    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "Default";
    dom.bitrate.appendChild(defaultOption);

    for (const option of options) {
        const element = document.createElement("option");
        element.value = option;
        element.textContent = option;
        dom.bitrate.appendChild(element);
    }

    dom.bitrateGroup.classList.toggle("hidden", options.length === 0);
    dom.bitrateGroup.querySelector("label").textContent = isVideo ? "Audio bitrate" : "Bitrate";
}

function getOutputName(inputName, format) {
    const dotIndex = inputName.lastIndexOf(".");
    const baseName = dotIndex > 0 ? inputName.slice(0, dotIndex) : inputName;

    return `${baseName}.${format}`;
}

function updateConvertButton() {
    dom.convertBtn.disabled = (
        !state.isLoaded ||
        !state.selectedFile ||
        !state.fileInfo ||
        state.isConverting
    );
}

async function handleFile(file) {
    if (!file) {
        return;
    }

    dom.fileStatus.textContent = "Checking file type...";
    state.selectedFile = null;
    state.fileInfo = null;
    dom.convertBtn.disabled = true;

    try {
        const info = await getFileType(file);

        if (info.type === "unknown") {
            throw new Error("The file type could not be verified from its MIME type or header.");
        }

        state.selectedFile = file;
        state.fileInfo = info;

        dom.fileName.textContent = file.name;
        dom.fileSize.textContent = formatBytes(file.size);
        dom.fileType.textContent = `${info.type} / ${info.format}${info.mimeType ? ` / ${info.mimeType}` : ""}`;
        dom.selectedFile.classList.add("show");
        dom.fileStatus.textContent = `Verified as ${info.type} (${info.format}) from file data.`;

        updateOutputFormats();
        updateConvertButton();
        addLog(`Selected ${file.name} -> ${info.type}/${info.format}`);
    } catch (error) {
        dom.selectedFile.classList.remove("show");
        dom.fileStatus.textContent = error.message;
        addLog(error.message, "error");
    }
}

async function initFFmpeg() {
    try {
        addLog("Loading FFmpeg...");
        dom.progressSection.classList.add("show");
        setProgress(0, "Loading FFmpeg...");

        await load(false, function(data) {
            if (data.total > 0) {
                setProgress(
                    (data.received / data.total) * 100,
                    "Downloading FFmpeg..."
                );
            }
        });

        state.isLoaded = true;
        setProgress(100, "FFmpeg ready");
        addLog("FFmpeg ready", "success");
        updateConvertButton();

        setTimeout(function() {
            if (!state.isConverting) {
                dom.progressSection.classList.remove("show");
            }
        }, 900);
    } catch (error) {
        state.isLoaded = false;
        addLog(`FFmpeg load failed: ${error.message}`, "error");
        dom.fileStatus.textContent = "FFmpeg could not be loaded.";
        setProgress(0, "Load failed");
    }
}

function getAudioCodecArguments(format, bitrate) {
    const args = [];

    if (format === "mp3") {
        args.push("-c:a", "libmp3lame");
    } else if (format === "aac") {
        args.push("-c:a", "aac");
    } else if (format === "ogg") {
        args.push("-c:a", "libvorbis");
    } else if (format === "wav") {
        args.push("-c:a", "pcm_s16le");
    } else if (format === "flac") {
        args.push("-c:a", "flac");
    } else if (format === "m4a") {
        args.push("-c:a", "aac");
    }

    if (bitrate && !["wav", "flac"].includes(format)) {
        args.push("-b:a", bitrate);
    }

    return args;
}

function getVideoCodecArguments(format, bitrate) {
    if (format === "mp4") {
        return [
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-crf", "23",
            "-c:a", "aac",
            "-movflags", "+faststart",
            ...(bitrate ? ["-b:a", bitrate] : [])
        ];
    }

    if (format === "webm") {
        return [
            "-c:v", "libvpx-vp9",
            "-crf", "32",
            "-b:v", "0",
            "-c:a", "libopus",
            ...(bitrate ? ["-b:a", bitrate] : [])
        ];
    }

    if (format === "mkv") {
        return [
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-crf", "23",
            "-c:a", "aac",
            ...(bitrate ? ["-b:a", bitrate] : [])
        ];
    }

    if (format === "avi") {
        return [
            "-c:v", "mpeg4",
            "-q:v", "4",
            "-c:a", "libmp3lame",
            ...(bitrate ? ["-b:a", bitrate] : [])
        ];
    }

    throw new Error(`Unsupported video format: ${format}`);
}

function buildConversionArguments(format, bitrate, inputPath, outputPath) {
    if (VIDEO_FORMATS[format]) {
        if (!state.fileInfo || state.fileInfo.type !== "video") {
            throw new Error("Video output requires a video input.");
        }

        return [
            "-y",
            "-i", inputPath,
            ...getVideoCodecArguments(format, bitrate),
            outputPath
        ];
    }

    return [
        "-y",
        "-i", inputPath,
        "-vn",
        ...getAudioCodecArguments(format, bitrate),
        outputPath
    ];
}

function getInputDurationSeconds() {
    if (!Number.isFinite(state.fileInfo?.duration)) {
        return null;
    }

    return state.fileInfo.duration;
}

async function convertMedia() {
    if (!state.selectedFile || !state.fileInfo || state.isConverting || !state.isLoaded || !ffmpeg) {
        return;
    }

    state.isConverting = true;
    updateConvertButton();
    dom.progressSection.classList.add("show");
    setProgress(0, "Preparing...");

    const format = dom.outputFormat.value;
    const bitrate = dom.bitrate.value;
    const outputName = getOutputName(state.selectedFile.name, format);
    const inputPath = createVfsName("input", state.selectedFile.name);
    const outputPath = createVfsName("output", outputName);
    const inputDuration = getInputDurationSeconds();

    state.progressHandler = function(data) {
        const progress = Number(data.progress);

        if (Number.isFinite(progress)) {
            const percent = progress <= 1 ? progress * 100 : progress;
            setProgress(Math.min(99, Math.max(0, percent)), "Converting...");
            return;
        }

        if (inputDuration && Number.isFinite(data.time)) {
            const percent = data.time / 1000000 / inputDuration * 100;
            setProgress(Math.min(99, Math.max(0, percent)), "Converting...");
        }
    };

    addFFmpegProgressHandler(state.progressHandler);

    try {
        addLog(`Converting ${state.selectedFile.name} -> ${format.toUpperCase()}`);

        setProgress(2, "Reading input...");
        const inputData = new Uint8Array(await state.selectedFile.arrayBuffer());

        setProgress(4, "Writing input...");
        await ffmpeg.writeFile(inputPath, inputData);

        const args = buildConversionArguments(
            format,
            bitrate,
            inputPath,
            outputPath
        );

        addLog(`ffmpeg ${args.join(" ")}`);
        const result = await ffmpeg.exec(args);

        if (result !== 0) {
            throw new Error(`FFmpeg exited with code ${result}`);
        }

        setProgress(99, "Reading output...");
        const data = await ffmpeg.readFile(outputPath);
        const formatInfo = AUDIO_FORMATS[format] || VIDEO_FORMATS[format];
        const blob = new Blob([data], { type: formatInfo.mime });
        const blobUrl = URL.createObjectURL(blob);

        downloadFileByBlob(blobUrl, outputName);
        setProgress(100, "Complete");
        addLog(`Downloaded ${outputName}`, "success");
    } catch (error) {
        addLog(`Conversion failed: ${error.message}`, "error");
        setProgress(0, "Conversion failed");
    } finally {
        removeFFmpegProgressHandler(state.progressHandler);
        state.progressHandler = null;

        try {
            await ffmpeg.deleteFile(inputPath);
        } catch (error) {
        }

        try {
            await ffmpeg.deleteFile(outputPath);
        } catch (error) {
        }

        try {
            await restartFFmpeg();
        } catch (error) {
            state.isLoaded = false;
            addLog(`FFmpeg restart failed: ${error.message}`, "error");
        }

        state.isConverting = false;
        updateConvertButton();
    }
}

function bindDragEvents() {
    for (const eventName of ["dragenter", "dragover", "dragleave", "drop"]) {
        dom.fileLabel.addEventListener(eventName, function(event) {
            event.preventDefault();
            event.stopPropagation();
        });
    }

    for (const eventName of ["dragenter", "dragover"]) {
        dom.fileLabel.addEventListener(eventName, function() {
            dom.fileLabel.classList.add("dragover");
        });
    }

    for (const eventName of ["dragleave", "drop"]) {
        dom.fileLabel.addEventListener(eventName, function() {
            dom.fileLabel.classList.remove("dragover");
        });
    }

    dom.fileLabel.addEventListener("drop", function(event) {
        const files = event.dataTransfer.files;

        if (files.length) {
            handleFile(files[0]);
        }
    });
}

dom.fileInput.addEventListener("change", function(event) {
    handleFile(event.target.files[0]);
});

dom.outputFormat.addEventListener("change", updateBitrateOptions);
dom.convertBtn.addEventListener("click", convertMedia);

updateOutputFormats();
bindDragEvents();
initFFmpeg();
