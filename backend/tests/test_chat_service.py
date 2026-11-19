import os
import unittest
from unittest.mock import Mock, patch

from groq import APIStatusError
from pydantic import ValidationError

from app.schemas.chat import ChatMessage, ChatRequest
from app.services.chat_service import (
    DEFAULT_GROQ_MODEL,
    ChatServiceError,
    _request_completion,
)


class ChatServiceTests(unittest.TestCase):
    def test_chat_request_requires_user_as_last_message(self):
        with self.assertRaises(ValidationError):
            ChatRequest(messages=[
                ChatMessage(role="user", content="Hello"),
                ChatMessage(role="assistant", content="Hi"),
            ])

    @patch.dict(os.environ, {}, clear=True)
    def test_missing_api_key_returns_configuration_error(self):
        with self.assertRaises(ChatServiceError) as error:
            _request_completion([ChatMessage(role="user", content="Hello")])
        self.assertEqual(error.exception.status_code, 503)

    @patch.dict(os.environ, {"GROQ_API_KEY": "test-key-not-real"}, clear=True)
    @patch("app.services.chat_service.Groq")
    def test_request_uses_server_key_and_configured_groq_model(self, groq_client):
        groq_client.return_value.chat.completions.create.return_value.choices = [
            Mock(message=Mock(content="Hello from the assistant."))
        ]

        answer = _request_completion([ChatMessage(role="user", content="Hello")])

        self.assertEqual(answer, "Hello from the assistant.")
        groq_client.assert_called_once_with(
            api_key="test-key-not-real",
            timeout=45,
            max_retries=0,
        )
        request = groq_client.return_value.chat.completions.create.call_args.kwargs
        self.assertEqual(request["model"], DEFAULT_GROQ_MODEL)
        system_prompt = request["messages"][0]["content"]
        self.assertIn("Do not invent menu names, routes, permissions", system_prompt)
        self.assertIn("do not claim the app performs OCR", system_prompt)
        self.assertIn("Insight Hub Beta is a web dashboard backed by pbncleaner.fetch_pbnopen", system_prompt)
        self.assertIn("only Super Admins can replace that source", system_prompt)
        self.assertIn("Analisis Kinerja DJPb is a publicly readable web feature", system_prompt)
        self.assertIn("only Super Admins can replace a period's full CSV dataset", system_prompt)
        self.assertIn(
            "choose an available EPRIDE source year/TW independently from the target dataset",
            system_prompt,
        )
        self.assertIn("explicitly sync submitted 13-digit-idUnit corrections", system_prompt)
        self.assertIn("CSV values remain authoritative until sync", system_prompt)
        self.assertIn("supports quarterly comparisons", system_prompt)
        self.assertNotIn("upload Excel adjustments", system_prompt)
        self.assertNotIn("does not retain previous quarters", system_prompt)
        self.assertIn("Bahan Pendukung MPK and Simulasi Mutasi remain web placeholder", system_prompt)
        self.assertIn("Desktop navigation has only PBN Analytics and Insight Hub", system_prompt)
        self.assertIn(
            "Web access levels are Guest (0), User (1), Special User (2), Super Admin (3), and God User (4)",
            system_prompt,
        )
        self.assertIn("God User can configure per-menu minimum View/Edit levels", system_prompt)
        self.assertEqual(request["messages"][-1], {"role": "user", "content": "Hello"})

    @patch.dict(os.environ, {"GROQ_API_KEY": "test-key-not-real"}, clear=True)
    @patch("app.services.chat_service.Groq")
    def test_provider_rate_limit_is_reported(self, groq_client):
        groq_client.side_effect = APIStatusError(
            "Too many requests",
            response=Mock(status_code=429, headers={}),
            body=None,
        )

        with self.assertRaises(ChatServiceError) as error:
            _request_completion([ChatMessage(role="user", content="Hello")])
        self.assertEqual(error.exception.status_code, 429)

    @patch.dict(os.environ, {"GROQ_API_KEY": "test-key-not-real"}, clear=True)
    @patch("app.services.chat_service.Groq")
    def test_empty_provider_answer_is_reported(self, groq_client):
        groq_client.return_value.chat.completions.create.return_value.choices = [
            Mock(message=Mock(content="  "))
        ]

        with self.assertRaises(ChatServiceError) as error:
            _request_completion([ChatMessage(role="user", content="Hello")])
        self.assertEqual(error.exception.status_code, 502)


if __name__ == "__main__":
    unittest.main()
