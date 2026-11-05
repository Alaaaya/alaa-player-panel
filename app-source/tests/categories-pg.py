"""Isolated local PostgreSQL tests. Never connects to a remote or live database."""
import subprocess,json,uuid,pathlib,os,re
DB=os.environ.get('CATEGORY_TEST_DB','categories_preview_20261028')
assert DB.startswith('categories_preview_')
args=['psql','-X','-v','ON_ERROR_STOP=1','-h','/home/kit/tmp/panel','-p','48761','-U','kit','-d',DB,'-At']
def sql(text,success=True):
 p=subprocess.run(args+['-c',text],capture_output=True,text=True)
 assert (p.returncode==0)==success,p.stderr
 if not success: return ''
 return p.stdout.strip().splitlines()[-1] if p.stdout.strip() else ''
admin=sql('select user_id from admins limit 1');other=str(uuid.uuid4());checks={}
def auth(text,user=admin):return "set role authenticated;select set_config('request.jwt.claim.sub','"+user+"',false);"+text
def generation(playlist):return sql(f"select category_provider_generation from playlists where id='{playlist}';")
def rpc(device,playlist,media,id,hidden,version=0,user=admin,provider_generation=None):
 return json.loads(sql(auth(f"select admin_set_category_hidden('{device}','{playlist}','{media}','{id}',{str(hidden).lower()},{version},'{provider_generation or generation(playlist)}');",user)))
a,b,p,q=[str(uuid.uuid4()) for _ in range(4)];token='a'*64;token2='b'*64;code=uuid.uuid4().hex[:12].upper();code2=uuid.uuid4().hex[:12].upper()
sql(f"insert into devices(id,device_code,active,app_type) values('{a}','{code}',true,'universe'),('{b}','{code2}',true,'alaa_player');insert into playlists(id,device_id,name,type,server,username,password) values('{p}','{a}','fixture','xtream','https://provider.invalid','dummy','not-real'),('{q}','{b}','fixture2','xtream','https://provider.invalid','dummy2','not-real');insert into device_private.tokens(device_id,token_hash) values('{a}',sha256(convert_to('{token}','UTF8'))),('{b}',sha256(convert_to('{token2}','UTF8')));")
def cfg(c,t):return json.loads(sql(f"set role anon;select get_device_config_v2('{c}','{t}');"))
def check(name,value):
 assert value,name
 checks[name]=True
try:
 check('default typed empty backwards compatible',cfg(code,token)['playlists'][0]['hidden_category_ids']=={'live':[],'vod':[],'series':[]})
 check('anon cannot read settings',sql('set role anon;select count(*) from device_category_settings;',False)=='')
 check('anon cannot execute delta RPC',sql(f"set role anon;select admin_set_category_hidden('{a}','{p}','live','7',true,0,'{generation(p)}');",False)=='')
 sql(auth(f"select admin_set_category_hidden('{a}','{p}','live','7',true,0,'{generation(p)}');",other),False);checks['authenticated nonadmin forbidden']=True
 check('authenticated nonadmin RLS sees nothing',sql(auth('select count(*) from device_category_settings;',other))=='0')
 initial_revision=cfg(code,token)['playlists'][0]['category_config_revision']
 check('typed opaque default revision',bool(re.fullmatch(r'hc1_[0-9a-f]{64}',initial_revision)))
 check('hide increments version',rpc(a,p,'live','7',True)=={'status':'saved','hidden':True,'version':1})
 changed_revision=cfg(code,token)['playlists'][0]['category_config_revision']
 check('hidden mutation invalidates config revision',changed_revision!=initial_revision)
 check('idempotent save keeps config revision',rpc(a,p,'live','7',True,1)['version']==1 and cfg(code,token)['playlists'][0]['category_config_revision']==changed_revision)
 check('overlap media IDs independent',rpc(a,p,'vod','7',True)['status']=='saved')
 check('cross device playlist denied',rpc(b,p,'live','7',True)['status']=='not_found')
 check('unrelated device untouched',cfg(code2,token2)['playlists'][0]['hidden_category_ids']=={'live':[],'vod':[],'series':[]})
 check('wrong token config does not include settings',cfg(code,token2)=={'status':'unauthorized'})
 sql(auth(f"update device_category_settings set hidden_category_ids='{{}}' where playlist_id='{p}';"),False);checks['admin direct stale object writes forbidden']=True
 check('stale same-row conflict',rpc(a,p,'live','7',False,0)=={'status':'conflict','hidden':True,'version':1})
 check('show preserves other media type',rpc(a,p,'live','7',False,1)['version']==2 and cfg(code,token)['playlists'][0]['hidden_category_ids']['vod']==['7'])
 check('leading zero string preserved',rpc(a,p,'series','007',True)['status']=='saved' and cfg(code,token)['playlists'][0]['hidden_category_ids']['series']==['007'])
 check('invalid media and ID rejected',rpc(a,p,'bad','7',True)['status']=='invalid' and rpc(a,p,'live','not-an-id',True)['status']=='invalid')
 check('idempotent expected-version write no increment',rpc(a,p,'live','7',False,2)['version']==2)
 # Two real DB connections. B waits for A, then applies only its leaf delta.
 def race(first,second):
  proc=subprocess.Popen(args,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
  proc.stdin.write('begin;'+auth(first)+"\n\\echo LOCKED\n");proc.stdin.flush()
  while proc.stdout.readline().strip()!='LOCKED': assert proc.poll() is None
  contender=subprocess.Popen(args+['-c',auth(second)],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  proc.stdin.write('select pg_sleep(0.2);commit;\n\\q\n');proc.stdin.flush();proc.communicate(timeout=20);out,err=contender.communicate(timeout=20);assert proc.returncode==0 and contender.returncode==0,err
  return json.loads(out.strip().splitlines()[-1])
 r=race(f"select admin_set_category_hidden('{a}','{p}','live','8',true,0,'{generation(p)}');",f"select admin_set_category_hidden('{a}','{p}','series','8',true,0,'{generation(p)}');")
 config=cfg(code,token)['playlists'][0]
 check('concurrent different types preserved',config['hidden_category_ids']['live']==['8'] and set(config['hidden_category_ids']['series'])=={'007','8'})
 r=race(f"select admin_set_category_hidden('{a}','{p}','vod','9',true,0,'{generation(p)}');",f"select admin_set_category_hidden('{a}','{p}','vod','9',false,0,'{generation(p)}');")
 check('concurrent same category stale write conflicts',r['status']=='conflict' and r['hidden'] is True)
 sql(f"update devices set active=false where id='{a}';")
 check('inactive config no hidden/provider fields','playlists' not in cfg(code,token))
 sql(f"update devices set active=true,expires_at=now()-interval '1 hour' where id='{a}';")
 check('expired config no hidden/provider fields',cfg(code,token)['status']=='expired' and 'playlists' not in cfg(code,token))
 old_generation=generation(p)
 sql(f"update devices set expires_at=null where id='{a}';update playlists set password='new-dummy' where id='{p}';")
 check('replacement rotates provider generation',generation(p)!=old_generation)
 check('stale version-zero old-provider write denied',rpc(a,p,'live','1',True,0,provider_generation=old_generation)['status']=='provider_changed')
 check('provider replacement clears old IDs',cfg(code,token)['playlists'][0]['hidden_category_ids']=={'live':[],'vod':[],'series':[]})
 rpc(a,p,'live','1',True)
 sql(f"update playlists set device_id='{b}' where id='{p}';")
 check('reassignment never transfers prior device settings',sql(f"select count(*) from device_category_settings where playlist_id='{p}';")=='0')
 rpc(b,p,'live','1',True)
 sql(auth(f"select admin_delete_device('{b}');"))
 check('delete cascades settings and token',sql(f"select count(*) from device_category_settings where device_id='{b}';")=='0' and cfg(code2,token2)=={'status':'unauthorized'})
 out=pathlib.Path('/home/kit/tmp/panel/categories-preview/local-pg-tests.json');out.write_text(json.dumps({'passed':True,'checks':checks,'environment':'isolated local PostgreSQL16 restored current schema, no live changes'},indent=2))
 print('PASS',len(checks),'isolated PostgreSQL security and concurrency assertions')
finally:
 sql(f"delete from playlists where device_id in ('{a}','{b}');delete from devices where id in ('{a}','{b}');")
