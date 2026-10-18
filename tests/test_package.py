"""Offline checks of the resources delivered by both native marketplaces."""

import json
from pathlib import Path
import re
import unittest
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]


def read_json(path):
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


class PackageTests(unittest.TestCase):
    def test_both_marketplaces_deliver_the_same_plugin_root(self):
        codex = read_json(".agents/plugins/marketplace.json")
        claude = read_json(".claude-plugin/marketplace.json")
        self.assertEqual(len(codex["plugins"]), 1)
        self.assertEqual(len(claude["plugins"]), 1)
        entry = codex["plugins"][0]
        self.assertEqual(entry["source"]["source"], "local")
        for catalog, source in (
            (codex, entry["source"]["path"]),
            (claude, claude["plugins"][0]["source"]),
        ):
            with self.subTest(catalog=catalog["name"]):
                plugin_root = (ROOT / source).resolve()
                self.assertEqual(plugin_root, ROOT)
                self.assertTrue((plugin_root / "skills/t3-workers/SKILL.md").is_file())
                self.assertEqual(catalog["plugins"][0]["name"], "t3-workers")

    def test_shared_manifest_identity_and_release(self):
        portable = read_json("plugin.json")
        claude = read_json(".claude-plugin/plugin.json")
        for key in ("name", "version", "description", "author", "repository", "license"):
            with self.subTest(field=key):
                self.assertEqual(portable[key], claude[key])
        self.assertRegex(portable["version"], r"^\d+\.\d+\.\d+(?:-[\w.-]+)?$")

    def test_document_links_are_delivered(self):
        # Resolve local Markdown links, including references shipped with the
        # installed skill. External source availability is not an offline test.
        documents = [ROOT / "README.md", *ROOT.glob("docs/**/*.md"), *ROOT.glob("skills/**/*.md")]
        for document in documents:
            for label, destination in re.findall(r"\[([^\]]+)\]\(([^)]+)\)", document.read_text()):
                parsed = urlsplit(destination.strip("<>"))
                if parsed.scheme or not parsed.path:
                    continue
                target = (document.parent / unquote(parsed.path)).resolve()
                with self.subTest(document=str(document.relative_to(ROOT)), link=label):
                    self.assertTrue(target.is_relative_to(ROOT), f"External local path: {destination}")
                    self.assertTrue(target.is_file(), f"Missing resource: {destination}")


if __name__ == "__main__":
    unittest.main()
