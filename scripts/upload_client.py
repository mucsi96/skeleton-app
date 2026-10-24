#!/usr/bin/env python3
"""Publish assets before index, retaining old bundles for open browser sessions."""
import mimetypes
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from urllib.parse import urljoin, urlsplit


class AssetLinks(HTMLParser):
    """Keep the document base on the app while making asset references absolute."""

    def __init__(self, asset_base_url):
        super().__init__(convert_charrefs=False)
        self.asset_base_url = asset_base_url
        self.parts = []

    def start_tag(self, tag, attrs, closing):
        target = 'src' if tag == 'script' else 'href' if tag == 'link' else None
        values = dict(attrs)
        if target and values.get(target):
            url = values[target]
            if urlsplit(url).scheme or urlsplit(url).netloc:
                raise ValueError(f"Build assets must be local: {url}")
            values[target] = urljoin(self.asset_base_url, url.lstrip('/'))
            values['crossorigin'] = 'anonymous'
        attributes = ''.join(f' {key}' if value is None else f' {key}="{html.escape(value, quote=True)}"'
                             for key, value in values.items())
        self.parts.append(f'<{tag}{attributes}{closing}>')

    def handle_starttag(self, tag, attrs):
        self.start_tag(tag, attrs, '')

    def handle_startendtag(self, tag, attrs):
        self.start_tag(tag, attrs, ' /')

    def handle_endtag(self, tag):
        self.parts.append(f'</{tag}>')

    def handle_data(self, data):
        self.parts.append(data)

    def handle_decl(self, decl):
        self.parts.append(f'<!{decl}>')

    def handle_comment(self, data):
        self.parts.append(f'<!--{data}-->')

    def handle_entityref(self, name):
        self.parts.append(f'&{name};')

    def handle_charref(self, name):
        self.parts.append(f'&#{name};')


def prepare_client(directory, destination, asset_base_url, app_origin):
    root = Path(directory).resolve()
    index = root / "index.html"
    if not index.is_file() or '"__APP_CONFIG_JSON__"' not in index.read_text():
        raise ValueError("Client index is missing its runtime configuration marker")
    for path in root.rglob('*'):
        if path.is_symlink() or not path.resolve().is_relative_to(root):
            raise ValueError(f"Client artifact contains a symlink: {path}")
    destination = Path(destination)
    shutil.copytree(root, destination, dirs_exist_ok=True)
    parser = AssetLinks(asset_base_url)
    parser.feed(index.read_text())
    parser.close()
    (destination / 'index.html').write_text(''.join(parser.parts))
    manifest = destination / 'manifest.webmanifest'
    if manifest.exists():
        config = json.loads(manifest.read_text())
        for field in ['id', 'start_url', 'scope']:
            config[field] = urljoin(app_origin + '/', config.get(field, '/'))
        manifest.write_text(json.dumps(config))


def publish(directory, account, asset_base_url, app_origin):
    if asset_base_url != f'https://{account}.blob.core.windows.net/assets/':
        raise ValueError('Asset URL must address the account’s public assets container')
    origin = urlsplit(app_origin)
    if origin.scheme != 'https' or not origin.netloc or origin.path or origin.query or origin.fragment:
        raise ValueError('Application origin must be HTTPS without a path')
    with tempfile.TemporaryDirectory(prefix='client-publish-') as temporary:
        root = Path(temporary)
        prepare_client(directory, root, asset_base_url, app_origin)
        index = root / 'index.html'
        files = sorted(path for path in root.rglob('*') if path.is_file() and path != index)
        for path in [*files, index]:
            upload(path, root, account, '$web' if path == index else 'assets')


def upload(path, root, account, container):
    content_type = {
        ".js": "application/javascript", ".mjs": "application/javascript",
        ".css": "text/css", ".html": "text/html", ".svg": "image/svg+xml",
        ".json": "application/json", ".wasm": "application/wasm",
        ".webmanifest": "application/manifest+json", ".woff2": "font/woff2",
    }.get(path.suffix, mimetypes.guess_type(path.name)[0] or "application/octet-stream")
    subprocess.run([
        "az", "storage", "blob", "upload", "--auth-mode", "login",
        "--account-name", account, "--container-name", container,
        "--name", path.relative_to(root).as_posix(), "--file", str(path),
        "--overwrite", "true", "--content-type", content_type,
        "--content-cache-control", "no-store" if container == '$web' else "no-cache",
        "--only-show-errors", "--output", "none",
    ], check=True)


if __name__ == "__main__":
    publish(*sys.argv[1:])
