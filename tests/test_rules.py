import copy
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from rules import defaults, parse_message, validate_rules


class RuleTests(unittest.TestCase):
    def test_separate_scopes(self):
        r = parse_message('正文宋体小四，1.5倍行距，首行缩进2个字；一级标题黑体三号居中；二级标题楷体四号；参考文献仿宋五号')['rules']['sections']
        self.assertEqual((r['body']['font'], r['body']['size']), ('宋体',12))
        self.assertEqual((r['heading1']['font'], r['heading1']['size']), ('黑体',16))
        self.assertEqual(r['heading2']['font'],'楷体')
        self.assertEqual((r['reference']['font'], r['reference']['size']), ('仿宋',10.5))

    def test_multiturn_patch_only(self):
        a = parse_message('一级标题黑体小二，段前24磅')
        b = parse_message('再改成四号，不要加粗', a['rules'], a['context'])
        self.assertEqual(b['rules']['sections']['heading1']['size'],14)
        self.assertFalse(b['rules']['sections']['heading1']['bold'])
        self.assertEqual(b['rules']['sections']['heading1']['space_before'],24)
        self.assertEqual(b['rules']['sections']['body'],a['rules']['sections']['body'])

    def test_spacing_variants(self):
        for text, mode, value in [('1.5倍行距','multiple',1.5),('一倍半行距','multiple',1.5),('两倍行距','multiple',2),('单倍行距','multiple',1),('行距固定值20磅','exact',20),('最小行距24磅','atLeast',24)]:
            with self.subTest(text=text):
                r=parse_message('正文'+text)['rules']['sections']['body']
                self.assertEqual(r['line'],dict(mode=mode,value=value))
                self.assertEqual(r['size'],12)

    def test_all_chinese_sizes(self):
        for text,value in [('小四号',12),('四号',14),('小三',15),('三号',16),('小五',9),('五号',10.5),('小一号',24)]:
            with self.subTest(text=text): self.assertEqual(parse_message('正文'+text)['rules']['sections']['body']['size'],value)

    def test_last_instruction_wins(self):
        r=parse_message('正文宋体小四，正文改成楷体五号')['rules']['sections']['body']
        self.assertEqual((r['font'],r['size']),('楷体',10.5))

    def test_negative_alternative(self):
        self.assertEqual(parse_message('正文不要黑体，改用宋体')['rules']['sections']['body']['font'],'宋体')
        self.assertEqual(parse_message('正文不要用黑体')['changes'],[])
        self.assertEqual(parse_message('正文不要左对齐改成居中')['rules']['sections']['body']['align'],'center')

    def test_other_unchanged(self):
        r=parse_message('正文改成五号，其它保持不变')['rules']
        self.assertTrue(r['sections']['body']['enabled'])
        self.assertEqual(r['sections']['body']['size'],10.5)
        self.assertEqual(r['sections']['heading1'], defaults()['sections']['heading1'])

    def test_joint_headings(self):
        r=parse_message('一级标题和二级标题都用黑体四号')['rules']['sections']
        self.assertEqual(r['heading1']['size'],14);self.assertEqual(r['heading2']['size'],14)
        self.assertEqual(r['heading3']['size'],12)

    def test_english_font(self):
        r=parse_message('正文宋体小四，英文和数字用Arial')['rules']['sections']['body']
        self.assertEqual((r['font'],r['latin_font']),('宋体','Arial'))

    def test_margin_units(self):
        r=parse_message('上边距2厘米，下边距3厘米，左边距25mm，右边距1inch')['rules']['page']
        self.assertEqual([r[k] for k in ('top_cm','bottom_cm','left_cm','right_cm')],[2,3,2.5,2.54])
        r=parse_message('页边距上下2.5厘米，左右3厘米')['rules']['page']
        self.assertEqual([r[k] for k in ('top_cm','bottom_cm','left_cm','right_cm')],[2.5,2.5,3,3])
        self.assertEqual(parse_message('页边距统一2厘米')['rules']['page']['left_cm'],2)

    def test_unsupported_visible(self):
        for text in ['按上海师范大学的格式','页眉写我的学校','插入三线表','摘要标题黑体三号']:
            with self.subTest(text=text):
                r=parse_message(text);self.assertTrue(r['warnings']);self.assertEqual(r['changes'],[])

    def test_preserve_scope(self):
        self.assertFalse(parse_message('正文保持原样')['rules']['sections']['body']['enabled'])
        self.assertIsNone(parse_message('页边距保持不变')['rules']['page']['top_cm'])

    def test_invalid_numbers_rejected(self):
        for val in [float('nan'),float('inf'),True,'12',-1,1000]:
            r=defaults();r['sections']['body']['size']=val
            with self.subTest(val=val),self.assertRaises(ValueError):validate_rules(r)

    def test_empty_and_long_text(self):
        for text in ['',None,'x'*6001]:
            with self.assertRaises(ValueError):parse_message(text)


if __name__ == '__main__':unittest.main()
