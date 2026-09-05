from pathlib import Path

ROOT = Path(__file__).resolve().parent
html = (ROOT / "index.html").read_text(encoding="utf-8")

assert "<title>VANTFLOW" in html, "page title must use VANTFLOW"
assert 'src="assets/vantflow-logo-dark.svg"' in html, "navigation must show VANTFLOW logo"
assert 'href="assets/vantflow-icon.svg"' in html, "favicon must use VANTFLOW icon"
assert "Mohammed Anes — n8n Automation Builder" not in html, "old personal brand title remains"
for section in ("services", "work", "process", "offer", "contact"):
    assert f'id="{section}"' in html, f"missing #{section} section"
for phrase in ("AI automation", "AI agents", "No silent failures", "$200"):
    assert phrase.lower() in html.lower(), f"missing core agency message: {phrase}"
for asset in ("vantflow-logo-dark.svg", "vantflow-logo-light.svg", "vantflow-icon.svg"):
    assert (ROOT / "assets" / asset).is_file(), f"missing brand asset: {asset}"
assert "wa.me/213791192350" in html, "WhatsApp CTA missing"
assert "anesch829@gmail.com" in html, "email CTA missing"
print("VANTFLOW landing-page checks passed")
