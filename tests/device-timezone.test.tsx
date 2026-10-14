import { spawnSync } from 'node:child_process';

/** Real packaged FormatJS runs in a separate process. Jest's native Intl is
 * deliberately not used as evidence for the Android formatter boundary. */
test('packaged Intl accepts OS GMT aliases after bootstrap and session normalization without changing saved settings', () => {
  const script = `
    const fs=require('node:fs'),ts=require('typescript'),{randomUUID}=require('node:crypto');
    require('@formatjs/intl-datetimeformat/polyfill-force.js');
    require('@formatjs/intl-datetimeformat/locale-data/en.js');
    require('@formatjs/intl-datetimeformat/locale-data/es.js');
    require('@formatjs/intl-datetimeformat/add-all-tz.js');
    const helper=require('./src/infrastructure/deviceTimeZone.ts');
    const domain=require('./src/domain/index.ts');
    const compile=path=>ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const bootstrap=compile('src/bootstrap.native.ts'),sessionSource=compile('src/infrastructure/session.ts');
    let originalFailure;
    try{Intl.DateTimeFormat.__setDefaultTimeZone('GMT');}catch(error){originalFailure=error.message;}
    async function scenario(reported,existingZone){
      const localization={getCalendars:()=>[{timeZone:reported}]};
      new Function('require','module','exports',bootstrap)(name=>name==='expo-localization'?localization:name==='./infrastructure/deviceTimeZone'?helper:require(name),{exports:{}},{});
      const defaultZone=new Intl.DateTimeFormat().resolvedOptions().timeZone;
      let openedZone,stored,writes=0;
      const deps={
        '../version':{APP_VERSION:'0.5.0'},'react-native':{Platform:{OS:'android'}},'expo-localization':localization,
        './deviceTimeZone':helper,'../domain':domain,
        './store':{DailoopStore:{open:async(mode,zone)=>{
          openedZone=zone;
          stored=domain.createEmptyState({databaseId:randomUUID(),nowMs:Date.now(),zone:existingZone||zone});
          return{mode,label:'native',recoveryRequired:false,snapshot:async()=>stored,close:async()=>{},dispatch:async()=>{writes++;}};
        }},RECOVERY_MESSAGE:'Recovery required'},
        './crypto':{uuid:randomUUID,digest:async()=>''},'./files':{cleanExportCache:()=>{}}
      };
      const module={exports:{}};
      new Function('require','module','exports','globalThis',sessionSource)(name=>{
        if(!(name in deps))throw new Error('Unexpected dependency '+name);return deps[name];
      },module,module.exports,{});
      await module.exports.session.openMode('personal');
      return{reported,defaultZone,openedZone,storedZone:module.exports.session.snapshot.state.settings.zone,writes};
    }
    (async()=>{
      const cases=[];
      for(const zone of ['GMT','GMT+00:00','GMT-0000','Etc/GMT','Etc/UTC','America/Bogota','Custom/Unsupported',null])cases.push(await scenario(zone));
      cases.push(await scenario('GMT','America/Bogota'));
      console.log(JSON.stringify({originalFailure,cases}));
    })().catch(error=>{console.error(error);process.exitCode=1;});
  `;
  const child = spawnSync(process.execPath, ['--import', 'tsx', '-e', script], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 20_000,
  });
  expect(child.status).toBe(0);
  expect(child.stderr).toBe('');
  const result = JSON.parse(child.stdout.trim());
  expect(result.originalFailure).toBe('Invalid timeZoneName');
  const expected = ['UTC', 'UTC', 'UTC', 'UTC', 'UTC', 'America/Bogota', 'UTC', 'America/Bogota', 'UTC'];
  for (const [index, item] of result.cases.entries()) {
    expect(item.defaultZone).toBe(expected[index]);
    expect(item.openedZone).toBe(expected[index]);
    expect(item.storedZone).toBe(index === 8 ? 'America/Bogota' : expected[index]);
    expect(item.writes).toBe(0);
  }
});
