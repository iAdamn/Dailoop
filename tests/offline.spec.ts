import {test,expect} from '@playwright/test';

test.use({baseURL:'http://localhost:8795'});
test('exportación estática cargada permite crear, registrar, consultar y descargar sin red',async({page,context})=>{
  const external:string[]=[];
  context.on('request',request=>{if(/^https?:/.test(request.url())&&new URL(request.url()).origin!=='http://localhost:8795')external.push(request.url());});
  await context.route(/^https?:\/\//,route=>new URL(route.request().url()).origin==='http://localhost:8795'?route.continue():route.abort());
  await page.goto('/');
  await expect(page.getByRole('button',{name:'Crear mi primera actividad',exact:true})).toBeVisible();
  const fontFaces=await page.evaluate(async()=>{
    await document.fonts.ready;
    const faces:{family:string;status:string}[]=[];
    document.fonts.forEach(face=>faces.push({family:face.family.replace(/["']/g,''),status:face.status}));
    return faces;
  });
  for(const family of ['Outfit-SemiBold','Outfit-Bold','Manrope-Regular','Manrope-Medium','Manrope-SemiBold','Manrope-Bold']){
    expect(fontFaces,`La exportación debe cargar ${family} localmente antes de desconectar la red`).toContainEqual({family,status:'loaded'});
  }
  await expect(page.getByRole('heading',{name:'¿Qué quieres registrar?',exact:true})).toHaveCSS('font-family',/^['"]?Outfit-Bold['"]?(?:,|$)/);
  await expect(page.getByText('Las pequeñas cosas también tienen su historia.',{exact:true})).toHaveCSS('font-family',/^['"]?Manrope-Regular['"]?(?:,|$)/);
  await expect(page.getByRole('button',{name:'Crear mi primera actividad',exact:true}).getByText('Crear mi primera actividad',{exact:true})).toHaveCSS('font-family',/^['"]?Manrope-Bold['"]?(?:,|$)/);
  await context.setOffline(true);
  await page.getByRole('button',{name:'Crear mi primera actividad',exact:true}).click();
  await expect(page.getByLabel('Nombre de la actividad',{exact:true})).toHaveCSS('font-family',/^['"]?Manrope-Regular['"]?(?:,|$)/);
  await page.getByLabel('Nombre de la actividad',{exact:true}).fill('Lectura sin red');
  await page.getByRole('button',{name:'Crear actividad',exact:true}).click();
  await page.getByRole('button',{name:'Registrar Lectura sin red',exact:true}).click();
  await expect(page.getByText('✓ Registrado: Lectura sin red',{exact:true})).toBeVisible();
  await page.getByRole('tab',{name:'Estadísticas',exact:true}).click(); await page.getByRole('button',{name:'Ver historial',exact:true}).click();
  await expect(page.getByRole('button',{name:/Lectura sin red/}).first()).toBeVisible();
  await page.getByRole('tab',{name:'Ajustes',exact:true}).click();
  await page.getByRole('button',{name:'Crear backup completo',exact:true}).click();
  const download=page.waitForEvent('download');
  await page.getByRole('button',{name:'Guardar backup completo',exact:true}).click();
  expect((await download).suggestedFilename()).toMatch(/dailoop-backup/);
  expect(external).toEqual([]);
  await context.setOffline(false);
  await page.reload();
  await page.getByRole('tab',{name:'Registro',exact:true}).click();
  await expect(page.getByText(/1 registro hoy/)).toBeVisible();
});
