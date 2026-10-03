#!/usr/bin/env python3
"""Build the de-duplicated, filler-removed transcript appendix for notes.tex.

Input:  audio.srt  (de-overlapped YouTube auto-subs)
Output: transcript_clean.srt + transcript_appendix.tex (body fragment)

Pipeline:
 1. per-cue cleaning: drop events / fillers / stutters, repair ASR errors
 2. dedupe identical adjacent cues, sentence-split
 3. regroup into paragraphs (<=4 sentences / 85 words)
 4. rebuild casing: lowercase everything, re-cap sentence starts and
    preserve auto/manual proper nouns (>=85% capitalized occurrences)
 5. assign paragraphs to time-keyed sections with Chinese headings
 6. emit SRT + LaTeX-safe fragment (\transcriptsec / \transcriptitem)
"""
import re
import sys

SRC, DST_SRT, DST_TEX = sys.argv[1], sys.argv[2], sys.argv[3]

SECTIONS = [
    (0,    "00:00:31 开场新闻剪辑（视频蒙太奇，自动字幕听写）"),
    (74,   "00:01:14 开幕致辞：Black Hat 总裁 Susie Pallett"),
    (273,  "00:04:33 Jeff Moss（Black Hat 创始人、DEF CON 主席）介绍演讲者"),
    (553,  "00:09:13 主题演讲（一）：研究者画像与研究团队"),
    (706,  "00:11:46 主题演讲（二）：Agentic 时代不等于 LLM 时代"),
    (850,  "00:14:10 主题演讲（三）：自主发现漏洞的三种方式 与「饼干模子」类比"),
    (1386, "00:23:06 主题演讲（四）：核心论点 —— 漏洞属性（Vulnerability Properties）"),
    (1440, "00:24:00 主题演讲（五）：案例研究 —— 华为 OpenHarmony"),
    (1616, "00:26:56 主题演讲（六）：与 Mythos 对比 —— Linux 内核漏洞挖掘实验"),
    (1860, "00:31:00 主题演讲（七）：漏洞数量失控与负责任披露的困境"),
    (2068, "00:34:28 主题演讲（八）：全部用 Rust 重写 为什么不能解决问题"),
    (2293, "00:38:13 主题演讲（九）：模型开放、人类学习与自主「锐化」流水线"),
    (2610, "00:43:30 会务通知与收尾"),
]

REPAIRS = [
    (r"\bAngry\b", "angr"),
    (r"\banger\b", "angr"),
    (r"\bAnger\b", "angr"),
    (r"\bAngular\b", "angr"),
    (r"\bthe Angular\b", "angr"),
    (r"\bShellfish\b", "Shellphish"),
    (r"\bYan Shisho Tash\b", "Yan Shoshitaishvili"),
    (r"\bYan Shisho\b", "Yan Shoshitaishvili"),
    (r"\bJ\. Varias\b", "Jay Vadayath"),
    (r"\bJ Varias\b", "Jay Vadayath"),
    (r"\bHong Kai Chen\b", "Hongkai Chen"),
    (r"\bHankai\b", "Hongkai"),
    (r"\bJun Tay\b", "Hui Jun Tay"),
    (r"\bWill Gibbs\b", "Wil Gibbs"),
    (r"\bopen Harmony OS\b", "OpenHarmony"),
    (r"\bopen Harmony\b", "OpenHarmony"),
    (r"\bOpen Harmony\b", "OpenHarmony"),
    (r"\bHarmony OS\b", "HarmonyOS"),
    (r"\bmultimodal framing fuzzwork\b", "multi-instrument binary analysis framework"),
    (r"\bchat\s*GPT\b", "ChatGPT"),
    (r"\bGB[TD]\b", "GPT"),
    (r"\bGPD\b", "GPT"),
    (r"\bmythos\b", "Mythos"),
    (r"\bmethos\b", "Mythos"),
    (r"\bSusie Pallet\b", "Susie Pallett"),
    (r"\bAICC\b", "AIxCC"),
    (r"\bartificial booth\b", "Artiphishell booth"),
    (r"\bpwn college\b", "pwn.college"),
    (r"\bEllen would do\b", "the LLM would do"),
    (r"\bEllen\b(?= would do)", "the LLM"),
    (r"\bcapture the flag CTF\b", "Capture the Flag (CTF)"),
    (r"\b3 GPTs in a trench code\b", "3 GPTs in a trench coat"),
    (r"\bDefcon\b", "DEF CON"),
    (r"\bAI Cyber challenge\b", "AI Cyber Challenge"),
    (r"\bassurance blah blah blah\b", "a verification pipeline and so on"),
    (r"\bI warning tonight\b", "We are warning tonight"),
    (r"\bcyber reasoning system\b", "Cyber Reasoning System"),
    (r"\bcyber grand challenge\b", "Cyber Grand Challenge"),
]

# word-boundary, case-insensitive filler phrases -> removed as phrases only
FILLER_PHRASES = [
    r"\byou know\b", r"\bi mean\b", r"\bi guess\b", r"\bkind of\b",
    r"\bsort of\b", r"\bfor the record\b", r"\byou know what\b",
    r"\bor whatever\b", r"\band so on and so forth\b",
]
# standalone dis fluency tokens
FILLER_TOKENS = {"um", "uh", "er", "ah", "hmm", "umm", "uhh", "mm", "hm", "nah"}

EVENT_RE = re.compile(r"\[[^\]]*\]")
REP_RE = re.compile(r"\b(\w+)(\s+\1\b){1,}", flags=re.IGNORECASE)

# manual proper-noun set (survives global lowercase pass)
PROPER_MANUAL = {
    "i", "black", "hat", "jeff", "moss", "yan", "susie", "pallett",
    "def", "con", "ctf", "arsenal", "las", "vegas", "russia", "kgb",
    "america", "linux", "ubuntu", "openharmony", "harmonyos", "huawei",
    "android", "apple", "chatgpt", "gpt", "gpts", "mythos", "anthropic",
    "openai", "codex", "washington", "post", "arizona", "state",
    "university", "order", "overflow", "shellphish", "angr", "afl",
    "rust", "darwin", "darp", "aicorn", "aixcc", "artiphishell",
    "bluetooth", "cve", "cves", "lib", "ssl", "png", "xml", "libssl",
    "libpng", "libxml", "windows", "firefox", "safari", "chrome", "clair",
    "sasha", "tuesday", "thursday", "wednesday", "monday", "friday",
    "saturday", "sunday", "ai", "ml", "llm", "llms", "gb", "taylor",
    "vietnamese", "linux.org", "github", "twitter", "apache",
    "american", "european", "china", "chinese", "russian", "kyiv",
    "security", "commerce", "eric", "schmidt", "yoshita", "sasha",
    "google", "microsoft", "meta", "amazon", "nvidia", "tesla",
    "x86", "arm", "iphone", "androids", "order of the overflow",
    "vasil", "hongkai", "jay", "vadayath", "hui", "tay", "wil", "gibbs",
    "shoshitaishvili", "adam", "doupe", "ruoyu", "fish", "wang", "tiffany",
    "bao", "pwn", "college", "kyle", "bot", "syzbot", "openai's", "codex",
    "pallett", "chen", "order", "overflow", "hongkai", "vadayath",
    "hui", "tay", "wil", "gibbs", "codex", "gpt-4o", "gpt-4",
    "apple's", "huawei's", "openharmony's",
    "us", "u.s.", "gpt-4", "gpt-4.5", "vibecoded", "wtf", "https",
    "dr", "professor", "phd", "bsides", "defcon", "blackhat",
}


def parse_srt(path):
    entries = []
    for block in re.split(r"\n\s*\n", open(path, encoding="utf-8").read().strip()):
        lines = [l for l in block.split("\n") if l.strip()]
        if len(lines) < 2:
            continue
        m = re.match(
            r"(\d+):(\d+):(\d+)[,\.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,\.](\d+)",
            lines[1].strip())
        if not m:
            continue
        g = list(map(int, m.groups()))
        s = g[0]*3600 + g[1]*60 + g[2] + g[3]/1000.0
        e = g[4]*3600 + g[5]*60 + g[6] + g[7]/1000.0
        text = " ".join(l.strip() for l in lines[2:])
        text = re.sub(r"\s+", " ", text).strip()
        entries.append({"start": s, "end": e, "text": text})
    return entries


def clean_cue(t):
    t = t.strip()
    t = EVENT_RE.sub("", t)
    t = t.replace(">>", "")
    for pat, rep in REPAIRS:
        t = re.sub(pat, rep, t, flags=re.IGNORECASE if pat.islower() else 0)
    low = t.lower()
    for ph in FILLER_PHRASES:
        low = re.sub(ph, " ", low, flags=re.IGNORECASE)
    words = t.split()
    loww = low.split()
    if len(words) != len(loww):  # safety: phrase removal changed token count
        # rebuild by regex on original with case-insensitive phrase map
        for ph in FILLER_PHRASES:
            t = re.sub(ph, " ", t, flags=re.IGNORECASE)
        words, loww = t.split(), t.lower().split()
    out = []
    for w, lw in zip(words, loww):
        if lw.strip(".,!?;:\"'—–") in FILLER_TOKENS:
            continue
        out.append(w)
    t = " ".join(out)

    # partial-echo run: tokens that are all prefixes of the final complete word
    words = t.split()
    kept = []
    i = 0
    while i < len(words):
        j = i + 1
        while j < len(words) and words[j].isalpha() and words[i].isalpha() \
                and len(words[j]) >= 3 and words[i].lower().startswith(words[j].lower()) \
                and words[j].lower() != words[i].lower():
            j += 1
        if j > i + 1:  # dropped partial echoes words[i+1..j-1]
            kept.append(words[i])
            i = j
            continue
        # single token that is a prefix of the NEXT token (echo of a longer word)
        nxt = words[i+1] if i + 1 < len(words) else None
        if nxt and nxt.isalpha() and words[i].isalpha() and len(words[i]) >= 4 \
                and nxt.lower().startswith(words[i].lower()) \
                and nxt.lower() != words[i].lower():
            i += 1  # drop partial echo
            continue
        kept.append(words[i])
        i += 1
    t = " ".join(kept)

    # exact token repeats
    prev = None
    for _ in range(4):
        t = REP_RE.sub(lambda m: m.group(1), t)
        if t == prev:
            break
        prev = t

    t = re.sub(r"\s+([,\.!?;:])", r"\1", t)
    t = re.sub(r"\"", "'", t)
    t = re.sub(r"\s{2,}", " ", t)
    t = t.strip(" ,.;:—-")
    return t


def ts(sec):
    h = int(sec // 3600)
    m = int((sec % 3600) // 60)
    s = int(sec % 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def esc(t):
    t = t.replace("\\", "")
    t = re.sub(r"(?<!\\)([%&$#_{}~^])", lambda m: "\\" + m.group(1), t)
    return t


def rebuild_case(paras):
    # stats
    stats = {}
    for p in paras:
        for w in p["text"].split():
            bare = w.strip(".,!?;:\"'“”")
            if not bare or not bare.isalpha():
                continue
            key = bare.lower()
            if bare[0].isupper():
                stats[key] = stats.get(key, [0, 0])
                stats[key][0] += 1
            else:
                stats[key] = stats.get(key, [0, 0])
                stats[key][1] += 1
    proper = set(PROPER_MANUAL)
    for key, (cap, low) in stats.items():
        if cap + low >= 2 and cap >= 0.85 * (cap + low):
            proper.add(key)

    LOWERCASE_BRANDS = {"angr", "pwn.college"}

    def fix_token(w):
        bare = w.strip(".,!?;:\"'“”")
        tail = w[len(bare):]
        if not bare:
            return w
        if bare.isupper() and len(bare) > 1:
            return bare + tail
        key = bare.lower()
        # possessive: Huawei's / angr's
        if key.endswith("'s"):
            stem = key[:-2]
            if stem in LOWERCASE_BRANDS:
                return stem + "'s" + tail
            if stem in proper:
                return stem[0].upper() + stem[1:] + "'s" + tail
            return key + tail
        if key in LOWERCASE_BRANDS:
            return key + tail
        if key in proper:
            if key in stats and stats[key][0] > 0:
                # most common capitalized form
                return bare[0].upper() + bare[1:] + tail
            return key[0].upper() + key[1:] + tail
        return key + tail

    for p in paras:
        words = p["text"].split()
        out = []
        cap_next = True
        for w in words:
            fw = fix_token(w)
            if cap_next and fw:
                fw = fw[0].upper() + fw[1:]
            out.append(fw)
            stripped = fw.strip("'\"”")
            cap_next = stripped.endswith((".", "!", "?"))
        # keep "I" capital
        p["text"] = " ".join(out)
    return paras


def main():
    entries = parse_srt(SRC)
    clean = []
    for e in entries:
        c = clean_cue(e["text"])
        if not c:
            continue
        if clean and c == clean[-1]["text"]:
            clean[-1]["end"] = max(clean[-1]["end"], e["end"])
            continue
        clean.append({"start": e["start"], "end": e["end"], "text": c})

    sents = []
    for c in clean:
        for s in re.split(r"(?<=[\.!?])\s+", c["text"]):
            s = s.strip()
            if s:
                sents.append({"start": c["start"], "end": c["end"], "text": s})

    paras, cur = [], []
    for s in sents:
        if cur and (len(cur) >= 4 or sum(len(x["text"].split()) for x in cur) >= 85):
            paras.append(cur)
            cur = []
        cur.append(s)
    if cur:
        paras.append(cur)
    paras = [{"start": p[0]["start"], "end": p[-1]["end"],
              "text": " ".join(x["text"] for x in p)} for p in paras]

    paras = rebuild_case(paras)

    # second pass on assembled paragraphs: kill cross-cue token echoes
    for p in paras:
        t = REP_RE.sub(lambda m: m.group(1), p["text"])
        t = re.sub(r"\s{2,}", " ", t).strip()
        p["text"] = t

    # clamp overlapping ends for a monotone SRT
    for i, p in enumerate(paras[:-1]):
        if paras[i+1]["start"] < p["end"]:
            p["end"] = max(p["start"], paras[i+1]["start"])

    def section_for(sec):
        name = None
        for t0, label in SECTIONS:
            if sec + 1.5 >= t0:
                name = label
        return name

    with open(DST_SRT, "w", encoding="utf-8") as f:
        for i, p in enumerate(paras, 1):
            f.write(f"{i}\n{ts(p['start'])},000 --> {ts(p['end'])},000\n"
                    f"{p['text']}\n\n")

    with open(DST_TEX, "w", encoding="utf-8") as f:
        last = None
        for p in paras:
            sec = section_for(p["start"])
            if sec != last:
                f.write(f"\\transcriptsec{{{esc(sec)}}}\n")
                last = sec
            f.write(f"\\transcriptitem{{{ts(p['start'])}}}{{{esc(p['text'])}}}\n")

    w_in = sum(len(e["text"].split()) for e in entries)
    w_out = sum(len(p["text"].split()) for p in paras)
    print(f"in_entries={len(entries)} paragraphs={len(paras)}")
    print(f"words {w_in} -> {w_out} ({100*w_out/max(w_in,1):.1f}%)")


if __name__ == "__main__":
    main()
