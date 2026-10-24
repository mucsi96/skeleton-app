import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from upload_client import publish, prepare_client


class StaticPublishing(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(dir=os.environ.get('RUNNER_TEMP', '/tmp/opencode'))
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.asset_url = 'https://fixturestorage.blob.core.windows.net/assets/'
        self.app_origin = 'https://hello.example.test'
        (self.root / 'index.html').write_text('<script>window.__APP_CONFIG__ = "__APP_CONFIG_JSON__";</script>')
        (self.root / 'main-HASH.js').write_text('console.log("ready");')

    @patch('upload_client.subprocess.run')
    def test_index_is_published_last_with_browser_metadata_and_entra_auth(self, run):
        publish(self.root, 'fixturestorage', self.asset_url, self.app_origin)
        uploads = [call.args[0] for call in run.call_args_list]
        self.assertEqual([args[args.index('--name') + 1] for args in uploads], ['main-HASH.js', 'index.html'])
        self.assertEqual(uploads[0][uploads[0].index('--content-type') + 1], 'application/javascript')
        self.assertEqual(uploads[-1][uploads[-1].index('--content-type') + 1], 'text/html')
        self.assertEqual(uploads[-1][uploads[-1].index('--content-cache-control') + 1], 'no-store')
        self.assertEqual([args[args.index('--container-name') + 1] for args in uploads], ['assets', '$web'])
        for args in uploads:
            self.assertEqual(args[args.index('--auth-mode') + 1], 'login')

    @patch('upload_client.subprocess.run', side_effect=subprocess.CalledProcessError(1, 'az'))
    def test_asset_failure_preserves_previous_index(self, run):
        with self.assertRaises(subprocess.CalledProcessError):
            publish(self.root, 'fixturestorage', self.asset_url, self.app_origin)
        self.assertEqual(run.call_count, 1)
        self.assertNotIn('index.html', run.call_args.args[0])

    @patch('upload_client.subprocess.run')
    def test_missing_bootstrap_marker_prevents_all_uploads(self, run):
        (self.root / 'index.html').write_text('<html>wrong build</html>')
        with self.assertRaises(ValueError):
            publish(self.root, 'fixturestorage', self.asset_url, self.app_origin)
        run.assert_not_called()

    def test_asset_links_use_blob_urls_but_document_base_and_manifest_navigation_stay_on_app(self):
        import json
        (self.root / 'index.html').write_text('''<!doctype html><base href="/">
<script>window.__APP_CONFIG__ = "__APP_CONFIG_JSON__";</script>
<link rel="stylesheet" href="styles.css"><link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="/favicon.png"><link rel="modulepreload" href="chunk.js">
<script src="main-HASH.js" type="module"></script>''')
        (self.root / 'manifest.webmanifest').write_text('{"start_url":"/", "scope":"/", "icons":[{"src":"icons/icon.png"}]}')
        with tempfile.TemporaryDirectory(dir=os.environ.get('RUNNER_TEMP', '/tmp/opencode')) as output:
            prepare_client(self.root, output, self.asset_url, self.app_origin)
            index = (Path(output) / 'index.html').read_text()
            self.assertIn('<base href="/">', index)
            self.assertIn('"__APP_CONFIG_JSON__"', index)
            for asset in ['styles.css', 'manifest.webmanifest', 'favicon.png', 'chunk.js', 'main-HASH.js']:
                self.assertIn(self.asset_url + asset, index)
            self.assertEqual(index.count('crossorigin="anonymous"'), 5)
            manifest = json.loads((Path(output) / 'manifest.webmanifest').read_text())
            self.assertEqual(manifest['start_url'], self.app_origin + '/')
            self.assertEqual(manifest['scope'], self.app_origin + '/')
            self.assertEqual(manifest['icons'][0]['src'], 'icons/icon.png')


if __name__ == '__main__':
    unittest.main()
