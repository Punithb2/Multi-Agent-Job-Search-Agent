"""Read the visual style of an uploaded resume PDF, without any AI request.

The result lets the frontend rebuild the tailored resume (and a matching cover
letter) in the candidate's own fonts, sizes, colours, name alignment, and heading
treatment. It is a best-effort description: graphics, photos, icons, and
multi-column layouts are not reproduced, and anything that cannot be read with
confidence is simply left out so the frontend falls back to its defaults.
"""

import io
import math
import re
from collections import Counter

from pypdf import PdfReader

# Words that mark a resume section heading. This is only used to find headings so
# their styling can be measured; it plays no part in reading the resume content.
SECTION_WORDS = {
    "summary", "profile", "objective", "about", "experience", "employment",
    "work", "internship", "internships", "education", "academic", "projects",
    "project", "skills", "technical", "certifications", "certificates", "awards",
    "achievements", "publications", "languages", "interests", "activities",
    "leadership", "volunteering", "volunteer", "extracurricular", "courses",
    "coursework", "training", "references", "hobbies", "strengths", "contact",
}


def _multiply(m1, m2):
    """Multiply two PDF 6-element transformation matrices."""
    a1, b1, c1, d1, e1, f1 = m1
    a2, b2, c2, d2, e2, f2 = m2
    return [
        a1 * a2 + b1 * c2,
        a1 * b2 + b1 * d2,
        c1 * a2 + d1 * c2,
        c1 * b2 + d1 * d2,
        e1 * a2 + f1 * c2 + e2,
        e1 * b2 + f1 * d2 + f2,
    ]


def _clean_font_name(base_font) -> str:
    name = str(base_font or "").lstrip("/")
    return name.split("+", 1)[1] if "+" in name else name  # drop subset prefix "ABCDEF+"


def _is_bold(font_name: str) -> bool:
    return bool(re.search(r"bold|black|heavy|semibold|demibold|cmbx|cmb10|medium", font_name, re.IGNORECASE))


def _hex(rgb) -> str | None:
    if not rgb:
        return None
    return "#" + "".join(f"{max(0, min(255, round(channel * 255))):02x}" for channel in rgb)


def _to_rgb(args):
    """Colour operator arguments → RGB floats (gray, RGB, or CMYK by length)."""
    try:
        values = [float(value) for value in args]
    except (TypeError, ValueError):
        return None
    if len(values) == 1:
        return (values[0],) * 3
    if len(values) == 3:
        return tuple(values)
    if len(values) == 4:
        c, m, y, k = values
        return ((1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k))
    return None


def _saturation(rgb) -> float:
    return max(rgb) - min(rgb) if rgb else 0.0


def _lightness(rgb) -> float:
    return (max(rgb) + min(rgb)) / 2 if rgb else 0.0


def _collect(page):
    """Text runs (with font, size, position, colour) and horizontal rules on one page."""
    runs, rules = [], []
    state = {"fill": (0.0, 0.0, 0.0), "stroke": (0.0, 0.0, 0.0), "path": [], "rect": [], "line_width": 1.0}

    def before(operator, args, cm, tm):
        if operator == b"w" and args:
            try:
                state["line_width"] = float(args[0]) * (abs(cm[0]) or 1.0)
            except (TypeError, ValueError):
                pass
        elif operator in (b"rg", b"g", b"k", b"sc", b"scn"):
            rgb = _to_rgb(args)
            if rgb:
                state["fill"] = rgb
        elif operator in (b"RG", b"G", b"K", b"SC", b"SCN"):
            rgb = _to_rgb(args)
            if rgb:
                state["stroke"] = rgb
        elif operator == b"re" and len(args) == 4:
            x, y, w, h = (float(value) for value in args)
            state["rect"].append((cm, x, y, w, h))
        elif operator == b"m" and len(args) == 2:
            state["path"] = [(cm, float(args[0]), float(args[1]))]
        elif operator == b"l" and len(args) == 2 and state["path"]:
            state["path"].append((cm, float(args[0]), float(args[1])))
        elif operator in (b"S", b"s", b"f", b"F", b"f*", b"B", b"b"):
            stroke = operator in (b"S", b"s", b"B", b"b")
            colour = state["stroke"] if stroke else state["fill"]
            for matrix, x, y, w, h in state["rect"]:
                sx, sy = abs(matrix[0]), abs(matrix[3])
                width, height = abs(w * sx), abs(h * sy)
                if height <= 3 and width > 0:  # a thin filled bar reads as a rule
                    left = x * matrix[0] + matrix[4] + min(0, w * sx)
                    thickness = height if not stroke else state["line_width"]
                    rules.append({"x": left, "y": y * matrix[3] + matrix[5], "width": width, "color": colour, "thickness": thickness})
            if stroke and len(state["path"]) >= 2:
                (m1, x1, y1), (m2, x2, y2) = state["path"][0], state["path"][-1]
                ax, ay = x1 * m1[0] + m1[4], y1 * m1[3] + m1[5]
                bx, by = x2 * m2[0] + m2[4], y2 * m2[3] + m2[5]
                if abs(ay - by) <= 1.5:
                    rules.append({"x": min(ax, bx), "y": ay, "width": abs(bx - ax), "color": colour, "thickness": state["line_width"]})
            state["rect"], state["path"] = [], []

    def text(value, cm, tm, font_dict, font_size):
        if not value or not value.strip():
            return
        matrix = _multiply(tm, cm)
        scale = math.hypot(matrix[2], matrix[3]) or 1.0
        size = float(font_size or 0) * scale
        if size <= 0:
            return
        font = _clean_font_name((font_dict or {}).get("/BaseFont"))
        runs.append({
            "text": value,
            "font": font,
            "bold": _is_bold(font),
            "size": round(size, 2),
            "x": matrix[4],
            "y": matrix[5],
            "color": state["fill"],
        })

    page.extract_text(visitor_operand_before=before, visitor_text=text)
    return runs, rules


def _lines(runs):
    """Group runs into visual lines by baseline."""
    lines = []
    for run in sorted(runs, key=lambda item: (-round(item["y"]), item["x"])):
        if lines and abs(lines[-1]["y"] - run["y"]) <= 2.0:
            lines[-1]["runs"].append(run)
        else:
            lines.append({"y": run["y"], "runs": [run]})
    for line in lines:
        line["runs"].sort(key=lambda item: item["x"])
        line["text"] = re.sub(r"\s+", " ", "".join(run["text"] for run in line["runs"])).strip()
        chars = Counter()
        for run in line["runs"]:
            chars[(run["size"], run["font"], run["bold"], run["color"])] += len(run["text"].strip())
        (size, font, bold, color), _ = chars.most_common(1)[0]
        line.update(size=max(run["size"] for run in line["runs"]), body_size=size, font=font, bold=bold, color=color)
        line["x"] = line["runs"][0]["x"]
        last = line["runs"][-1]
        line["end"] = last["x"] + len(last["text"]) * last["size"] * 0.5
    return lines


def _is_heading_text(text: str) -> bool:
    words = re.findall(r"[A-Za-z]+", text.lower())
    return 0 < len(words) <= 4 and len(text) <= 40 and any(word in SECTION_WORDS for word in words) and not text.endswith(".")


def _mode(values, default=None):
    values = [value for value in values if value is not None]
    return Counter(values).most_common(1)[0][0] if values else default


def extract_resume_style(pdf_bytes: bytes) -> dict | None:
    """Describe a resume's styling, or return None when it cannot be read."""
    reader = PdfReader(io.BytesIO(pdf_bytes))
    if not reader.pages:
        return None
    page = reader.pages[0]
    width, height = float(page.mediabox.width), float(page.mediabox.height)
    runs, rules = _collect(page)
    lines = _lines(runs)
    if len(lines) < 4:
        return None

    # Body text: the size and font carrying the most characters.
    weighted = Counter()
    for run in runs:
        weighted[(round(run["size"] * 2) / 2, run["font"])] += len(run["text"].strip())
    (body_size, body_font), _ = weighted.most_common(1)[0]
    body_colors = Counter()
    for run in runs:
        if abs(run["size"] - body_size) <= 0.6:
            body_colors[run["color"]] += len(run["text"].strip())
    body_color = body_colors.most_common(1)[0][0] if body_colors else (0, 0, 0)

    left_margin = sorted(line["x"] for line in lines)[max(0, len(lines) // 10)]

    # Line spacing: baseline distance between consecutive body lines, as a
    # multiple of the body size. Larger gaps are paragraph or section breaks.
    gaps = []
    for upper, lower in zip(lines, lines[1:]):
        if abs(upper["body_size"] - body_size) <= 0.6 and abs(lower["body_size"] - body_size) <= 0.6:
            ratio = (upper["y"] - lower["y"]) / body_size
            if 0.95 <= ratio <= 1.9:
                gaps.append(ratio)
    line_spacing = round(sorted(gaps)[len(gaps) // 2], 3) if len(gaps) >= 3 else None

    # Name: the largest text near the top of the first page.
    top_lines = [line for line in lines if line["y"] >= height * 0.72] or lines[:3]
    name_line = max(top_lines, key=lambda line: (line["size"], line["y"]))
    if name_line["size"] < body_size * 1.15:
        name_line = top_lines[0]
    name_gap_left = name_line["x"] - left_margin
    name_center = (name_line["x"] + name_line["end"]) / 2
    centered = name_gap_left > width * 0.08 and abs(name_center - width / 2) < width * 0.12

    # Section headings, found by their wording so their styling can be measured.
    headings = [line for line in lines if line is not name_line and _is_heading_text(line["text"])]
    heading_style = None
    if len(headings) >= 2:
        heading_colors = [line["color"] for line in headings]
        heading_rule_hits = 0
        rule_colors = []
        rule_thicknesses = []
        for line in headings:
            for rule in rules:
                below = -16 <= rule["y"] - line["y"] <= 4
                if below and rule["width"] >= (width - 2 * left_margin) * 0.45:
                    heading_rule_hits += 1
                    rule_colors.append(rule["color"])
                    rule_thicknesses.append(round(rule.get("thickness", 1.0), 1))
                    break
        heading_style = {
            "size": round(_mode([round(line["size"] * 2) / 2 for line in headings]), 1),
            "font": _mode([line["font"] for line in headings]),
            "bold": sum(line["bold"] for line in headings) >= len(headings) / 2,
            "uppercase": sum(line["text"].upper() == line["text"] for line in headings) >= len(headings) / 2,
            "color": _mode(heading_colors),
            "rule": heading_rule_hits >= max(2, len(headings) // 2),
            "rule_color": _mode(rule_colors),
            "rule_width": _mode(rule_thicknesses),
        }

    # Accent colour: a clearly coloured heading or name, never near-black or pale.
    accent = None
    for candidate in ([heading_style["color"]] if heading_style else []) + [name_line["color"]]:
        if candidate and _saturation(candidate) > 0.18 and 0.15 < _lightness(candidate) < 0.8:
            accent = candidate
            break

    # Two columns: substantial text starting well right of the margin, repeatedly.
    right_starts = [line for line in lines if line["x"] > width * 0.42 and len(line["text"]) > 25]
    two_column = len(right_starts) >= 6

    def clamp(value, low, high):
        return round(max(low, min(high, value)), 1)

    def colour_or_none(rgb):
        # Leave out near-white colours: they would vanish on a white page.
        return _hex(rgb) if rgb and _lightness(rgb) < 0.85 else None

    style = {
        # The tailored resume is fitted to the same page count as the original.
        "pages": len(reader.pages),
        "page_size": "LETTER" if abs(width - 612) < 6 and abs(height - 792) < 6 else "A4",
        "margin": clamp(left_margin, 24, 90),
        "body": {"font": body_font, "size": clamp(body_size, 8.5, 12.5), "color": colour_or_none(body_color)},
        "name": {
            "font": name_line["font"],
            "size": clamp(name_line["size"], body_size, 32),
            "bold": name_line["bold"],
            "uppercase": name_line["text"].upper() == name_line["text"],
            "align": "center" if centered else "left",
            "color": colour_or_none(name_line["color"]),
        },
        "accent": _hex(accent),
        "line_spacing": line_spacing,
        "two_column": two_column,
    }
    if heading_style:
        style["heading"] = {
            "font": heading_style["font"],
            "size": clamp(heading_style["size"], body_size, 18),
            "bold": heading_style["bold"],
            "uppercase": heading_style["uppercase"],
            "color": colour_or_none(heading_style["color"]),
            "rule": heading_style["rule"],
            "rule_color": colour_or_none(heading_style["rule_color"]),
            "rule_width": clamp(heading_style["rule_width"] or 1.0, 0.5, 2.5),
        }
    return style
