/** Incremental Expo prebuild must remove obsolete permission tombstones without
 * overriding the app's current privacy restrictions. */
let mockManifestMod:((result:any)=>any)|undefined;
jest.mock('expo/config-plugins',()=>({withAndroidManifest:(config:unknown,mod:(result:any)=>any)=>{mockManifestMod=mod;return config;},withDangerousMod:(config:unknown)=>config,withAppBuildGradle:(config:unknown)=>config,withGradleProperties:(config:unknown)=>config}));
const plugin=jest.requireActual('../plugins/withAndroidRelease.cjs');
test('explicit widget permissions replace stale remove markers while current blocked permissions remain blocked',()=>{
 plugin({android:{permissions:['android.permission.WAKE_LOCK','android.permission.FOREGROUND_SERVICE','android.permission.USE_BIOMETRIC'],blockedPermissions:['android.permission.USE_BIOMETRIC']}});
 const permission=(name:string)=>({$:{'android:name':name,'tools:node':'remove'}});
 const wake=permission('android.permission.WAKE_LOCK'),biometric=permission('android.permission.USE_BIOMETRIC'),unrequested=permission('android.permission.READ_EXTERNAL_STORAGE');
 const result={modResults:{manifest:{application:[{$:{}}],'uses-permission':[wake,biometric,unrequested]}}};
 mockManifestMod!(result);expect(wake.$['tools:node']).toBeUndefined();expect(biometric.$['tools:node']).toBe('remove');expect(unrequested.$['tools:node']).toBe('remove');
 mockManifestMod!(result);expect(wake.$['tools:node']).toBeUndefined();
});

