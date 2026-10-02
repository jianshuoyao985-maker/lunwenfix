import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from formatter import format_docx, xml, qn, NS, content_fingerprint
from rules import defaults, parse_message
from fixtures import package


class FormatterTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.src=Path(self.tmp.name)/'source.docx';self.out=Path(self.tmp.name)/'result.docx'
        self.src.write_bytes(package())

    def format(self,rules=None):
        self.report=format_docx(self.src,self.out,rules or defaults())
        with zipfile.ZipFile(self.out) as z:return xml(z.read('word/document.xml'))

    def test_preserves_content_and_every_other_member(self):
        root=self.format()
        with zipfile.ZipFile(self.src) as a,zipfile.ZipFile(self.out) as b:
            self.assertEqual(a.namelist(),b.namelist())
            for name in a.namelist():
                if name!='word/document.xml':self.assertEqual(a.read(name),b.read(name),name)
            self.assertEqual(content_fingerprint(xml(a.read('word/document.xml'))),content_fingerprint(root))
        self.assertTrue(self.report['content_unchanged'])
        self.assertEqual(root.nsmap['w14'],'http://schemas.microsoft.com/office/word/2010/wordml')

    def test_multiples_are_auto_not_exact(self):
        root=self.format()
        p=root.xpath('//w:p[w:r/w:t[contains(.,"2026年")]]',namespaces=NS)[0]
        spacing=p.find('w:pPr/w:spacing',NS)
        self.assertEqual(spacing.get(qn('lineRule')),'auto');self.assertEqual(spacing.get(qn('line')),'360')
        self.assertNotIn(qn('afterLines'),spacing.attrib)
        self.assertNotIn(qn('hangingChars'),p.find('w:pPr/w:ind',NS).attrib)
        self.assertIsNotNone(p.find('w:r/w:rPr/w:b',NS))
        self.assertIsNotNone(p.find('w:r/w:rPr/w:i',NS))
        self.assertEqual(p.find('w:hyperlink/w:r/w:rPr/w:sz',NS).get(qn('val')),'24')

    def test_exact_line_and_bold_false(self):
        root=self.format(parse_message('正文固定20磅行距，不要加粗')['rules'])
        p=root.xpath('//w:p[w:r/w:t[contains(.,"2026年")]]',namespaces=NS)[0]
        self.assertEqual(p.find('w:pPr/w:spacing',NS).get(qn('line')),'400')
        self.assertEqual(p.find('w:pPr/w:spacing',NS).get(qn('lineRule')),'exact')
        self.assertEqual(p.find('w:r/w:rPr/w:b',NS).get(qn('val')),'0')

    def test_heading_reference_and_data_classification(self):
        self.format(); counts=self.report['formatted']
        self.assertEqual(counts['heading2'],1);self.assertEqual(counts['heading3'],1)
        self.assertEqual(counts['reference'],2);self.assertEqual(counts['body'],1)
        self.assertEqual(counts['abstract'],1)

    def test_tables_and_toc_remain_untouched(self):
        root=self.format()
        self.assertIsNone(root.find('.//w:tc/w:p/w:pPr',NS))
        p=root.xpath('//w:p[w:r/w:t[text()="第一章 研究背景　1"]]',namespaces=NS)[0]
        self.assertIsNone(p.find('w:pPr',NS))

    def test_all_sections_and_orientation(self):
        r=defaults();r['page'].update(top_cm=2,paper='A4');root=self.format(r)
        sections=root.findall('.//w:sectPr',NS);self.assertEqual(len(sections),2)
        self.assertTrue(all(s.find('w:pgMar',NS).get(qn('top'))=='1134' for s in sections))
        self.assertEqual(sections[-1].find('w:pgSz',NS).get(qn('orient')),'landscape')
        self.assertEqual(sections[-1].find('w:pgMar',NS).get(qn('header')),'700')

    def test_explicit_table_format(self):
        root=self.format(parse_message('表格文字宋体五号')['rules'])
        self.assertEqual(root.find('.//w:tc/w:p/w:r/w:rPr/w:sz',NS).get(qn('val')),'21')

    def test_corrupt_file_and_macro_rejected(self):
        for data in [b'not zip',package(extra={'word/vbaProject.bin':b'abc'})]:
            self.src.write_bytes(data)
            with self.assertRaises(ValueError):self.format()

    def test_xml_entity_rejected(self):
        with self.assertRaises(ValueError):xml(b'<!DOCTYPE x [<!ENTITY t "x">]><x>&t;</x>')


if __name__ == '__main__':unittest.main()
