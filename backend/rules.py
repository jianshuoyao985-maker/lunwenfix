"""Validated formatting rules and an offline, scope-aware Chinese conversation parser."""
import copy
import math
import re
import unicodedata

LABELS = {"body": "正文", "heading1": "一级标题", "heading2": "二级标题",
          "heading3": "三级标题", "abstract": "摘要正文", "reference": "参考文献",
          "caption": "图表题注", "keyword": "关键词", "table": "表格文字"}
SIZES = {"小初号": 36, "初号": 42, "小一号": 24, "小二号": 18, "小三号": 15,
         "小四号": 12, "小五号": 9, "小六号": 6.5, "一号": 26, "二号": 22,
         "三号": 16, "四号": 14, "五号": 10.5, "六号": 7.5, "七号": 5.5, "八号": 5,
         "小初": 36, "小一": 24, "小二": 18, "小三": 15, "小四": 12, "小五": 9, "小六": 6.5}
FONT_RE = r"Times\s+New\s+Roman|Arial|Calibri|Cambria|仿宋_GB2312|楷体_GB2312|方正小标宋(?:简体)?|微软雅黑|思源宋体|思源黑体|宋体|黑体|仿宋|楷体|等线"
NUMBER = r"(?:\d+(?:\.\d+)?|[零一二两三四五六七八九十])"
TARGETS = {"一级标题": ["heading1"], "章标题": ["heading1"], "二级标题": ["heading2"],
           "三级标题": ["heading3"], "各级标题": ["heading1", "heading2", "heading3"],
           "标题": ["heading1", "heading2", "heading3"], "摘要正文": ["abstract"],
           "摘要": ["abstract"], "参考文献": ["reference"], "文献": ["reference"],
           "图表题注": ["caption"], "图题": ["caption"], "表题": ["caption"], "题注": ["caption"],
           "关键词": ["keyword"], "关键字": ["keyword"], "表格文字": ["table"], "表格": ["table"],
           "正文": ["body"], "全文": list(LABELS), "所有文字": list(LABELS), "页面": ["page"],
           "页边距": ["page"], "页眉": ["unsupported"], "页脚": ["unsupported"], "页码": ["unsupported"],
           "目录": ["unsupported"], "封面": ["unsupported"], "公式": ["unsupported"]}
TARGETS.update({"摘要标题": ["unsupported"], "参考文献标题": ["unsupported"], "论文题目": ["unsupported"], "小标题": ["unsupported"]})
TARGET_RE = re.compile("|".join(sorted(TARGETS, key=len, reverse=True)))


def defaults():
    base = dict(font="宋体", latin_font="Times New Roman", size=12, align="both", bold=None,
                line={"mode": "multiple", "value": 1.5}, first_line=2,
                space_before=0, space_after=0, enabled=True)
    sections = {k: copy.deepcopy(base) for k in LABELS}
    for level, size in [(1, 16), (2, 14), (3, 12)]:
        sections[f"heading{level}"].update(font="黑体", size=size, bold=True,
            align="center" if level == 1 else "left", first_line=0,
            space_before=12 if level == 1 else 6, space_after=6,
            line={"mode": "multiple", "value": 1.5})
    for k in ("reference", "caption", "table"):
        sections[k].update(size=10.5, first_line=0, line={"mode": "multiple", "value": 1})
    sections["reference"]["align"] = "left"
    sections["caption"]["align"] = "center"
    sections["table"].update(enabled=False, align="left")
    sections["keyword"].update(first_line=0, align="left")
    return {"sections": sections, "page": {"paper": "keep", "top_cm": 2.54,
            "bottom_cm": 2.54, "left_cm": 3.17, "right_cm": 3.17}}


def number(value):
    return float({"零": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5,
                  "六": 6, "七": 7, "八": 8, "九": 9, "十": 10}.get(value, value))


def bounded(value, low, high, name):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{name}必须是有效数字。")
    if not low <= value <= high:
        raise ValueError(f"{name}应在 {low}–{high} 之间。")
    return value


def validate_rules(data):
    if not isinstance(data, dict) or set(data) != {"sections", "page"}:
        raise ValueError("格式配置无效，请刷新网页后重新描述要求。")
    if not isinstance(data["sections"], dict) or set(data["sections"]) != set(LABELS):
        raise ValueError("格式配置缺少段落类型。")
    template = defaults()
    for scope, style in data["sections"].items():
        if not isinstance(style, dict) or set(style) != set(template["sections"][scope]):
            raise ValueError("段落格式配置无效。")
        for key in ("font", "latin_font"):
            if not isinstance(style[key], str) or not 1 <= len(style[key]) <= 64 or re.search(r"[<>\x00-\x1f]", style[key]):
                raise ValueError("字体名称无效。")
        for key, low, high in (("size", 5, 72), ("first_line", 0, 10),
                              ("space_before", 0, 100), ("space_after", 0, 100)):
            bounded(style[key], low, high, key)
        if style["align"] not in {"left", "center", "right", "both"}:
            raise ValueError("对齐方式无效。")
        if style["bold"] is not None and type(style["bold"]) is not bool:
            raise ValueError("加粗设置无效。")
        if type(style["enabled"]) is not bool:
            raise ValueError("段落启用设置无效。")
        line = style["line"]
        if not isinstance(line, dict) or set(line) != {"mode", "value"} or line["mode"] not in {"multiple", "exact", "atLeast"}:
            raise ValueError("行距配置无效。")
        bounded(line["value"], 0.5 if line["mode"] == "multiple" else 5,
                5 if line["mode"] == "multiple" else 100, "行距")
    page = data["page"]
    if not isinstance(page, dict) or set(page) != set(template["page"]):
        raise ValueError("页面配置无效。")
    if page["paper"] not in {"keep", "A4"}:
        raise ValueError("纸张配置无效。")
    for key in ("top_cm", "bottom_cm", "left_cm", "right_cm"):
        if page[key] is not None:
            bounded(page[key], 0.5, 6, "页边距")
    return copy.deepcopy(data)


def parse_properties(text):
    """Return patch and understood status; do not interpret unsupported instructions as facts."""
    patch = {}
    if re.search(r"保持(?:原样|不变)|保留原(?:有)?格式|不(?:要)?(?:修改|改动|更改)", text):
        return {"enabled": False}
    # Exclude rejected alternatives before recognizing the replacement.
    text = re.sub(rf"(?:不要|不用|别用|取消)(?:使用|用)?(?:\s*)(?:{FONT_RE})", "", text, flags=re.I)
    text = re.sub(r"(?:不要|不用|取消)(?:左对齐|右对齐|居中|两端对齐)", "", text)
    fonts = list(re.finditer(FONT_RE, text, re.I))
    for font in fonts:
        value = font.group()
        value = "Times New Roman" if re.match(r"Times", value, re.I) else value
        prefix = text[max(0, font.start()-14):font.start()]
        is_latin = re.search(r"英文|西文|字母|数字", prefix) or re.match(r"Times|Arial|Calibri|Cambria", value, re.I)
        patch["latin_font" if is_latin else "font"] = value
    size_matches = list(re.finditer("|".join(sorted(SIZES, key=len, reverse=True)), text))
    if size_matches:
        patch["size"] = SIZES[size_matches[-1].group()]
    # Explicit numeric font sizes never consume line spacing or paragraph spacing.
    m = re.search(r"(?:字号|字大小|字体大小)(?:为|用|设为|改成|改为|是|[:：\s])*([\d.]+)\s*(?:pt|磅)?", text, re.I)
    if m:
        patch["size"] = float(m.group(1))
    elif not re.search(r"行距|固定|段前|段后|边距", text):
        m = re.search(r"(\d+(?:\.\d+)?)\s*(?:pt|磅)", text, re.I)
        if m:
            patch["size"] = float(m.group(1))
    if re.search(r"不(?:要)?加粗|取消加粗|不加黑", text):
        patch["bold"] = False
    elif re.search(r"加粗|加黑", text):
        patch["bold"] = True
    for words, val in ((r"两端对齐|两边对齐", "both"), (r"居中|中间对齐", "center"),
                       (r"左对齐|靠左|左边对齐", "left"), (r"右对齐|靠右", "right")):
        if re.search(words, text):
            patch["align"] = val
    if re.search(r"不(?:要)?(?:首行)?缩进|取消(?:首行)?缩进|顶格", text):
        patch["first_line"] = 0
    else:
        m = re.search(rf"(?:首行(?:缩进|空)?|缩进)[^\d零一二两三四五六七八九十]{{0,8}}({NUMBER})\s*(?:个)?(?:汉字|字|字符|格)", text)
        if m:
            patch["first_line"] = number(m.group(1))
    m = re.search(r"(?:固定(?:值)?(?:行距)?|行距)[^\d,;。]{0,10}(\d+(?:\.\d+)?)\s*(?:磅|pt)", text, re.I)
    if m:
        patch["line"] = {"mode": "atLeast" if "最小" in text else "exact", "value": float(m.group(1))}
    elif re.search(r"单倍", text):
        patch["line"] = {"mode": "multiple", "value": 1}
    elif re.search(r"一倍半", text):
        patch["line"] = {"mode": "multiple", "value": 1.5}
    else:
        m = re.search(rf"({NUMBER})\s*倍(?:行距)?", text)
        if m:
            patch["line"] = {"mode": "multiple", "value": number(m.group(1))}
    for key, term in (("space_before", "段前"), ("space_after", "段后")):
        m = re.search(term + r"[^\d,;。]{0,6}(\d+(?:\.\d+)?)\s*(?:磅|pt)", text, re.I)
        if m:
            patch[key] = float(m.group(1))
    if patch:
        patch["enabled"] = True
    return patch


def parse_page(text):
    patch = {}
    if re.search(r"A4", text, re.I):
        patch["paper"] = "A4"
    if re.search(r"(?:页边距|页面).*保持(?:原样|不变)", text):
        return {"paper": "keep", "top_cm": None, "bottom_cm": None, "left_cm": None, "right_cm": None}
    units = r"(\d+(?:\.\d+)?)\s*(厘米|公分|cm|毫米|mm|英寸|inch)"
    m = re.search(r"(?:页边距|四周|四边|边距)(?:全部|统一|都|均|为|是|设为|改为|改成|[:：\s])*" + units, text, re.I)
    def cm(match):
        return float(match.group(1)) * (0.1 if match.group(2).lower() in {"mm", "毫米"} else 2.54 if match.group(2).lower() in {"inch", "英寸"} else 1)
    if m:
        patch.update({key: cm(m) for key in ("top_cm", "bottom_cm", "left_cm", "right_cm")})
    for words, keys in (("上下", ["top_cm", "bottom_cm"]), ("左右", ["left_cm", "right_cm"]),
                        ("上", ["top_cm"]), ("下", ["bottom_cm"]), ("左", ["left_cm"]), ("右", ["right_cm"])):
        m = re.search(words + r"(?:侧|边距|边)?(?:各|分别|都是|均为|为|是|改为|改成|设为|[:：\s])*" + units, text, re.I)
        if m:
            patch.update({key: cm(m) for key in keys})
    return patch


def describe(style):
    if not style["enabled"]:
        return "保留原格式"
    line = style["line"]
    spacing = f'{line["value"]:g} 倍行距' if line["mode"] == "multiple" else f'{"固定" if line["mode"] == "exact" else "最小"} {line["value"]:g} 磅'
    align = {"left": "左对齐", "center": "居中", "right": "右对齐", "both": "两端对齐"}[style["align"]]
    bold = "，加粗" if style["bold"] else "，不加粗" if style["bold"] is False else ""
    return f'{style["font"]} / 西文 {style["latin_font"]}，{style["size"]:g} 磅，{spacing}，{align}，首行 {style["first_line"]:g} 字，段前 {style["space_before"]:g} / 段后 {style["space_after"]:g} 磅{bold}'


def summary(rules):
    rows = [{"scope": k, "label": label, "value": describe(rules["sections"][k])} for k, label in LABELS.items()]
    p = rules["page"]
    margins = " / ".join(f'{label} {p[key]:g} cm' if p[key] is not None else f'{label}保留' for key, label in (("top_cm", "上"), ("bottom_cm", "下"), ("left_cm", "左"), ("right_cm", "右")))
    rows.append({"scope": "page", "label": "页面", "value": ("保留纸张尺寸；" if p["paper"] == "keep" else "A4；") + margins})
    return rows


def parse_message(message, rules=None, context=None):
    if not isinstance(message, str) or not message.strip() or len(message) > 6000:
        raise ValueError("请填写 1–6000 字的格式要求。")
    previous = validate_rules(rules) if rules is not None else defaults()
    result = copy.deepcopy(previous)
    text = unicodedata.normalize("NFKC", message).strip()
    # Human-friendly aliases and Chinese punctuation, without splitting decimal numbers.
    text = re.sub(r"第?([123一二三])级标题", lambda m: {"1": "一", "2": "二", "3": "三"}.get(m[1], m[1])+"级标题", text)
    text = text.replace("一、二、三级标题", "各级标题").replace("一二三级标题", "各级标题")
    text = re.sub(r"([一二三])级(?=[和与及、][一二三]级标题)", r"\1级标题", text)
    text = re.sub(r"([一二三])(?=[、和与及][一二三]级标题)", r"\1级标题", text)
    page_patch = parse_page(text)
    result["page"].update(page_patch)
    warnings, touched = [], set()
    if page_patch:
        touched.add("page")
    scopes = context if isinstance(context, list) and context and all(k in LABELS for k in context) else ["body"]
    # Fresh unqualified instructions address body; explicit pronouns continue the last scope.
    if not re.search(r"它|这个|刚才|上面|再|改成|改为", text):
        scopes = ["body"]
    pending = []
    for clause in re.split(r"[,;；。\n]+", text):
        if not clause.strip():
            continue
        if re.fullmatch(r"\s*(?:其他|其它|其余).*(?:不变|原样|不动)\s*", clause):
            continue
        matches = list(TARGET_RE.finditer(clause))
        segments = []
        if not matches:
            segments.append((None, clause))
        else:
            if matches[0].start():
                prefix = clause[:matches[0].start()]
                if parse_properties(prefix):
                    segments.append((None, prefix))
            for i, match in enumerate(matches):
                segments.append((TARGETS[match.group()], clause[match.end():matches[i+1].start() if i+1 < len(matches) else len(clause)]))
        for target, content in segments:
            if target is not None:
                scopes = target
            if scopes == ["unsupported"]:
                warnings.append(f'暂未自动处理「{clause.strip()}」。页眉、页码、目录、封面及公式布局请在 Word 中核对。')
                continue
            if scopes == ["page"]:
                if not page_patch:
                    warnings.append(f'没有识别「{clause.strip()}」的页面数值，可写“页边距上下 2.5 cm、左右 3 cm”。')
                continue
            props = parse_properties(content)
            if not props:
                if target and re.fullmatch(r"\s*(?:和|与|及|、|都)?\s*", content):
                    pending.extend(scopes)
                elif not parse_page(clause) and not re.fullmatch(r"\s*(?:其他|其它)?(?:保持不变|不变|谢谢|就这样|请|麻烦)?\s*", content):
                    warnings.append(f'尚未明确「{clause.strip()}」，请补充字体、字号、行距等具体要求。')
                continue
            active = list(dict.fromkeys(pending + scopes))
            pending = []
            for scope in active:
                result["sections"][scope].update(props)
                touched.add(scope)
            # Surface unsupported fragments even when another part of the sentence was parsed.
            if re.search(r"三线表|悬挂|斜体|颜色|红色|蓝色|下划线|分栏|横向|分页|大一点|小一点|GB.?T|7714", content, re.I):
                warnings.append(f'「{clause.strip()}」中仅应用已列出的格式；三线表、悬挂缩进、颜色、分页或引文规范等要求尚需人工处理。')
    result = validate_rules(result)
    changes = [row for row in summary(result) if row["scope"] in touched]
    warnings = list(dict.fromkeys(warnings))
    reply = "已更新以下格式。你可以继续补充，也可以说“再把正文行距改成固定 20 磅”。" if changes else "这句话暂时没有生成明确的格式修改。可以直接粘贴学校的具体要求，或说“正文宋体小四，1.5 倍行距”。"
    return {"rules": result, "context": scopes if all(k in LABELS for k in scopes) else ["body"],
            "changes": changes, "warnings": warnings, "reply": reply, "engine": "local", "summary": summary(result)}
