"""Local isolated PostgreSQL gateway tests. No remote connections, no owner mutations."""
import os,subprocess,json,concurrent.futures,uuid,pathlib
DB=os.environ.get('CATEGORY_TEST_DB','categories_preview_production_20261028')
assert DB.startswith('categories_preview_')
args=['psql','-X','-v','ON_ERROR_STOP=1','-h','/home/kit/tmp/panel','-p','48761','-U','kit','-d',DB,'-At']
def sql(q,ok=True):
 p=subprocess.run(args+['-c',q],capture_output=True,text=True)
 assert (p.returncode==0)==ok,p.stderr
 return p.stdout.strip().splitlines()[-1] if ok and p.stdout.strip() else ''
admin=sql('select user_id from admins limit 1')
other=str(uuid.uuid4());secret='test-only-private-gateway-secret'
checks={}
def check(n,v): assert v,n;checks[n]=True
def auth(q,user=admin):return "set role authenticated;select set_config('request.jwt.claim.sub','"+user+"',false);"+q
def acquire(user=admin,token=secret):return json.loads(sql(auth("select category_gateway_acquire('"+token+"');",user)))
def release(id,user=admin):sql(auth("select category_gateway_release('"+secret+"','"+id+"');",user))
def reset():sql('truncate device_private.category_gateway_budgets,device_private.category_gateway_leases;')
sql("insert into device_private.category_gateway_secret(token_hash) values(sha256(convert_to('"+secret+"','UTF8')));")
try:
 sql("set role anon;select category_gateway_acquire('"+secret+"');",False);checks['anonymous cannot execute']=True
 sql(auth("select category_gateway_acquire('"+secret+"');",other),False);checks['authenticated nonadmin denied']=True
 sql(auth("select category_gateway_acquire('wrong');"),False);checks['admin missing server secret denied']=True
 for table in ['category_gateway_secret','category_gateway_budgets','category_gateway_leases']:
  sql(auth('select * from device_private.'+table+';'),False);checks['admin cannot read '+table]=True
 reset()
 with concurrent.futures.ThreadPoolExecutor(max_workers=16) as ex:r=list(ex.map(lambda _:acquire(),range(16)))
 check('cross-connection concurrent global leases capped at eight',sum(x['status']=='admitted' for x in r)==8)
 check('no budget charges for denied lease requests',sql("select hits from device_private.category_gateway_budgets where scope='global'")=='8')
 for x in r:
  if x['status']=='admitted':release(x['lease_id'])
 check('release drops lease not durable budget',sql("select count(*) from device_private.category_gateway_leases")=='0' and sql("select hits from device_private.category_gateway_budgets where scope='global'")=='8')
 for i in range(12):
  x=acquire();check('admission '+str(i),x['status']=='admitted');release(x['lease_id'])
 check('new connections cannot reset durable peradmin budget',acquire()['status']=='rate_limited')
 sql("update device_private.category_gateway_budgets set expires_at=now()-interval '1 second';")
 x=acquire();check('expired budget reset by database clock',x['status']=='admitted')
 sql("update device_private.category_gateway_leases set expires_at=now()-interval '1 second';")
 y=acquire();check('crash orphan lease pruned without resetting budget',y['status']=='admitted' and sql("select hits from device_private.category_gateway_budgets where scope='global'")=='2')
 release(y['lease_id'])
 reset()
 # Create isolated local-only fixture admin identities, never owner record updates.
 fixture_admins=[str(uuid.uuid4()) for _ in range(3)]
 for uid in fixture_admins:
  sql("insert into auth.users(id,email) values('"+uid+"','gateway-fixture-"+uid+"@example.invalid');insert into public.admins(user_id) values('"+uid+"');")
 try:
  x=acquire(fixture_admins[0]);release(x['lease_id'],fixture_admins[1])
  check('different real admin cannot release known lease',sql("select count(*) from device_private.category_gateway_leases where id='"+x['lease_id']+"'")=='1')
  release(x['lease_id'],fixture_admins[0]);reset()
  def sequence(uid):
   for _ in range(20):
    while True:
     x=acquire(uid)
     if x['status']=='admitted':break
     # Retry capacity rejection only; budgets are bounded and each user has20 attempts.
     raise AssertionError('unexpected admission rejection')
    release(x['lease_id'],uid)
  with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:list(ex.map(sequence,fixture_admins))
  check('three concurrent real admins share global sixty budget',sql("select hits from device_private.category_gateway_budgets where scope='global'")=='60' and acquire()['status']=='rate_limited')
  before=sql("select sum(hits) from device_private.category_gateway_budgets")
  for token in ['', 'wrong', 'x'*257]:
   sql(auth("select category_gateway_acquire('"+token+"');"),False)
  sql(auth("select category_gateway_acquire(null);"),False)
  check('malformed missing oversized secret leaves budgets unchanged',sql("select sum(hits) from device_private.category_gateway_budgets")==before)
 finally:
  reset()
  for uid in fixture_admins:sql("delete from public.admins where user_id='"+uid+"';delete from auth.users where id='"+uid+"';")
 # Simulate a global budget filled by other legitimate admins, no new identities needed.
 sql("insert into device_private.category_gateway_budgets values('global',now()+interval '60 seconds',60);")
 check('global limit applies even when current admin has no user budget',acquire()['status']=='rate_limited')
 check('global rejection does not create arbitrary budgets',sql('select count(*) from device_private.category_gateway_budgets')=='1')
 out={'passed':True,'checks':checks,'environment':'isolated local PG16, fixture secret, no production calls'}
 pathlib.Path('/home/kit/tmp/panel/gateway-pg-tests.json').write_text(json.dumps(out,indent=2))
 print('PASS',len(checks),'durable gateway PG assertions')
finally:
 reset();sql('truncate device_private.category_gateway_secret;')
