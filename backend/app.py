import json
import logging
import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
import uuid
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from flask import Flask, jsonify, render_template, request, send_file, send_from_directory, url_for
from werkzeug.middleware.proxy_fix import ProxyFix

from formatter import format_docx
from rules import defaults, parse_message, summary, validate_rules

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = Path(os.getenv("FRONTEND_DIR", BASE_DIR.parent)).resolve()
FRONTEND_FILES = {"index.html", "styles.css", "app.js", "downloads.js", "pickup.js",
                  "rules.js", "formatter.js", "local-files.js", "jszip.min.js", "tech-bg.webp"}
DATA_DIR = Path(os.getenv("DATA_DIR", BASE_DIR / "data")).resolve()
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "").rstrip("/")
FILE_TTL_SECONDS = max(60, int(os.getenv("FILE_TTL_SECONDS", "86400")))
MAX_UPLOAD_MB = max(1, int(os.getenv("MAX_UPLOAD_MB", "40")))
ALLOWED_ORIGINS = {x.strip() for x in os.getenv("ALLOWED_ORIGINS", "").split(",") if x.strip()}
app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = (MAX_UPLOAD_MB + 1) * 1024 * 1024
app.config["MAX_FORM_MEMORY_SIZE"] = 200_000
if os.getenv("TRUST_PROXY") == "1":
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
DATA_DIR.mkdir(parents=True, exist_ok=True)
executor = ThreadPoolExecutor(max_workers=2)
capacity = threading.BoundedSemaphore(4)


def converter_path():
    return os.getenv("LIBREOFFICE_BIN") or shutil.which("libreoffice") or shutil.which("soffice")


def run_libreoffice(src, out_dir, kind):
    exe = converter_path()
    if not exe:
        raise RuntimeError("转换组件尚未安装")
    with tempfile.TemporaryDirectory(prefix="lunwenfix-lo-") as profile:
        cmd = [exe, f"-env:UserInstallation={Path(profile).as_uri()}", "--headless", "--nologo", "--nodefault", "--nolockcheck",
               "--convert-to", "pdf:writer_pdf_Export" if kind == "pdf" else "docx", "--outdir", str(out_dir), str(src)]
        result = subprocess.run(cmd, capture_output=True, timeout=240, check=False)
    target = out_dir / (src.stem + "." + kind)
    if result.returncode or not target.is_file() or target.stat().st_size == 0:
        raise RuntimeError("转换未生成有效文件")
    return target


def has_cjk_font():
    """Fail closed on Linux when fontconfig explicitly reports no Chinese glyph coverage."""
    exe = shutil.which("fc-list")
    if not exe:
        return True  # Windows/macOS or a custom font setup: conversion still reports font differences.
    try:
        result = subprocess.run([exe, ":lang=zh", "family"], capture_output=True, text=True, timeout=5)
        return bool(result.stdout.strip()) if result.returncode == 0 else True
    except (OSError, subprocess.TimeoutExpired):
        return True


def public_url(path):
    return (PUBLIC_BASE_URL or request.host_url.rstrip("/")) + path


def write_meta(directory, value):
    tmp = directory / ("meta-" + uuid.uuid4().hex + ".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")
    tmp.replace(directory / "meta.json")


def read_meta(token):
    if not re.fullmatch(r"[a-f0-9]{32}", token or ""):
        return None, 404
    path = DATA_DIR / token
    try:
        meta = json.loads((path / "meta.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None, 404
    if time.time() >= meta["expires_at"]:
        shutil.rmtree(path, ignore_errors=True)
        return None, 410
    if meta["status"] in {"queued", "processing"} and time.time()-meta["created_at"] > 900:
        meta.update(status="error", error="任务因服务器重启或超时中断，请重新上传。")
    return meta, 200


def cleanup_expired():
    for item in DATA_DIR.iterdir():
        if item.is_dir() and re.fullmatch(r"[a-f0-9]{32}", item.name):
            read_meta(item.name)


def safe_name(filename):
    name = (filename or "论文.docx").replace("\\", "/").split("/")[-1]
    name = re.sub(r'[\x00-\x1f\x7f<>:"|?*]', "", name).strip()
    return name[:150] or "论文.docx"


def get_rules():
    encoded = request.form.get("rules")
    if encoded:
        try:
            return validate_rules(json.loads(encoded))
        except json.JSONDecodeError as exc:
            raise ValueError("格式配置无法读取，请刷新网页后重试。") from exc
    result = defaults()
    # Retain compatibility with v2 form clients while the new UI uses the rules object.
    for form, scope, key in [("body_font", "body", "font"), ("body_size", "body", "size"),
            ("reference_font", "reference", "font"), ("reference_size", "reference", "size"),
            ("heading1_size", "heading1", "size"), ("heading2_size", "heading2", "size"),
            ("first_line_chars", "body", "first_line")]:
        if form in request.form:
            result["sections"][scope][key] = request.form[form] if key == "font" else float(request.form[form])
    if "heading_font" in request.form:
        for k in ("heading1", "heading2", "heading3"):
            result["sections"][k]["font"] = request.form["heading_font"]
    for key in ("top", "bottom", "left", "right"):
        if "page_"+key in request.form:
            result["page"][key+"_cm"] = round(float(request.form["page_"+key])*2.54/1440, 3)
    if "line_spacing_twips" in request.form:
        value = float(request.form["line_spacing_twips"])
        result["sections"]["body"]["line"] = {"mode": "multiple", "value": value/240} if value in {240, 360, 480} else {"mode": "exact", "value": value/20}
    if request.form.get("custom_rules", "").strip():
        result = parse_message(request.form["custom_rules"], result)["rules"]
    return validate_rules(result)


def prepare_job():
    upload = request.files.get("file")
    if not upload or not upload.filename:
        raise ValueError("请先选择 Word 文件。")
    original = safe_name(upload.filename)
    suffix = Path(original).suffix.lower()
    if suffix not in {".doc", ".docx"}:
        raise ValueError("只支持 .docx 或 .doc 文件。")
    if suffix == ".doc" and not converter_path():
        raise ValueError("当前服务暂不能转换 .doc，请在 Word 中另存为 .docx 后上传。")
    rules = get_rules()
    token = uuid.uuid4().hex
    directory = DATA_DIR / token
    directory.mkdir(mode=0o700)
    try:
        src = directory / ("source" + suffix)
        upload.save(src)
        if not 0 < src.stat().st_size <= MAX_UPLOAD_MB * 1024 * 1024:
            raise ValueError(f"请选择非空且不超过 {MAX_UPLOAD_MB} MB 的文件。")
        now = time.time()
        meta = {"token": token, "status": "queued", "stage": "文件已接收，等待处理", "original_name": original,
                "created_at": now, "expires_at": now + max(1800, FILE_TTL_SECONDS), "rules": rules,
                "make_pdf": request.form.get("make_pdf", "1") in {"1", "true", "on"}}
        write_meta(directory, meta)
        return directory, src, meta
    except Exception:
        shutil.rmtree(directory, ignore_errors=True)
        raise


def process_job(directory, src, meta):
    try:
        meta.update(status="processing", stage="正在识别段落并整理格式")
        write_meta(directory, meta)
        working = run_libreoffice(src, directory, "docx") if src.suffix == ".doc" else src
        docx = directory / "lunwenfix-result.docx"
        report = format_docx(working, docx, meta["rules"])
        warnings = []
        if src.suffix == ".doc":
            warnings.append("原文件为 .doc，先经过格式转换；正文校验基于转换后的 .docx，请核对原稿。")
        meta.update(stage="Word 已整理，正在准备预览与下载")
        write_meta(directory, meta)
        if meta["make_pdf"]:
            try:
                if not converter_path():
                    raise RuntimeError("PDF 转换组件尚未安装")
                if not has_cjk_font():
                    warnings.append("服务器缺少中文字体，已暂停 PDF 生成，避免生成缺字预览。请安装中文字体后重试。")
                    raise RuntimeError("Chinese font coverage missing")
                pdf = run_libreoffice(docx, directory, "pdf")
                from pypdf import PdfReader
                pages = len(PdfReader(pdf).pages)
                if not pages:
                    raise RuntimeError("PDF 为空")
                meta["pdf_pages"] = pages
                warnings.append("PDF 的字体显示取决于服务器已安装的字体，请检查预览。")
            except Exception:
                (directory / "lunwenfix-result.pdf").unlink(missing_ok=True)
                warnings.append("PDF 暂未生成；Word 已保留并可正常下载。可用 Word/WPS 打开后导出 PDF。")
        report.update(warnings=warnings, rules=meta["rules"])
        (directory / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        with zipfile.ZipFile(directory / "lunwenfix-result.zip", "w", zipfile.ZIP_DEFLATED) as archive:
            archive.write(docx, Path(meta["original_name"]).stem + "_格式整理.docx")
            if "pdf_pages" in meta:
                archive.write(directory / "lunwenfix-result.pdf", Path(meta["original_name"]).stem + "_格式整理.pdf")
            archive.write(directory / "report.json", "格式处理说明.json")
        meta.update(status="ready", stage="文件已准备好", report=report, warnings=warnings,
                    expires_at=time.time() + FILE_TTL_SECONDS)
    except ValueError as exc:
        meta.update(status="error", error=str(exc))
    except Exception:
        logging.exception("Document job failed: %s", meta["token"])
        meta.update(status="error", error="文件处理失败。请用 Word 另存为 .docx 后重试，或联系维护者检查转换服务。")
    finally:
        for source in directory.glob("source*"):
            source.unlink(missing_ok=True)
        if meta["status"] == "error":
            for output in directory.glob("lunwenfix-result*"):
                output.unlink(missing_ok=True)
        write_meta(directory, meta)


def task_worker(directory, src, meta):
    try:
        process_job(directory, src, meta)
    finally:
        capacity.release()


def payload(meta):
    token = meta["token"]
    out = {k: meta[k] for k in ("token", "status", "stage", "original_name", "expires_at")}
    out.update(status_url=public_url(f"/api/jobs/{token}"), share_url=public_url(f"/download/{token}"))
    if meta["status"] == "error":
        out["error"] = meta["error"]
    if meta["status"] == "ready":
        out.update(docx_url=public_url(f"/files/{token}/lunwenfix-result.docx"),
                   zip_url=public_url(f"/files/{token}/lunwenfix-result.zip"),
                   report_url=public_url(f"/files/{token}/report.json"),
                   warnings=meta.get("warnings", []), report=meta["report"],
                   expires_in=max(0, int(meta["expires_at"]-time.time())))
        if "pdf_pages" in meta:
            url = public_url(f"/files/{token}/lunwenfix-result.pdf")
            out.update(pdf_pages=meta["pdf_pages"], pdf_url=url, preview_url=url+"?preview=1")
    return out


@app.after_request
def response_headers(response):
    origin = request.headers.get("Origin", "")
    if origin in ALLOWED_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.vary.add("Origin")
    response.headers["Access-Control-Allow-Methods"] = "GET,HEAD,POST,OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Expose-Headers"] = "Content-Disposition,Content-Length"
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Robots-Tag"] = "noindex, nofollow"
    return response


@app.get("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.get("/health")
def health():
    return jsonify(status="ok", version=3, converter=bool(converter_path()), max_upload_mb=MAX_UPLOAD_MB)


@app.get("/config.js")
def frontend_config():
    # Serving this homepage from Flask selects same-origin APIs. Pages uses config.js on disk.
    return app.response_class("window.LUNWENFIX_API_BASE = location.origin;\n", mimetype="application/javascript")


@app.get("/api/rules")
def initial_rules():
    from ai_parser import available
    rules = defaults()
    return jsonify(rules=rules, summary=summary(rules), ai_available=available(), max_upload_mb=MAX_UPLOAD_MB)


@app.post("/api/chat")
def chat():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify(error="请发送有效的格式描述。"), 400
    try:
        local = parse_message(data.get("message"), data.get("rules"), data.get("context"))
        if data.get("use_ai") is True:
            from ai_parser import enhance
            return jsonify(enhance(data, local))
        return jsonify(local)
    except (ValueError, TypeError) as exc:
        return jsonify(error=str(exc)), 400


@app.post("/api/jobs")
def create_job():
    cleanup_expired()
    if not capacity.acquire(blocking=False):
        return jsonify(error="目前处理的文件较多，请稍后重试。"), 429
    try:
        directory, src, meta = prepare_job()
    except (ValueError, TypeError) as exc:
        capacity.release()
        return jsonify(error=str(exc)), 400
    except Exception:
        capacity.release()
        raise
    initial = payload(meta)
    try:
        executor.submit(task_worker, directory, src, meta)
    except Exception:
        capacity.release()
        shutil.rmtree(directory, ignore_errors=True)
        raise
    return jsonify(initial), 202


@app.get("/api/jobs/<token>")
def job_status(token):
    meta, code = read_meta(token)
    return (jsonify(payload(meta)), 200) if meta else (jsonify(error="文件不存在或已过期，请重新上传。"), code)


@app.post("/api/convert")
def convert_legacy():
    cleanup_expired()
    if not capacity.acquire(blocking=False):
        return jsonify(error="服务器忙，请稍后重试。"), 429
    try:
        directory, src, meta = prepare_job()
        process_job(directory, src, meta)
        return jsonify(payload(meta)), 200 if meta["status"] == "ready" else 400
    except (ValueError, TypeError) as exc:
        return jsonify(error=str(exc)), 400
    finally:
        capacity.release()


@app.get("/download/<token>")
def download_page(token):
    meta, code = read_meta(token)
    return render_template("download.html", result=payload(meta) if meta else None), code


@app.route("/files/<token>/<filename>", methods=["GET", "HEAD"])
def files(token, filename):
    names = {"lunwenfix-result.docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
             "lunwenfix-result.pdf": "application/pdf", "lunwenfix-result.zip": "application/zip", "report.json": "application/json"}
    meta, code = read_meta(token)
    if meta is None:
        return jsonify(error="文件不存在或已过期，请重新生成。"), code
    if filename not in names:
        return jsonify(error="文件不存在。"), 404
    if meta["status"] != "ready":
        return jsonify(error="文件尚未准备好，请返回取件页查看。"), 409
    path = DATA_DIR / token / filename
    if not path.is_file():
        return jsonify(error="此文件未生成，请下载 Word。"), 404
    download_name = Path(meta["original_name"]).stem + "_格式整理" + path.suffix
    return send_file(path, as_attachment=not (filename.endswith(".pdf") and request.args.get("preview") == "1"),
                     download_name=download_name, mimetype=names[filename], conditional=True, etag=False, max_age=0)


@app.get("/<path:filename>")
def frontend(filename):
    if filename not in FRONTEND_FILES:
        return jsonify(error="路径不存在。"), 404
    return send_from_directory(FRONTEND_DIR, filename)


@app.errorhandler(413)
def too_large(_):
    return jsonify(error=f"文件不能超过 {MAX_UPLOAD_MB} MB。"), 413


@app.errorhandler(500)
def unexpected(_):
    return jsonify(error="服务暂时出错，请稍后重试。"), 500


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.getenv("PORT", "8080")))
