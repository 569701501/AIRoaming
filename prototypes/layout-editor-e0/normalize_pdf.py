import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from pypdf.generic import ArrayObject, ByteStringObject


def main() -> None:
    source = Path(sys.argv[1])
    target = Path(sys.argv[2])
    reader = PdfReader(str(source))
    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)
    fixed = datetime(2026, 7, 15, tzinfo=timezone.utc)
    writer.add_metadata({
        "/Title": "AI Roaming G5 E0 deterministic publication prototype",
        "/Author": "AI Roaming",
        "/Creator": "G5 E0 prototype",
        "/Producer": "pypdf deterministic normalization",
        "/CreationDate": fixed.strftime("D:%Y%m%d%H%M%SZ"),
        "/ModDate": fixed.strftime("D:%Y%m%d%H%M%SZ"),
    })
    stable_id = b"AIROAMING-G5-E0-PDF-ID-20260715"
    writer._ID = ArrayObject([ByteStringObject(stable_id), ByteStringObject(stable_id)])
    with target.open("wb") as handle:
        writer.write(handle)

    font_records = {}
    for page in reader.pages:
        resources = page.get("/Resources") or {}
        fonts = resources.get("/Font") or {}
        for resource_name, font_ref in fonts.items():
            font = font_ref.get_object()
            subtype = str(font.get("/Subtype", "unknown"))
            base_font = str(font.get("/BaseFont", "unknown"))
            descriptor = font.get("/FontDescriptor")
            if descriptor is None and font.get("/DescendantFonts"):
                descendant = font["/DescendantFonts"][0].get_object()
                descriptor = descendant.get("/FontDescriptor")
            descriptor = descriptor.get_object() if descriptor else None
            embedded_stream = None
            if descriptor:
                embedded_stream = next((key for key in ("/FontFile", "/FontFile2", "/FontFile3") if descriptor.get(key)), None)
            embedded = bool(embedded_stream or (subtype == "/Type3" and font.get("/CharProcs")))
            key = f"{resource_name}:{base_font}:{subtype}"
            font_records[key] = {
                "resourceName": str(resource_name),
                "baseFont": base_font,
                "subtype": subtype,
                "embedded": embedded,
                "embeddedStream": embedded_stream,
            }
    media_boxes = [
        {"widthPt": float(page.mediabox.width), "heightPt": float(page.mediabox.height)}
        for page in reader.pages
    ]
    media_box = reader.pages[0].mediabox if reader.pages else None
    result = {
        "pageCount": len(reader.pages),
        "widthPt": float(media_box.width) if media_box else None,
        "heightPt": float(media_box.height) if media_box else None,
        "allMediaBoxesEqual": len({(item["widthPt"], item["heightPt"]) for item in media_boxes}) <= 1,
        "fonts": sorted(font_records.values(), key=lambda item: (item["baseFont"], item["resourceName"])),
    }
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
