"""Assemble the static Evidence Lab site, PDF worker and original disclosure."""
from base64 import b64encode
from hashlib import sha256, sha512
from io import BytesIO
from pathlib import Path, PurePosixPath
import shutil
import tarfile
from urllib.error import URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
VERSION = "6.5.438"
URL = f"https://registry.npmjs.org/pdfjs-dist/-/pdfjs-dist-{VERSION}.tgz"
INTEGRITY = "vg8Pw1x+AFKy4AMDvhuWl5cOYV8d698UoEANoFFhc79hqXDnZQqnOXoxw3HG907WHOg1JYOvLhP756boddFxpA=="
ASSETS = {
    "package/legacy/build/pdf.min.mjs": "pdf.mjs",
    "package/legacy/build/pdf.worker.min.mjs": "pdf.worker.mjs",
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


DISCLOSURE_URL = "https://openinformation.novascotia.ca/api/views/8psg-54u5/files/d1162ffb-acd0-4911-8983-5074ef4c8bd9?download=true&filename=2020-00906-TIR_PublicPackage.pdf"
DISCLOSURE_SHA256 = "a65e8c534e46c7d963d68be6b119225a74ce331114b2f05ced0b6a508b10f2a1"


def disclosure_pdf():
    urls = (DISCLOSURE_URL, "https://openinformation.novascotia.ca/download/8psg-54u5/application/pdf")
    for url in urls:
        request = Request(url, headers={"User-Agent": "CoolCode Evidence Lab build"})
        try:
            with urlopen(request, timeout=60) as response:
                contents = response.read(8 * 1024 * 1024)
        except (URLError, TimeoutError):
            continue
        if sha256(contents).hexdigest() == DISCLOSURE_SHA256:
            return contents
    raise SystemExit("Could not verify the Nova Scotia PDF. Check the original release before publishing.")


def main():
    assets = get_assets()
    disclosure = disclosure_pdf()
    if DIST.exists():
        shutil.rmtree(DIST)
    shutil.copytree(ROOT / "web", DIST)
    for name, contents in assets.items():
        destination = DIST / "vendor" / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(contents)
    (DIST / "2020-00906-TIR_PublicPackage.pdf").write_bytes(disclosure)
    print(f"Built {DIST} with PDF.js {VERSION}.")


if __name__ == "__main__":
    main()
