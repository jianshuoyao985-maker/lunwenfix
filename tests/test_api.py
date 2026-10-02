import io
import json
import sys
import tempfile
import time
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
import app as service
from rules import defaults
from fixtures import package


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.data=Path(self.tmp.name)
        self.data_patch=patch.object(service,'DATA_DIR',self.data);self.data_patch.start();self.addCleanup(self.data_patch.stop)
        self.converter=patch.object(service,'converter_path',return_value=None);self.converter.start();self.addCleanup(self.converter.stop)
        service.app.config['TESTING']=True
        self.client=service.app.test_client()

    def upload(self, endpoint='/api/convert', data=None):
        fields={'file':(io.BytesIO(package()),'中文论文.docx'),'rules':json.dumps(defaults()),'make_pdf':'1'}
        fields.update(data or {})
        return self.client.post(endpoint,data=fields,content_type='multipart/form-data')

    def test_word_survives_pdf_failure_and_chinese_filename(self):
        response=self.upload();self.assertEqual(response.status_code,200,response.json)
        result=response.json;self.assertEqual(result['status'],'ready');self.assertNotIn('pdf_url',result)
        self.assertTrue(any('Word 已保留' in x for x in result['warnings']))
        download=self.client.get(result['docx_url'])
        self.assertEqual(download.status_code,200)
        self.assertTrue(download.data.startswith(b'PK'))
        self.assertIn("filename*=UTF-8''",download.headers['Content-Disposition'])
        self.assertNotIn('source.docx', [p.name for p in (self.data/result['token']).iterdir()])
        self.assertTrue(result['report']['content_unchanged'])
        download.close()

    def test_ranges_and_head(self):
        result=self.upload().json
        response=self.client.get(result['docx_url'],headers={'Range':'bytes=0-99'})
        self.assertEqual(response.status_code,206);self.assertEqual(len(response.data),100);response.close()
        head=self.client.head(result['docx_url']);self.assertEqual(head.status_code,200);self.assertEqual(head.data,b'');head.close()

    def test_missing_chinese_fonts_keeps_word(self):
        with patch.object(service,'converter_path',return_value='/fake/soffice'),patch.object(service,'has_cjk_font',return_value=False):
            result=self.upload().json
            self.assertEqual(result['status'],'ready');self.assertNotIn('pdf_url',result)
            self.assertTrue(any('缺少中文字体' in w for w in result['warnings']))

    def test_expired_download_without_new_upload(self):
        result=self.upload().json;directory=self.data/result['token']
        meta=json.loads((directory/'meta.json').read_text());meta['expires_at']=time.time()-1
        service.write_meta(directory,meta)
        response=self.client.get(result['docx_url']);self.assertEqual(response.status_code,410)
        self.assertFalse(directory.exists())

    def test_cors_and_https_urls(self):
        with patch.object(service,'ALLOWED_ORIGINS',{'https://example.github.io'}),patch.object(service,'PUBLIC_BASE_URL','https://api.example.com'):
            response=self.client.get('/api/rules',headers={'Origin':'https://example.github.io'})
            self.assertEqual(response.headers['Access-Control-Allow-Origin'],'https://example.github.io')
            self.assertNotIn('Access-Control-Allow-Origin',self.client.get('/api/rules',headers={'Origin':'https://bad.example'}).headers)
            result=self.upload().json;self.assertTrue(result['docx_url'].startswith('https://api.example.com/'))
            preflight=self.client.options('/api/jobs',headers={'Origin':'https://example.github.io','Access-Control-Request-Method':'POST'})
            self.assertEqual(preflight.status_code,200)

    def test_async_job_finishes(self):
        response=self.upload('/api/jobs');self.assertEqual(response.status_code,202)
        result=response.json
        for _ in range(100):
            status=self.client.get(result['status_url']).json
            if status['status'] in {'ready','error'}:break
            time.sleep(.01)
        self.assertEqual(status['status'],'ready',status)
        self.assertIn('docx_url',status)

    def test_missing_and_private_source_routes(self):
        self.assertEqual(self.client.get('/files/anything/source.docx').status_code,404)
        result=self.upload().json
        self.assertEqual(self.client.get('/files/'+result['token']+'/source.docx').status_code,404)
        self.assertEqual(self.client.get('/files/'+result['token']+'/meta.json').status_code,404)

    def test_static_public_files_only(self):
        for path in ('/.env', '/.git/config', '/backend/app.py', '/backend/requirements.txt', '/docs/DEPLOY.md'):
            self.assertEqual(self.client.get(path).status_code,404,path)
        response=self.client.get('/config.js')
        self.assertEqual(response.status_code,200)
        self.assertIn(b'location.origin',response.data)
        for path in ('/', '/rules.js', '/formatter.js', '/local-files.js', '/jszip.min.js'):
            response=self.client.get(path)
            self.assertEqual(response.status_code,200,path)
            response.close()

    def test_zip_download_contains_documents(self):
        result=self.upload().json
        response=self.client.get(result['zip_url'])
        with zipfile.ZipFile(io.BytesIO(response.data)) as archive:
            self.assertIn('中文论文_格式整理.docx',archive.namelist());self.assertIn('格式处理说明.json',archive.namelist())
        response.close()

    def test_invalid_and_no_upload(self):
        self.assertEqual(self.client.post('/api/jobs').status_code,400)
        bad=self.upload(data={'file':(io.BytesIO(b'not docx'),'fake.docx')})
        self.assertEqual(bad.status_code,400);self.assertEqual(bad.json['status'],'error')
        self.assertFalse(list(self.data.glob('*/source*')))
        self.assertEqual(self.upload(data={'rules':'{"fake":1}'}).status_code,400)
        self.assertEqual(self.upload(data={'file':(io.BytesIO(b'abc'),'file.doc')}).status_code,400)

    def test_chat_and_ai_fallback(self):
        response=self.client.post('/api/chat',json={'message':'正文楷体小四','rules':defaults()})
        self.assertEqual(response.status_code,200);self.assertEqual(response.json['rules']['sections']['body']['font'],'楷体')
        with patch.dict('os.environ',{'LLM_API_URL':'','LLM_API_KEY':'','LLM_MODEL':''}):
            response=self.client.post('/api/chat',json={'message':'正文五号','use_ai':True})
            self.assertEqual(response.json['engine'],'local');self.assertTrue(response.json['warnings'])
        self.assertEqual(self.client.post('/api/chat',json={'message':None}).status_code,400)

    def test_pickup_page_escapes_filename(self):
        result=self.upload().json
        directory=self.data/result['token'];meta=json.loads((directory/'meta.json').read_text())
        meta['original_name']='</script><script>alert(1)</script>.docx';service.write_meta(directory,meta)
        response=self.client.get(result['share_url'])
        self.assertEqual(response.status_code,200)
        self.assertNotIn(b'</script><script>alert',response.data)
        self.assertIn(b'pickup.js',response.data)

    def test_stale_processing_recovery(self):
        result=self.upload().json
        directory=self.data/result['token'];meta=json.loads((directory/'meta.json').read_text())
        meta.update(status='processing',created_at=time.time()-1000);service.write_meta(directory,meta)
        self.assertEqual(self.client.get(result['status_url']).json['status'],'error')


if __name__ == '__main__':unittest.main()
