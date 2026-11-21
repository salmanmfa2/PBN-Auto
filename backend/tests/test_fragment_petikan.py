import io
import unittest
from unittest.mock import patch
from zipfile import ZipFile

from fastapi.testclient import TestClient
from pypdf import PdfWriter

from app.api.fragment_petikan import _extract_fragment_name, _sanitize_filename
from app.api.auth import get_current_user, get_optional_current_user
from main import app


class FragmentPetikanTests(unittest.TestCase):
    def test_extract_fragment_name_uses_first_sdr_nip_match(self) -> None:
        text = "Sdr.  Ahmad Wijaya, S.E. (NIP 123 Sdr. Kedua (NIP 456"
        self.assertEqual(
            _extract_fragment_name(text),
            "Ahmad Wijaya, S.E.",
        )

    def test_sanitize_filename_limits_length_and_removes_invalid_characters(self) -> None:
        value = "Nama/Orang:*<>? \"Jawaban\" " + ("X" * 80)
        sanitized = _sanitize_filename(value)
        self.assertLessEqual(len(sanitized), 50)
        self.assertNotRegex(sanitized, r'[<>:"/\\|?*]')

    def test_split_endpoint_returns_two_page_and_three_page_zip_fragments(self) -> None:
        user = type("User", (), {"user": "owner", "auth_level": 4})()
        app.dependency_overrides[get_current_user] = lambda: user
        app.dependency_overrides[get_optional_current_user] = lambda: user
        try:
            client = TestClient(app)
            for pages in (2, 3):
                pdf_bytes = self._create_pdf(4)
                response = client.post(
                    "/fragment-petikan/split",
                    data={"pages_per_fragment": str(pages)},
                    files={"file": ("source.pdf", pdf_bytes, "application/pdf")},
                )
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(response.headers["content-type"], "application/zip")
                with ZipFile(io.BytesIO(response.content), "r") as archive:
                    expected_count = 4 // pages + (1 if 4 % pages else 0)
                    self.assertEqual(len(archive.namelist()), expected_count)
        finally:
            app.dependency_overrides.pop(get_current_user, None)
            app.dependency_overrides.pop(get_optional_current_user, None)

    def _create_pdf(self, pages_per_fragment: int) -> bytes:
        writer = PdfWriter()
        for index in range(pages_per_fragment):
            writer.add_blank_page(width=612, height=792)
        output = io.BytesIO()
        writer.write(output)
        return output.getvalue()



if __name__ == "__main__":
    unittest.main()
