/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />

// Self-contained class worker for @ffmpeg/ffmpeg 0.12.15. Inlined from
// node_modules/@ffmpeg/ffmpeg/dist/esm/{worker,const,errors}.js so the file
// has zero relative imports — the previous version with `import "./const.js"`
// hung silently when Vercel served the sibling files with a content-type
// the module loader rejected. Re-copy from node_modules and re-inline if
// the @ffmpeg/ffmpeg package is upgraded.

const wlog = (...args) => console.log("[FFmpeg/worker]", ...args);
wlog("worker module evaluated, awaiting LOAD message");

// === inlined const.js =====================================================
const CORE_VERSION = "0.12.9";
const CORE_URL = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd/ffmpeg-core.js`;
const FFMessageType = {
    LOAD: "LOAD",
    EXEC: "EXEC",
    FFPROBE: "FFPROBE",
    WRITE_FILE: "WRITE_FILE",
    READ_FILE: "READ_FILE",
    DELETE_FILE: "DELETE_FILE",
    RENAME: "RENAME",
    CREATE_DIR: "CREATE_DIR",
    LIST_DIR: "LIST_DIR",
    DELETE_DIR: "DELETE_DIR",
    ERROR: "ERROR",
    DOWNLOAD: "DOWNLOAD",
    PROGRESS: "PROGRESS",
    LOG: "LOG",
    MOUNT: "MOUNT",
    UNMOUNT: "UNMOUNT",
};

// === inlined errors.js ====================================================
const ERROR_UNKNOWN_MESSAGE_TYPE = new Error("unknown message type");
const ERROR_NOT_LOADED = new Error("ffmpeg is not loaded, call `await ffmpeg.load()` first");
const ERROR_IMPORT_FAILURE = new Error("failed to import ffmpeg-core.js");

// === worker logic =========================================================
let ffmpeg;
const load = async ({ coreURL: _coreURL, wasmURL: _wasmURL, workerURL: _workerURL, }) => {
    wlog("load() received", {
        coreURL: _coreURL?.slice(0, 60),
        wasmURL: _wasmURL?.slice(0, 60),
        workerURL: _workerURL?.slice(0, 60),
    });
    const first = !ffmpeg;
    try {
        if (!_coreURL) _coreURL = CORE_URL;
        wlog("trying importScripts (classic worker path)");
        importScripts(_coreURL);
        wlog("importScripts succeeded");
    } catch (e) {
        wlog("importScripts failed (expected in module worker), falling back to dynamic import:", e?.message || e);
        if (!_coreURL || _coreURL === CORE_URL) {
            _coreURL = CORE_URL.replace('/umd/', '/esm/');
        }
        wlog("about to dynamic import:", _coreURL?.slice(0, 80));
        try {
            const mod = await import(/* @vite-ignore */ _coreURL);
            wlog("dynamic import resolved, keys:", Object.keys(mod || {}));
            self.createFFmpegCore = mod.default;
        } catch (impErr) {
            wlog("dynamic import threw:", impErr?.message || impErr);
            throw impErr;
        }
        if (!self.createFFmpegCore) {
            wlog("dynamic import returned no default export");
            throw ERROR_IMPORT_FAILURE;
        }
    }
    const coreURL = _coreURL;
    const wasmURL = _wasmURL ? _wasmURL : _coreURL.replace(/.js$/g, ".wasm");
    const workerURL = _workerURL
        ? _workerURL
        : _coreURL.replace(/.js$/g, ".worker.js");
    wlog("calling createFFmpegCore", { coreLen: coreURL.length, wasmLen: wasmURL.length });
    try {
        ffmpeg = await self.createFFmpegCore({
            mainScriptUrlOrBlob: `${coreURL}#${btoa(JSON.stringify({ wasmURL, workerURL }))}`,
        });
        wlog("createFFmpegCore resolved");
    } catch (cErr) {
        wlog("createFFmpegCore threw:", cErr?.message || cErr);
        throw cErr;
    }
    ffmpeg.setLogger((data) => self.postMessage({ type: FFMessageType.LOG, data }));
    ffmpeg.setProgress((data) => self.postMessage({
        type: FFMessageType.PROGRESS,
        data,
    }));
    wlog("load() complete, first=", first);
    return first;
};
const exec = ({ args, timeout = -1 }) => {
    ffmpeg.setTimeout(timeout);
    ffmpeg.exec(...args);
    const ret = ffmpeg.ret;
    ffmpeg.reset();
    return ret;
};
const ffprobe = ({ args, timeout = -1 }) => {
    ffmpeg.setTimeout(timeout);
    ffmpeg.ffprobe(...args);
    const ret = ffmpeg.ret;
    ffmpeg.reset();
    return ret;
};
const writeFile = ({ path, data }) => {
    ffmpeg.FS.writeFile(path, data);
    return true;
};
const readFile = ({ path, encoding }) => ffmpeg.FS.readFile(path, { encoding });
const deleteFile = ({ path }) => {
    ffmpeg.FS.unlink(path);
    return true;
};
const rename = ({ oldPath, newPath }) => {
    ffmpeg.FS.rename(oldPath, newPath);
    return true;
};
const createDir = ({ path }) => {
    ffmpeg.FS.mkdir(path);
    return true;
};
const listDir = ({ path }) => {
    const names = ffmpeg.FS.readdir(path);
    const nodes = [];
    for (const name of names) {
        const stat = ffmpeg.FS.stat(`${path}/${name}`);
        const isDir = ffmpeg.FS.isDir(stat.mode);
        nodes.push({ name, isDir });
    }
    return nodes;
};
const deleteDir = ({ path }) => {
    ffmpeg.FS.rmdir(path);
    return true;
};
const mount = ({ fsType, options, mountPoint }) => {
    const fs = ffmpeg.FS.filesystems[fsType];
    if (!fs) return false;
    ffmpeg.FS.mount(fs, options, mountPoint);
    return true;
};
const unmount = ({ mountPoint }) => {
    ffmpeg.FS.unmount(mountPoint);
    return true;
};
self.onmessage = async ({ data: { id, type, data: _data }, }) => {
    const trans = [];
    let data;
    try {
        if (type !== FFMessageType.LOAD && !ffmpeg) throw ERROR_NOT_LOADED;
        switch (type) {
            case FFMessageType.LOAD:
                data = await load(_data);
                break;
            case FFMessageType.EXEC:
                data = exec(_data);
                break;
            case FFMessageType.FFPROBE:
                data = ffprobe(_data);
                break;
            case FFMessageType.WRITE_FILE:
                data = writeFile(_data);
                break;
            case FFMessageType.READ_FILE:
                data = readFile(_data);
                break;
            case FFMessageType.DELETE_FILE:
                data = deleteFile(_data);
                break;
            case FFMessageType.RENAME:
                data = rename(_data);
                break;
            case FFMessageType.CREATE_DIR:
                data = createDir(_data);
                break;
            case FFMessageType.LIST_DIR:
                data = listDir(_data);
                break;
            case FFMessageType.DELETE_DIR:
                data = deleteDir(_data);
                break;
            case FFMessageType.MOUNT:
                data = mount(_data);
                break;
            case FFMessageType.UNMOUNT:
                data = unmount(_data);
                break;
            default:
                throw ERROR_UNKNOWN_MESSAGE_TYPE;
        }
    } catch (e) {
        wlog("onmessage caught error:", e?.message || e);
        self.postMessage({ id, type: FFMessageType.ERROR, data: e.toString() });
        return;
    }
    if (data instanceof Uint8Array) {
        trans.push(data.buffer);
    }
    self.postMessage({ id, type, data }, trans);
};
