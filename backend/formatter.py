"""Conservative OOXML editing: keep every package part except document.xml byte-for-byte."""
import copy
import hashlib
import json
import re
import zipfile
from collections import Counter

from lxml import etree as ET

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": W, "m": "http://schemas.openxmlformats.org/officeDocument/2006/math"}


def qn(name):
    return f"{{{W}}}{name}"


ORDER = {
    "pPr": "pStyle keepNext keepLines pageBreakBefore framePr widowControl numPr suppressLineNumbers pBdr shd tabs suppressAutoHyphens kinsoku wordWrap overflowPunct topLinePunct autoSpaceDE autoSpaceDN bidi adjustRightInd snapToGrid spacing ind contextualSpacing mirrorIndents suppressOverlap jc textDirection textAlignment textboxTightWrap outlineLvl divId cnfStyle rPr sectPr pPrChange".split(),
    "rPr": "rStyle rFonts b bCs i iCs caps smallCaps strike dstrike outline shadow emboss imprint noProof snapToGrid vanish webHidden color spacing w kern position sz szCs highlight u effect bdr shd fitText vertAlign rtl cs em lang eastAsianLayout specVanish oMath rPrChange".split(),
    "sectPr": "headerReference footerReference footnotePr endnotePr type pgSz pgMar paperSrc pgBorders lnNumType pgNumType cols formProt vAlign noEndnote titlePg textDirection bidi rtlGutter docGrid printerSettings sectPrChange".split(),
}


def child(parent, tag):
    item = parent.find(qn(tag))
    if item is not None:
        return item
    item = ET.Element(qn(tag))
    if tag in {"pPr", "rPr"} and ET.QName(parent).localname in {"p", "r"}:
        parent.insert(0, item)
    else:
        order = ORDER.get(ET.QName(parent).localname, [])
        rank = order.index(tag) if tag in order else len(order)
        for i, sibling in enumerate(parent):
            name = ET.QName(sibling).localname
            if name in order and order.index(name) > rank:
                parent.insert(i, item)
                break
        else:
            parent.append(item)
    return item


def set_values(element, **values):
    for key, value in values.items():
        element.set(qn(key), str(value))


def xml(data):
    if b"<!DOCTYPE" in data or b"<!ENTITY" in data:
        raise ValueError("不支持含自定义 XML 实体的文档。")
    try:
        return ET.fromstring(data, ET.XMLParser(resolve_entities=False, no_network=True, remove_blank_text=False))
    except ET.XMLSyntaxError as exc:
        raise ValueError("Word 文档结构损坏，建议用 Word 另存为 .docx 后重试。") from exc


def check_package(archive):
    infos = archive.infolist()
    names = [i.filename for i in infos]
    if len(infos) > 5000 or len(set(names)) != len(names) or sum(i.file_size for i in infos) > 180 * 1024 * 1024:
        raise ValueError("文档解压后过大或结构异常，请压缩论文中的图片后重试。")
    if any(i.flag_bits & 1 for i in infos):
        raise ValueError("请先移除 Word 文件密码。")
    if "word/document.xml" not in names or "[Content_Types].xml" not in names:
        raise ValueError("这不是有效的 .docx 文件。")
    if any("vbaproject" in name.lower() for name in names):
        raise ValueError("请将含宏的文件另存为不含宏的 .docx 后上传。")


def content_fingerprint(root):
    """Ignore only formatting properties; preserve text, fields, math and drawing structure."""
    clone = copy.deepcopy(root)
    for node in clone.xpath(".//w:rPr | .//w:pPr", namespaces=NS):
        # pPr may contain a section boundary, which must remain in the content check.
        if node.tag == qn("pPr"):
            sect = node.find(qn("sectPr"))
            if sect is not None:
                node.getparent().insert(node.getparent().index(node), copy.deepcopy(sect))
        node.getparent().remove(node)
    for sect in clone.findall(".//w:sectPr", NS):
        for prop in list(sect):
            if prop.tag in {qn("pgSz"), qn("pgMar")}:
                sect.remove(prop)
    # Expanded names avoid false positives from namespace serialization changes.
    def tree(node):
        return [node.tag, sorted(node.attrib.items()), node.text, node.tail, [tree(c) for c in node if isinstance(c.tag, str)]]
    return hashlib.sha256(json.dumps(tree(clone), ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()


def paragraph_text(p):
    return "".join(t.text or "" for t in p.findall(".//w:t", NS) if next(t.iterancestors(qn("p")), None) is p).strip()


def style_index(archive):
    if "word/styles.xml" not in archive.namelist():
        return {}
    root = xml(archive.read("word/styles.xml"))
    styles = {}
    for s in root.findall("w:style", NS):
        name = s.find("w:name", NS)
        base = s.find("w:basedOn", NS)
        outline = s.find("w:pPr/w:outlineLvl", NS)
        styles[s.get(qn("styleId"))] = {
            "name": name.get(qn("val"), "") if name is not None else "",
            "base": base.get(qn("val")) if base is not None else None,
            "outline": outline.get(qn("val")) if outline is not None else None,
        }
    return styles


def style_kind(p, styles):
    outline = p.find("w:pPr/w:outlineLvl", NS)
    if outline is not None and outline.get(qn("val")) in {"0", "1", "2"}:
        return "heading" + str(int(outline.get(qn("val"))) + 1)
    value = p.find("w:pPr/w:pStyle", NS)
    sid = value.get(qn("val")) if value is not None else None
    visited = set()
    while sid and sid not in visited:
        visited.add(sid)
        info = styles.get(sid, {})
        name = info.get("name", sid)
        if re.search(r"^TOC|目录|table of contents", name, re.I):
            return "protected"
        if re.fullmatch(r"Title|Subtitle|标题|副标题", name, re.I):
            return "protected"
        match = re.search(r"(?:heading|标题)\s*([123])", name, re.I)
        if match:
            return "heading" + match.group(1)
        if info.get("outline") in {"0", "1", "2"}:
            return "heading" + str(int(info["outline"]) + 1)
        sid = info.get("base")
    return None


def classify(text, p, styles, region):
    kind = style_kind(p, styles)
    if kind == "protected":
        return kind, region
    compact = re.sub(r"\s+", "", text)
    if compact in {"摘要", "Abstract", "ABSTRACT", "中文摘要", "英文摘要"}:
        return "heading1", "abstract"
    if compact in {"参考文献", "References", "REFERENCES"}:
        return "heading1", "reference"
    if re.fullmatch(r"致谢|附录(?:[A-Z一二三四五0-9]*)|目录", compact):
        return "heading1" if compact != "目录" else "protected", "body"
    if re.match(r"^(?:关键词|关键字|Key\s*words)\s*[:：]", text, re.I):
        return "keyword", "body"
    if re.match(r"^\s*\[\d+\]", text) or region == "reference" and not kind:
        return "reference", region
    if kind:
        return kind, "body"
    if re.match(r"^[图表]\s*\d+", text) and len(text) < 140:
        return "caption", region
    if len(text) <= 70 and not re.search(r"[。！？；]", text):
        if re.match(r"^第[一二三四五六七八九十百0-9]+[章节]\s*\S", text) or re.match(r"^[一二三四五六七八九十]+[、．.]\s*\S", text):
            return "heading1", "body"
        # Require a boundary: 1.1 Method is a heading; 3.14 is data, 2026年 is text.
        match = re.match(r"^(\d{1,2}(?:[.．]\d{1,2}){0,2})(?:[、.]?\s+)(\S.+)$", text)
        if match and not re.match(r"[%％\d]", match.group(2)):
            return "heading" + str(match.group(1).count(".") + match.group(1).count("．") + 1), "body"
    return ("abstract" if region == "abstract" else "body"), region


def format_run(rpr, style):
    fonts = child(rpr, "rFonts")
    for key in ("asciiTheme", "hAnsiTheme", "eastAsiaTheme", "cstheme", "csTheme"):
        fonts.attrib.pop(qn(key), None)
    set_values(fonts, eastAsia=style["font"], ascii=style["latin_font"], hAnsi=style["latin_font"], cs=style["latin_font"])
    for tag in ("sz", "szCs"):
        set_values(child(rpr, tag), val=round(style["size"] * 2))
    if style["bold"] is not None:
        for tag in ("b", "bCs"):
            set_values(child(rpr, tag), val="1" if style["bold"] else "0")


def format_paragraph(p, style, heading=False):
    ppr = child(p, "pPr")
    set_values(child(ppr, "jc"), val=style["align"])
    set_values(child(ppr, "snapToGrid"), val="0")
    set_values(child(ppr, "contextualSpacing"), val="0")
    if heading:
        set_values(child(ppr, "keepNext"), val="1")
    spacing = child(ppr, "spacing")
    for key in ("beforeLines", "afterLines", "beforeAutospacing", "afterAutospacing"):
        spacing.attrib.pop(qn(key), None)
    line = style["line"]
    set_values(spacing, before=round(style["space_before"]*20), after=round(style["space_after"]*20),
               line=round(line["value"]*(240 if line["mode"] == "multiple" else 20)),
               lineRule="auto" if line["mode"] == "multiple" else line["mode"])
    ind = child(ppr, "ind")
    for key in ("firstLine", "hanging", "firstLineChars", "hangingChars"):
        ind.attrib.pop(qn(key), None)
    set_values(ind, firstLine=round(style["first_line"]*style["size"]*20), firstLineChars=round(style["first_line"]*100))
    format_run(child(ppr, "rPr"), style)
    for run in p.findall(".//w:r", NS):
        if next(run.iterancestors(qn("p")), None) is p:
            format_run(child(run, "rPr"), style)


def format_docx(src, dst, rules):
    counts, skipped = Counter(), Counter()
    try:
        with zipfile.ZipFile(src) as zin:
            check_package(zin)
            root = xml(zin.read("word/document.xml"))
            if root.tag != qn("document"):
                raise ValueError("暂不支持 Strict OOXML，请在 Word 中另存为普通 .docx。")
            before = content_fingerprint(root)
            styles = style_index(zin)
            body = root.find("w:body", NS)
            if body is None:
                raise ValueError("文档缺少正文。")
            region = "body"
            field_depth = 0
            for p in body.findall(".//w:p", NS):
                text = paragraph_text(p)
                field_nodes = p.findall(".//w:fldChar", NS)
                is_field = field_depth > 0 or bool(field_nodes) or bool(p.findall(".//w:fldSimple", NS))
                for f in field_nodes:
                    field_depth += 1 if f.get(qn("fldCharType")) == "begin" else -1 if f.get(qn("fldCharType")) == "end" else 0
                    field_depth = max(0, field_depth)
                if not text:
                    skipped["空段或纯图片段落"] += 1
                    continue
                if is_field or p.xpath(".//w:drawing | .//w:pict | .//m:oMath | .//m:oMathPara | .//w:ins | .//w:del", namespaces=NS) or any(a.tag == qn("txbxContent") for a in p.iterancestors()):
                    skipped["域、修订、公式或图形段落"] += 1
                    continue
                in_table = any(a.tag == qn("tc") for a in p.iterancestors())
                if in_table:
                    kind = "table"
                else:
                    kind, region = classify(text, p, styles, region)
                if kind == "protected":
                    skipped["目录或封面标题"] += 1
                    continue
                if kind == "body" and p.find("w:pPr/w:numPr", NS) is not None:
                    skipped["自动编号列表"] += 1
                    continue
                style = rules["sections"][kind]
                if not style["enabled"]:
                    skipped["保留原格式"] += 1
                    continue
                format_paragraph(p, style, kind.startswith("heading"))
                counts[kind] += 1
            for sect in root.findall(".//w:sectPr", NS):
                page = rules["page"]
                if any(page[k] is not None for k in ("top_cm", "bottom_cm", "left_cm", "right_cm")):
                    margins = child(sect, "pgMar")
                    for key in ("top", "bottom", "left", "right"):
                        if page[key+"_cm"] is not None:
                            set_values(margins, **{key: round(page[key+"_cm"]*1440/2.54)})
                if page["paper"] == "A4":
                    size = child(sect, "pgSz")
                    landscape = size.get(qn("orient")) == "landscape"
                    set_values(size, w=16838 if landscape else 11906, h=11906 if landscape else 16838)
            data = ET.tostring(root, encoding="UTF-8", xml_declaration=True, standalone=True)
            after = content_fingerprint(xml(data))
            if before != after:
                raise ValueError("正文结构校验未通过，已停止输出，请保留原稿并联系维护者。")
            with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
                for info in zin.infolist():
                    zout.writestr(info, data if info.filename == "word/document.xml" else zin.read(info.filename))
    except zipfile.BadZipFile as exc:
        raise ValueError("这不是有效的 .docx 文件；请先在 Word 中打开并另存为 .docx。") from exc
    return {"content_unchanged": True, "content_sha256": before, "formatted": dict(counts), "preserved": dict(skipped),
            "notes": ["正文内容结构校验通过；图片、关系、页眉页脚等其他文件部件按原字节保留。",
                      "目录页码可能随排版改变，请在 Word 中更新目录；未重新生成目录或引用编号。",
                      "无法可靠识别的封面普通段落可能按正文处理；请检查封面及复杂排版。"]}
