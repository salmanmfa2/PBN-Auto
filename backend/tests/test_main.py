import os
import unittest
from unittest.mock import patch

from main import _get_cors_origins


class CorsOriginsTests(unittest.TestCase):
    @patch.dict(
        os.environ,
        {"CORS_ORIGINS": "http://127.0.0.1:8081,http://192.168.1.20:8081"},
        clear=True,
    )
    @patch("main.CONFIG", {"cors_origins": ["http://stale-host:8081"]})
    def test_environment_origins_override_configured_origins(self):
        self.assertEqual(
            _get_cors_origins(),
            ["http://127.0.0.1:8081", "http://192.168.1.20:8081"],
        )

    @patch.dict(os.environ, {}, clear=True)
    @patch("main.CONFIG", {"cors_origins": ["http://configured-host:8081"]})
    def test_configured_origins_are_used_without_environment_override(self):
        self.assertEqual(_get_cors_origins(), ["http://configured-host:8081"])

