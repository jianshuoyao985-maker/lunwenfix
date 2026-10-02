"""Small real OOXML packages; fixtures contain no user documents."""
import io
import zipfile

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
M = "http://schemas.openxmlformats.org/officeDocument/2006/math"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


def package(body=None, extra=None):
    if body is None:
        body = '''<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>测试论文：组织行为</w:t></w:r></w:p>
        <w:p><w:r><w:t>摘要</w:t></w:r></w:p>
        <w:p><w:r><w:t>这里是摘要内容。</w:t></w:r></w:p>
        <w:p><w:r><w:t>关键词：组织；协作</w:t></w:r></w:p>
        <w:p><w:pPr><w:pStyle w:val="CustomChapter"/></w:pPr><w:r><w:t>第一章 研究背景</w:t></w:r></w:p>
        <w:p><w:r><w:t>1.1 研究方法</w:t></w:r></w:p>
        <w:p><w:r><w:t>1.1.1 分析过程</w:t></w:r></w:p>
        <w:p><w:pPr><w:ind w:hangingChars="100"/><w:spacing w:afterLines="100"/></w:pPr><w:r><w:rPr><w:b/><w:i/></w:rPr><w:t>2026年收集数据，3.14是一个数值。</w:t></w:r><w:hyperlink r:id="rIdLink"><w:r><w:t>来源链接</w:t></w:r></w:hyperlink></w:p>
        <w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="4000"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>表格原文</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
        <w:p><m:oMath><m:r><m:t>x²+y²=z²</m:t></m:r></m:oMath></w:p>
        <w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> TOC \\o "1-3" </w:instrText></w:r></w:p>
        <w:p><w:r><w:t>第一章 研究背景　1</w:t></w:r></w:p>
        <w:p><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>
        <w:p><w:pPr><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1000" w:bottom="1000" w:left="1000" w:right="1000"/></w:sectPr></w:pPr></w:p>
        <w:p><w:r><w:t>参考文献</w:t></w:r></w:p>
        <w:p><w:r><w:t>[1] 王某. 组织研究[J]. 测试期刊,2025.</w:t></w:r></w:p>
        <w:p><w:r><w:t>Smith. Research methods, 2024.</w:t></w:r></w:p>
        <w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="1000" w:bottom="1000" w:left="1000" w:right="1000" w:header="700" w:footer="800"/></w:sectPr>'''
    doc = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="{W}" xmlns:r="{R}" xmlns:m="{M}" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" mc:Ignorable="w14"><w:body>{body}</w:body></w:document>'''
    types = '''<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/></Types>'''
    rels = f'''<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="{R}/officeDocument" Target="word/document.xml"/></Relationships>'''
    docrels = f'''<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="{R}/styles" Target="styles.xml"/><Relationship Id="rIdHeader" Type="{R}/header" Target="header1.xml"/><Relationship Id="rIdLink" Type="{R}/hyperlink" Target="https://example.com" TargetMode="External"/></Relationships>'''
    styles = f'''<w:styles xmlns:w="{W}"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="CustomChapter"><w:name w:val="学校章标题"/><w:basedOn w:val="Heading1"/></w:style></w:styles>'''
    members = {"[Content_Types].xml":types, "_rels/.rels":rels, "word/document.xml":doc,
               "word/styles.xml":styles, "word/_rels/document.xml.rels":docrels,
               "word/header1.xml": f'<w:hdr xmlns:w="{W}"><w:p><w:r><w:t>原始页眉</w:t></w:r></w:p></w:hdr>',
               "customXml/item1.xml": '<data>original metadata</data>'}
    members.update(extra or {})
    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, data in members.items(): archive.writestr(name, data)
    return out.getvalue()
