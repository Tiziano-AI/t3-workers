"""Offline checks of this plugin's native manifests and shared resources."""

import json
from pathlib import Path
import re
import unittest
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]


def read_json(path):
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


class PackageTests(unittest.TestCase):
    def test_package_delivers_the_shared_skill_and_quota_reader(self):
        manifest = read_json("plugin.json")
        skill_root = ROOT / "skills" / manifest["name"]
        skill = (skill_root / "SKILL.md").read_text(encoding="utf-8")
        self.assertRegex(skill, rf"\A---\nname: {re.escape(manifest['name'])}\n")
        for resource in ("agents/openai.yaml", "scripts/t3-limits.mjs"):
            with self.subTest(resource=resource):
                self.assertTrue((skill_root / resource).is_file())
                self.assertGreater((skill_root / resource).stat().st_size, 0)

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
