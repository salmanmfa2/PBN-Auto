import asyncio
import os

from groq import APIConnectionError, APIStatusError, APITimeoutError, Groq

from app.schemas.chat import ChatMessage


DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b"
MAX_COMPLETION_TOKENS = 700
REQUEST_TIMEOUT_SECONDS = 45


class ChatServiceError(Exception):
    def __init__(self, status_code: int, message: str):
        self.status_code = status_code
        super().__init__(message)


def _request_completion(messages: list[ChatMessage]) -> str:
    api_key = os.getenv("GROQ_API_KEY", "").strip()
    if not api_key:
        raise ChatServiceError(503, "The chat assistant is not configured on the server.")

    model = os.getenv("GROQ_MODEL", DEFAULT_GROQ_MODEL).strip()
    if not model:
        raise ChatServiceError(503, "The chat assistant model is not configured on the server.")

    request_messages = [
        {
            "role": "system",
            "content": (
                "You are the PBN Auto app assistant. Respond in the user's language, be concise, "
                "and prioritize factual accuracy over sounding helpful. The only confirmed app "
                "capabilities are: PBN Analytics uploads CSV/Excel datasets, applies listed cleaning "
                "methods, and exports supported CSV/Excel/PPTX outputs; Insight Hub provides the "
                "PBN Open + Edu + HB employee dashboard when the user has a compatible cleaned "
                "dataset; Insight Hub Beta is a web dashboard backed by pbncleaner.fetch_pbnopen; "
                "only Super Admins can replace that source from Admin by uploading a CSV whose "
                "columns match the table and confirming the replacement; Manajemen Plt./Plh. is a "
                "web-only monitoring table with authorized Admin/Super Admin record management; "
                "Generate ND Undangan Pelantikan and Analisis Kinerja DJPb are web placeholder "
                "menus that only show an on-development message. Desktop navigation has only PBN "
                "Analytics and Insight Hub and has no login system. User access levels are User "
                "(1), Admin (2), and Super Admin (3); Guest is a non-account mode. Do not invent "
                "menu names, routes, permissions, templates, data, or workflows. In particular, "
                "do not claim the app performs OCR, document extraction, SharePoint access, or "
                "document-library functions. If a capability or detail is not explicitly "
                "established here, say you do not have confirmed information and ask the user to "
                "verify it. Clearly label general suggestions as suggestions, not existing app "
                "behavior. You cannot see users' files or records unless they include information "
                "in their message."
            ),
        },
        *[message.model_dump() for message in messages],
    ]
    try:
        client = Groq(
            api_key=api_key,
            timeout=REQUEST_TIMEOUT_SECONDS,
            max_retries=0,
        )
        completion = client.chat.completions.create(
            model=model,
            messages=request_messages,
            max_completion_tokens=MAX_COMPLETION_TOKENS,
            temperature=0.4,
        )
    except APIStatusError as exc:
        if exc.status_code == 401:
            raise ChatServiceError(503, "The chat provider rejected the server API key.") from exc
        if exc.status_code == 429:
            raise ChatServiceError(429, "The chat provider is busy or its request quota was reached. Try again shortly.") from exc
        raise ChatServiceError(502, f"The chat provider returned an error (HTTP {exc.status_code}).") from exc
    except (APIConnectionError, APITimeoutError) as exc:
        raise ChatServiceError(502, "Could not reach the chat provider. Please try again.") from exc

    if not completion.choices:
        raise ChatServiceError(502, "The chat provider returned no answer.")
    answer = completion.choices[0].message.content
    if not isinstance(answer, str) or not answer.strip():
        raise ChatServiceError(502, "The chat provider returned an empty answer.")
    return answer.strip()


async def create_completion(messages: list[ChatMessage]) -> str:
    return await asyncio.to_thread(_request_completion, messages)
