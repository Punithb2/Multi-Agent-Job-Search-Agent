"""Compare a tailored resume with the original, so the candidate can check every change.

This is deliberately not an AI summary of the edits: a model describing its own
changes can be as wrong as the changes themselves. Instead each line of the
tailored resume is aligned to the closest passage of the original resume text, and
the differences are reported word by word. Numbers and names that appear nowhere in
the original are flagged separately, because those are the likeliest invented facts.
"""

import re
from collections import Counter
from difflib import SequenceMatcher

UNCHANGED_AT = 0.97   # at or above this similarity a line counts as unchanged
MODIFIED_AT = 0.4     # below this the line has no real counterpart: new content
WIDEN_FROM = 0.25     # a partial match this close may still match a whole original passage
MIN_REMOVED_TOKENS = 5
NEARBY_TOKENS = 25    # how far around the matched passage a layout line may draw words from

# Lines that describe structure rather than prose. Resume templates put the name,
# role, dates, and location of an entry on different lines and in different orders,
# so for these only the words matter, not their order.
LAYOUT_KINDS = {"name", "section", "entry", "subtitle", "contact"}

STOPWORDS = {
    "a", "an", "the", "and", "or", "of", "to", "in", "on", "for", "with", "by", "at", "as",
    "from", "into", "via", "is", "are", "was", "were", "be", "been", "using", "used", "use",
    "i", "my", "me", "our", "we", "this", "that", "these", "those", "it", "its",
}

_BULLET_CHARS = "•●▪◦‣∙"


def _normalise_token(token: str) -> str:
    token = token.lower().replace("’", "'").replace("–", "-").replace("—", "-")
    return token.strip(".,;:!?()[]{}\"'|*`")


def _tokens(text: str) -> list[str]:
    return [token for token in re.findall(r"\S+", text) if _normalise_token(token)]


def _plain(markdown_line: str) -> str:
    """Markdown formatting removed: links become their text, emphasis markers go."""
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", markdown_line)
    text = re.sub(r"(\*\*|__|\*|_|`)", "", text)
    return text.strip()


def _original_tokens(text: str):
    """Words of the original resume, plus the positions where a passage starts.

    A passage is one bullet, one paragraph, or one short line. PDF text breaks long
    bullets across lines, so a line only continues the previous one when that line
    ran close to the full width of the page.
    """
    text = re.sub(r"(\w)-\n(\w)", r"\1-\2", text or "")  # re-join words hyphenated across lines
    lines = text.split("\n")
    lengths = sorted(len(line.strip()) for line in lines if line.strip())
    wrap_width = lengths[int(len(lengths) * 0.9)] if lengths else 0

    tokens, starts, previous = [], {0}, ""
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        wrapped = previous and len(previous) >= 0.75 * wrap_width and not re.match(f"[{_BULLET_CHARS}]", stripped)
        if not wrapped:
            starts.add(len(tokens))
        tokens.extend(_tokens(re.sub(f"[{_BULLET_CHARS}]", " ", stripped)))
        previous = stripped
    starts.add(len(tokens))
    return tokens, sorted(starts)


def _whole_passage(start: int, end: int, passage_starts: list[int]):
    """The span widened to the original bullets or paragraphs it falls within."""
    low = max((position for position in passage_starts if position <= start), default=0)
    high = min((position for position in passage_starts if position >= end), default=end)
    return low, high


def _units(markdown: str):
    """Comparable units of the tailored resume: one per non-empty line."""
    section = ""
    for index, raw in enumerate((markdown or "").split("\n")):
        line = raw.strip()
        if not line:
            continue
        kind, body = "text", line
        for marker, name in (("### ", "entry"), ("## ", "section"), ("# ", "name"), ("- ", "bullet"), ("* ", "bullet")):
            if line.startswith(marker):
                kind, body = name, line[len(marker):]
                break
        else:
            if re.match(rf"^[{_BULLET_CHARS}]\s*", line):
                kind, body = "bullet", re.sub(rf"^[{_BULLET_CHARS}]\s*", "", line)
            elif re.fullmatch(r"\*[^*].*\*", line):
                kind = "subtitle"
        if kind == "section":
            section = _plain(body)
        elif kind == "text" and not section:
            kind = "contact"  # plain lines above the first section: contact details
        plain = _plain(body)
        if plain:
            yield {"line": index, "raw": raw, "kind": kind, "section": section, "text": plain}


def _best_window(unit_norm: list[str], original_norm: list[str], positions: dict[str, list[int]]):
    """Closest passage of the original to a unit, as (similarity, start, end)."""
    if not unit_norm or not original_norm:
        return 0.0, 0, 0

    # Vote for where the unit would start in the original, anchored on its words.
    votes = Counter()
    for offset, token in enumerate(unit_norm):
        if token in STOPWORDS:
            continue
        for position in positions.get(token, ()):
            votes[max(0, position - offset)] += 1
    if not votes:
        return 0.0, 0, 0

    best = (0.0, 0, 0)
    length = len(unit_norm)
    for start, _ in votes.most_common(6):
        low = max(0, start - 4)
        high = min(len(original_norm), start + length + 6)
        window = original_norm[low:high]
        matcher = SequenceMatcher(None, window, unit_norm, autojunk=False)
        blocks = [block for block in matcher.get_matching_blocks() if block.size]
        if not blocks:
            continue
        span_start, span_end = low + blocks[0].a, low + blocks[-1].a + blocks[-1].size
        matched = sum(block.size for block in blocks)
        similarity = 2 * matched / (length + (span_end - span_start))
        if similarity > best[0]:
            best = (similarity, span_start, span_end)
    return best


def _word_diff(original_display, original_norm, tailored_display, tailored_norm):
    segments = []

    def add(op, words):
        if not words:
            return
        text = " ".join(words)
        if segments and segments[-1]["op"] == op:
            segments[-1]["text"] += " " + text
        else:
            segments.append({"op": op, "text": text})

    matcher = SequenceMatcher(None, original_norm, tailored_norm, autojunk=False)
    for tag, a1, a2, b1, b2 in matcher.get_opcodes():
        if tag == "equal":
            add("same", tailored_display[b1:b2])
        else:
            add("removed", original_display[a1:a2])
            add("added", tailored_display[b1:b2])
    return segments


def _new_terms(tailored_display, original_vocabulary):
    """Numbers and names in a line that the original resume never mentions."""
    flagged = []
    for position, token in enumerate(tailored_display):
        norm = _normalise_token(token)
        if not norm or norm in original_vocabulary or norm in STOPWORDS:
            continue
        cleaned = token.strip(".,;:!?()[]{}\"'|*`")
        is_number = any(character.isdigit() for character in cleaned)
        # Proper nouns and technology names: capitalised mid-sentence, all caps, or
        # containing symbols like "C++", "Node.js". A capitalised first word is just
        # the start of a sentence.
        starts_sentence = position == 0 or tailored_display[position - 1].rstrip("\"')").endswith((".", "!", "?", ":"))
        is_name = (not starts_sentence and cleaned[:1].isupper()) or (len(cleaned) > 1 and cleaned.isupper()) or bool(re.search(r"[+#]|\.\w", cleaned))
        if (is_number or is_name) and cleaned not in flagged:
            flagged.append(cleaned)
    return flagged


def compare_resumes(original_text: str, tailored_markdown: str) -> dict:
    original_display, passage_starts = _original_tokens(original_text)
    original_norm = [_normalise_token(token) for token in original_display]
    original_vocabulary = set(original_norm)
    positions: dict[str, list[int]] = {}
    for position, token in enumerate(original_norm):
        positions.setdefault(token, []).append(position)

    covered = [False] * len(original_norm)
    items, counts = [], Counter()

    for unit in _units(tailored_markdown):
        tailored_display = _tokens(unit["text"])
        tailored_norm = [_normalise_token(token) for token in tailored_display]
        similarity, start, end = _best_window(tailored_norm, original_norm, positions)

        if similarity >= MODIFIED_AT:
            for position in range(start, end):
                covered[position] = True

        # A layout line whose words all occur close together somewhere in the
        # original has only been rearranged, so it counts as unchanged. Searching
        # from the line's rarest word (not just the best-matching passage) matters
        # because dates like "05/2026 | Bengaluru" repeat across entries. Words
        # borrowed from a distant entry, such as another job's dates, still differ.
        rearranged = False
        if unit["kind"] in LAYOUT_KINDS and tailored_norm and all(token in original_vocabulary for token in tailored_norm):
            wanted = set(tailored_norm)
            rarest = min(wanted, key=lambda token: len(positions.get(token, ())))
            for anchor in positions.get(rarest, ()):
                low, high = max(0, anchor - NEARBY_TOKENS), min(len(original_norm), anchor + NEARBY_TOKENS)
                if wanted <= set(original_norm[low:high]):
                    rearranged = True
                    for position in range(low, high):
                        if original_norm[position] in wanted:
                            covered[position] = True
                    break

        if rearranged or similarity >= UNCHANGED_AT or (similarity >= MODIFIED_AT and tailored_norm == original_norm[start:end]):
            counts["unchanged"] += 1
            continue

        # Compare reworded prose with the whole original bullet or paragraph, not just
        # the stretch that happens to match, so the original shown (and restored by
        # "revert") is complete rather than a fragment.
        if similarity >= WIDEN_FROM and unit["kind"] not in LAYOUT_KINDS:
            low, high = _whole_passage(start, end, passage_starts)
            if (low, high) != (start, end) and high - low <= max(2 * len(tailored_norm), len(tailored_norm) + 15):
                matcher = SequenceMatcher(None, original_norm[low:high], tailored_norm, autojunk=False)
                widened = 2 * sum(block.size for block in matcher.get_matching_blocks()) / (len(tailored_norm) + high - low)
                if widened >= MODIFIED_AT:
                    similarity, start, end = widened, low, high
                    for position in range(start, end):
                        covered[position] = True

        new_terms = _new_terms(tailored_display, original_vocabulary)
        item = {
            "line": unit["line"],
            "raw": unit["raw"],
            "kind": unit["kind"],
            "section": unit["section"],
            "tailored": unit["text"],
            "similarity": round(similarity, 2),
            "new_terms": new_terms,
        }
        if similarity >= MODIFIED_AT:
            item["type"] = "modified"
            item["original"] = " ".join(original_display[start:end])
            item["diff"] = _word_diff(original_display[start:end], original_norm[start:end], tailored_display, tailored_norm)
        else:
            item["type"] = "added"
            item["original"] = ""
            item["diff"] = [{"op": "added", "text": unit["text"]}]
        counts[item["type"]] += 1
        counts["flagged"] += bool(new_terms)
        items.append(item)

    # Stretches of the original that no tailored line accounts for were dropped.
    run: list[int] = []
    for position in range(len(original_norm) + 1):
        if position < len(original_norm) and not covered[position]:
            run.append(position)
            continue
        if len(run) >= MIN_REMOVED_TOKENS:
            text = " ".join(original_display[run[0]:run[-1] + 1])
            if len([token for token in original_norm[run[0]:run[-1] + 1] if token not in STOPWORDS]) >= 3:
                items.append({"type": "removed", "line": None, "raw": "", "kind": "text", "section": "", "tailored": "", "original": text, "diff": [{"op": "removed", "text": text}], "new_terms": [], "similarity": 0})
                counts["removed"] += 1
        run = []

    return {
        "summary": {key: counts.get(key, 0) for key in ("unchanged", "modified", "added", "removed", "flagged")},
        "items": items,
    }
