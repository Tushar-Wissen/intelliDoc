import sys
import time
from pathlib import Path

import fitz
from pypdf import PdfReader

# Allow the script to be run directly from the ai-service directory.
SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from app.services.ocr_adapter import create_ocr_adapter
from app.services.extractor import SelectiveExtractor


def render_pages(path: Path):
    pdf_bytes = path.read_bytes()
    reader = PdfReader(str(path))
    rendered = fitz.open(stream=pdf_bytes, filetype="pdf")
    pages = []
    for index, page in enumerate(reader.pages):
        native_text = page.extract_text() or ""
        pages.append((index + 1, native_text, rendered[index].get_pixmap(dpi=200)))
    return pages, rendered


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python scripts/benchmark_selective_ocr.py <mixed.pdf>")
        return 2

    path = Path(sys.argv[1])
    pages, rendered = render_pages(path)
    ocr = create_ocr_adapter()

    selective_start = time.perf_counter()
    selective_calls = 0
    selective_pages = []
    for page_number, native_text, image in pages:
        if SelectiveExtractor.native_text_is_usable(native_text):
            selective_pages.append(page_number)
            continue
        selective_calls += 1
        ocr.extract(image)
    selective_seconds = time.perf_counter() - selective_start

    all_start = time.perf_counter()
    for _, _, image in pages:
        ocr.extract(image)
    all_seconds = time.perf_counter() - all_start

    print(f"document={path.name}")
    print(f"pages={len(pages)}")
    print(f"native_pages={len(selective_pages)}")
    print(f"selective_ocr_calls={selective_calls}")
    print(f"ocr_all_calls={len(pages)}")
    print(f"selective_seconds={selective_seconds:.3f}")
    print(f"ocr_all_seconds={all_seconds:.3f}")
    if all_seconds:
        print(f"time_reduction_percent={(1 - selective_seconds / all_seconds) * 100:.1f}")

    rendered.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
