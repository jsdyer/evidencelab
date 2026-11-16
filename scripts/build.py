"""Assemble the static Evidence Lab site, PDF worker and example."""
from base64 import b64encode
from hashlib import sha512
from io import BytesIO
from pathlib import Path, PurePosixPath
import shutil
import tarfile
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
VERSION = "6.5.438"
URL = f"https://registry.npmjs.org/pdfjs-dist/-/pdfjs-dist-{VERSION}.tgz"
INTEGRITY = "vg8Pw1x+AFKy4AMDvhuWl5cOYV8d698UoEANoFFhc79hqXDnZQqnOXoxw3HG907WHOg1JYOvLhP756boddFxpA=="
ASSETS = {
    "package/build/pdf.min.mjs": "pdf.mjs",
    "package/build/pdf.worker.min.mjs": "pdf.worker.mjs",
    "package/LICENSE": "PDFJS-LICENSE",
}
TABLES = {"cmaps", "standard_fonts"}


def get_assets():
    headers = {"User-Agent": "CoolCode Evidence Lab build"}
    with urlopen(Request(URL, headers=headers), timeout=60) as response:
        payload = response.read(30 * 1024 * 1024 + 1)
    if b64encode(sha512(payload).digest()).decode() != INTEGRITY:
        raise SystemExit("The pinned PDF.js package did not pass verification.")

    with tarfile.open(fileobj=BytesIO(payload), mode="r:gz") as package:
        assets = {destination: package.extractfile(member).read() for member, destination in ASSETS.items()}
        for member in package:
            parts = PurePosixPath(member.name).parts
            if member.isfile() and len(parts) == 3 and parts[0] == "package" and parts[1] in TABLES:
                assets[str(PurePosixPath(*parts[1:]))] = package.extractfile(member).read()
    return assets


def example_pdf():
    entries = [
        [
            "Example briefing note",
            "15 May 2021",
            "Alice Morgan reviewed the shoreline mapping archive and ledger.",
            "A reference to section 19(1) appears in the margin.",
        ],
        [
            "Archive transfer record",
            "2020-02-29",
            "The shoreline mapping archive was transferred to the north storage room.",
            "The transfer log mentions s. 21(1)(a) and s. 19(1).",
        ],
    ]
    entries.append(entries[1])
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Count 3 /Kids [4 0 R 6 0 R 8 0 R] >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    for position, lines in enumerate(entries):
        content_id = 5 + position * 2
        objects.append(
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            f"/Resources << /Font << /F1 3 0 R >> >> /Contents {content_id} 0 R >>".encode()
        )
        escaped = [line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)") for line in lines]
        text = b"BT /F1 14 Tf 18 TL 60 710 Td\n" + "\nT*\n".join(f"({line}) Tj" for line in escaped).encode() + b"\nET\n"
        objects.append(f"<< /Length {len(text)} >>\nstream\n".encode() + text + b"endstream")
    objects.append(b"<< /Title (Example ATIP package) /Author (CoolCode) /CreationDate (D:20260501120000Z) >>")

    document = bytearray(b"%PDF-1.7\n")
    offsets = []
    for number, item in enumerate(objects, 1):
        offsets.append(len(document))
        document.extend(f"{number} 0 obj\n".encode() + item + b"\nendobj\n")
    xref = len(document)
    document.extend(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode())
    for offset in offsets:
        document.extend(f"{offset:010} 00000 n \n".encode())
    document.extend(f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R /Info {len(objects)} 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode())
    return document


def main():
    assets = get_assets()
    if DIST.exists():
        shutil.rmtree(DIST)
    shutil.copytree(ROOT / "web", DIST)
    for name, contents in assets.items():
        destination = DIST / "vendor" / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(contents)
    (DIST / "sample.pdf").write_bytes(example_pdf())
    print(f"Built {DIST} with PDF.js {VERSION}.")


if __name__ == "__main__":
    main()
