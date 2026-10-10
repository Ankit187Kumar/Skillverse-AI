"""Install the language runtimes the Coding Lab uses into a Piston sandbox.

    python scripts/piston_setup.py http://localhost:2000
    # or inside docker compose:  docker compose exec backend python scripts/piston_setup.py http://piston:2000
"""

import sys

import httpx

WANTED = {"python": "python", "javascript": "node", "java": "java", "cpp": "gcc"}


def version_key(v: str):
    return [int(x) if x.isdigit() else 0 for x in v.split(".")]


def main(url: str) -> None:
    url = url.rstrip("/")
    packages = httpx.get(f"{url}/api/v2/packages", timeout=30).json()
    for lang, pkg in WANTED.items():
        versions = [p for p in packages if p["language"] == pkg]
        if not versions:
            print(f"! no '{pkg}' package available for {lang}")
            continue
        latest = max(versions, key=lambda p: version_key(p["language_version"]))
        if latest.get("installed"):
            print(f"✓ {pkg} {latest['language_version']} already installed")
            continue
        print(f"… installing {pkg} {latest['language_version']} (this can take a few minutes)")
        r = httpx.post(f"{url}/api/v2/packages", json={"language": pkg, "version": latest["language_version"]}, timeout=900)
        print("✓ installed" if r.status_code < 400 else f"! failed: {r.status_code} {r.text[:200]}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "http://localhost:2000")
