from io import BytesIO
import re
from zipfile import ZIP_DEFLATED, ZipFile

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pypdf import PdfReader, PdfWriter

from app.api.auth import get_current_user
from app.api.menu_access import require_menu_access
from app.models.auth import User


router = APIRouter(
    prefix="/fragment-petikan",
    tags=["fragment petikan"],
    dependencies=[Depends(require_menu_access("fragment-petikan"))],
)

MAX_PDF_SIZE = 100 * 1024 * 1024
MAX_FILENAME_LENGTH = 50


def _sanitize_filename(value: str) -> str:
    cleaned = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", value)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" ")
    cleaned = re.sub(r"_+", "_", cleaned)
    return cleaned[:MAX_FILENAME_LENGTH].rstrip(" _-") or "Tanpa Nama"


def _extract_fragment_name(text: str) -> str | None:
    matches = re.findall(
        r"(?is)Sdr\.\s*(.*?)\s*\(\s*NIP",
        text,
    )
    if not matches:
        return None
    name = re.sub(r"\s+", " ", matches[0]).strip(" ,;:")
    return _sanitize_filename(name) if name else None


@router.post("/split")
async def split_petikan_pdf(
    file: UploadFile = File(...),
    pages_per_fragment: int = Form(...),
    _: User = Depends(get_current_user),
):
    if pages_per_fragment not in {2, 3}:
        raise HTTPException(status_code=422, detail="Jumlah halaman per fragment harus 2 atau 3.")

    filename = file.filename or ""
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File PDF saja yang didukung.")
    content = await file.read(MAX_PDF_SIZE + 1)
    await file.close()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="File PDF kosong.")
    if len(content) > MAX_PDF_SIZE:
        raise HTTPException(status_code=413, detail="Ukuran PDF melebihi 100 MB.")

    try:
        reader = PdfReader(BytesIO(content))
    except Exception as exc:
        raise HTTPException(status_code=422, detail="PDF tidak dapat dibaca.") from exc

    if len(reader.pages) == 0:
        raise HTTPException(status_code=422, detail="PDF tidak memiliki halaman.")

    output = BytesIO()
    fragment_count = 0
    used_names: set[str] = set()
    skipped_count = 0
    with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
        for start in range(0, len(reader.pages), pages_per_fragment):
            end = min(start + pages_per_fragment, len(reader.pages))
            chunk_text_parts: list[str] = []
            writer = PdfWriter()
            for page_index in range(start, end):
                page = reader.pages[page_index]
                writer.add_page(page)
                try:
                    chunk_text_parts.append(page.extract_text() or "")
                except Exception:
                    chunk_text_parts.append("")

            fragment_count += 1
            mined_name = _extract_fragment_name("\n".join(chunk_text_parts))
            if mined_name is None:
                skipped_count += 1
                mined_name = "Tanpa Nama"

            if mined_name in used_names:
                base_name = mined_name
                if len(base_name) > 46:
                    base_name = base_name[:46].rstrip(" ._-")
                sequence = 2
                mined_name = f"{base_name}_{sequence}"
                while mined_name in used_names:
                    sequence += 1
                    mined_name = f"{base_name}_{sequence}"
            used_names.add(mined_name)

            pdf_buffer = BytesIO()
            writer.write(pdf_buffer)
            pdf_buffer.seek(0)
            output_name = f"{fragment_count}_{mined_name}_Petikan.pdf"
            archive.writestr(output_name, pdf_buffer.getvalue())

    return StreamingResponse(
        BytesIO(output.getvalue()),
        media_type="application/zip",
        headers={
            "Content-Disposition": 'attachment; filename="fragment-petikan.zip"',
            "X-Fragment-Count": str(fragment_count),
            "X-Skipped-Name-Count": str(skipped_count),
        },
    )
