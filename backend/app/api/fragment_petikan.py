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


def _extract_fragment_name(
    text: str,
    start_marker: str = "Sdr.",
    end_marker: str = "(NIP",
) -> str | None:
    pattern = (
        rf"(?is){re.escape(start_marker)}\s*(.*?)"
        rf"\s*{re.escape(end_marker)}"
    )
    matches = re.findall(pattern, text)
    if not matches:
        return None
    name = re.sub(r"\s+", " ", matches[0]).strip(" ,;:")
    return _sanitize_filename(name) if name else None


def _parse_ignored_pages(value: str, page_count: int) -> set[int]:
    ignored: set[int] = set()
    if not value.strip():
        return ignored

    for item in value.split(","):
        item = item.strip()
        if not item:
            continue
        if re.fullmatch(r"\d+", item):
            page_number = int(item)
            if page_number < 1 or page_number > page_count:
                raise HTTPException(
                    status_code=422,
                    detail="Nomor halaman abaikan berada di luar PDF.",
                )
            ignored.add(page_number - 1)
            continue
        range_match = re.fullmatch(r"(\d+)\s*-\s*(\d+)", item)
        if not range_match:
            raise HTTPException(
                status_code=422,
                detail="Format halaman abaikan tidak valid. Gunakan angka atau rentang, misalnya 1,3-5.",
            )
        first = int(range_match.group(1))
        last = int(range_match.group(2))
        if first < 1 or last < first or last > page_count:
            raise HTTPException(
                status_code=422,
                detail="Rentang halaman abaikan berada di luar PDF.",
            )
        ignored.update(range(first - 1, last))
    return ignored


@router.post("/split")
async def split_petikan_pdf(
    file: UploadFile = File(...),
    pages_per_fragment: int = Form(...),
    start_marker: str = Form("Sdr."),
    end_marker: str = Form("(NIP"),
    ignored_pages: str = Form(""),
    _: User = Depends(get_current_user),
):
    if pages_per_fragment < 1:
        raise HTTPException(status_code=422, detail="Jumlah halaman per fragment minimal 1.")
    if not start_marker.strip() or not end_marker.strip():
        raise HTTPException(status_code=422, detail="Teks awal dan teks akhir penamaan wajib diisi.")

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

    ignored_indexes = _parse_ignored_pages(ignored_pages, len(reader.pages))
    active_page_indexes = [
        page_index
        for page_index in range(len(reader.pages))
        if page_index not in ignored_indexes
    ]
    if not active_page_indexes:
        raise HTTPException(
            status_code=422,
            detail="Semua halaman dipilih untuk diabaikan; tidak ada halaman yang diproses.",
        )
    active_page_count = len(active_page_indexes)
    leftover_page_count = active_page_count % pages_per_fragment

    output = BytesIO()
    fragment_count = 0
    used_names: set[str] = set()
    skipped_count = 0
    with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
        for start in range(0, active_page_count, pages_per_fragment):
            end = min(start + pages_per_fragment, active_page_count)
            chunk_text_parts: list[str] = []
            writer = PdfWriter()
            for active_position in range(start, end):
                page_index = active_page_indexes[active_position]
                page = reader.pages[page_index]
                writer.add_page(page)
                try:
                    chunk_text_parts.append(page.extract_text() or "")
                except Exception:
                    chunk_text_parts.append("")

            fragment_count += 1
            mined_name = _extract_fragment_name(
                "\n".join(chunk_text_parts),
                start_marker.strip(),
                end_marker.strip(),
            )
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
            "X-Ignored-Page-Count": str(len(ignored_indexes)),
            "X-Leftover-Page-Count": str(leftover_page_count),
        },
    )
