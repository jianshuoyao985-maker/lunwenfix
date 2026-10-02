"""Verify actual browser output using an independent XML parser."""
import sys
import zipfile
sys.path.insert(0, 'backend')
from formatter import xml, content_fingerprint, NS, qn
with zipfile.ZipFile('test-results/static-sample.docx') as source, zipfile.ZipFile('test-results/static-output.docx') as output:
    assert source.namelist() == output.namelist()
    for name in source.namelist():
        if name != 'word/document.xml':
            assert source.read(name) == output.read(name), name
    original, doc = xml(source.read('word/document.xml')), xml(output.read('word/document.xml'))
    assert content_fingerprint(original) == content_fingerprint(doc)
    def p(text):
        return next(p for p in doc.findall('.//w:p', NS) if ''.join(p.itertext()).startswith(text))
    body = p('2026年')
    assert body.find('w:pPr/w:spacing', NS).get(qn('lineRule')) == 'auto'
    assert body.find('w:pPr/w:spacing', NS).get(qn('line')) == '360'
    assert body.find('w:r/w:rPr/w:rFonts', NS).get(qn('eastAsia')) == '楷体'
    assert body.find('w:r/w:rPr/w:sz', NS).get(qn('val')) == '21'
    assert body.find('w:r/w:rPr/w:b', NS).get(qn('val')) == '0'
    assert body.find('w:r/w:rPr/w:i', NS) is not None
    assert body.find('w:hyperlink/w:r/w:rPr/w:sz', NS).get(qn('val')) == '21'
    assert p('第一章').find('w:r/w:rPr/w:sz', NS).get(qn('val')) == '36'
    assert p('1.1 研究').find('w:r/w:rPr/w:sz', NS).get(qn('val')) == '28'
    assert p('1.1.1').find('w:r/w:rPr/w:sz', NS).get(qn('val')) == '24'
    assert p('[1]').find('w:r/w:rPr/w:rFonts', NS).get(qn('eastAsia')) == '仿宋'
    assert p('表格原文').find('w:pPr', NS) is None
    assert len(doc.findall('.//w:sectPr', NS)) == 2
    assert doc.findall('.//w:pgSz', NS)[-1].get(qn('orient')) == 'landscape'
print('PASS: independent content fingerprint, unchanged package parts, font sizes, line spacing, explicit unbold, hyperlinks, heading hierarchy, references, preserved table and section orientation.')
